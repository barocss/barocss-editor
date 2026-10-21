import { createHash } from 'node:crypto';
import type { DocumentHead, DocumentReceipt } from '@barocss/office-service/document-store';
import { isRegistryUuid, validateRegistryBundle } from '@barocss/schema/registry-contract';
import { McpBundleReadError, schemaServerOrigin, type McpReadConfig } from './mcp-bundle-reader.js';

export interface McpAdoption {
  tenantId: string;
  documentId: string;
  expectedRevision: number;
  expectedSnapshotHash: string;
  expectedPriorPinDigest: string;
  snapshotText: string;
  idempotencyKey: string;
}

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hex = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const headKeys = ['documentId', 'tenantId', 'workspaceId', 'product', 'title', 'creatorUserId',
  'metadataRevision', 'mode', 'pageId', 'documentKey', 'fileFormat', 'fileVersion', 'revision', 'snapshotHash'];
const inputKeys = ['tenantId', 'documentId', 'expectedRevision', 'expectedSnapshotHash',
  'expectedPriorPinDigest', 'snapshotText', 'idempotencyKey'];
const receiptKeys = ['operation', 'idempotencyKey', 'requestHash', 'document', 'snapshotText'];

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function checkedInput(input: McpAdoption) {
  if (!record(input) || !exactKeys(input, inputKeys) || !isRegistryUuid(input.tenantId) ||
    !isRegistryUuid(input.documentId) || !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1 || input.expectedRevision >= Number.MAX_SAFE_INTEGER ||
    !hex(input.expectedSnapshotHash) || !hex(input.expectedPriorPinDigest) ||
    typeof input.snapshotText !== 'string' || Buffer.byteLength(input.snapshotText, 'utf8') > 524288 ||
    typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(input.idempotencyKey)) {
    throw new McpBundleReadError('invalid_request');
  }
  return { schemaAction: 'adopt' as const, expectedRevision: input.expectedRevision,
    expectedSnapshotHash: input.expectedSnapshotHash, expectedPriorPinDigest: input.expectedPriorPinDigest,
    snapshotText: input.snapshotText, idempotencyKey: input.idempotencyKey };
}

function checkedHead(value: unknown, input: McpAdoption): value is DocumentHead {
  if (!record(value) || !exactKeys(value, headKeys)) return false;
  return value.documentId === input.documentId && value.tenantId === input.tenantId &&
    isRegistryUuid(value.workspaceId) && value.product === 'note' && value.fileFormat === 'barocss-note' &&
    value.fileVersion === 2 && value.mode === 'snapshot' && typeof value.title === 'string' &&
    (value.creatorUserId === null || isRegistryUuid(value.creatorUserId)) &&
    Number.isSafeInteger(value.metadataRevision) && (value.metadataRevision as number) >= 1 &&
    isRegistryUuid(value.pageId) && value.documentKey === `wonffice-${input.tenantId}-${input.documentId}` &&
    value.revision === input.expectedRevision + 1 && value.snapshotHash === sha(input.snapshotText);
}

function verifyReceipt(value: unknown, input: McpAdoption): DocumentReceipt {
  if (!record(value) || !exactKeys(value, receiptKeys) || value.operation !== 'update' ||
    value.idempotencyKey !== input.idempotencyKey || value.snapshotText !== input.snapshotText ||
    !checkedHead(value.document, input)) throw new McpBundleReadError('invalid_service_response');
  const document = value.document;
  const expectedHash = sha(JSON.stringify(['note-native2-snapshot-v1', input.tenantId,
    document.workspaceId, input.documentId, 'adopt', input.expectedRevision,
    input.expectedSnapshotHash, input.expectedPriorPinDigest, input.snapshotText]));
  if (value.requestHash !== expectedHash) throw new McpBundleReadError('invalid_service_response');
  let envelope: unknown;
  try { envelope = JSON.parse(input.snapshotText); }
  catch { throw new McpBundleReadError('invalid_service_response'); }
  if (!record(envelope) || envelope.format !== 'barocss-note' || envelope.version !== 2 ||
    !record(envelope.document) || !record(envelope.document.attributes) ||
    envelope.document.attributes.pageId !== document.pageId) throw new McpBundleReadError('invalid_service_response');
  try {
    const checked = validateRegistryBundle(envelope.schemaBundle);
    if (checked.selectedDefinitions.some(definition => definition.scope.tenantId !== input.tenantId ||
      definition.scope.workspaceId !== document.workspaceId)) throw new Error('scope mismatch');
  } catch { throw new McpBundleReadError('invalid_service_response'); }
  return value as unknown as DocumentReceipt;
}

function denied(status: number, value: unknown): string {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'scope_forbidden';
  if (status === 404) return 'not_found';
  if ([400, 409, 413, 422].includes(status) && record(value) && typeof value.status === 'string' &&
    /^[a-z][a-z0-9_]{0,63}$/.test(value.status)) return value.status;
  return 'schema_service_unavailable';
}

async function boundedJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  if (!response.body) throw new McpBundleReadError('invalid_service_response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new McpBundleReadError('cancelled');
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 2 * 1024 * 1024) throw new McpBundleReadError('response_too_large');
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown; }
  catch { throw new McpBundleReadError('invalid_service_response'); }
}

/** Forward one fixed adoption attempt; the HTTP service alone performs CAS and writes its receipt. */
export async function adoptSchema(config: McpReadConfig, input: McpAdoption,
  signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<DocumentReceipt> {
  const body = checkedInput(input);
  const origin = schemaServerOrigin(config.baseUrl);
  const token = config.bearerToken;
  if (!token || token.length > 8000 || !/^[A-Za-z0-9_.-]+$/.test(token)) {
    throw new McpBundleReadError('unauthorized');
  }
  let response: Response;
  try {
    response = await fetcher(`${origin}/v1/tenants/${input.tenantId}/note-native2/documents/${input.documentId}/snapshot`, {
      method: 'PUT', headers: { authorization: `Bearer ${token}`, accept: 'application/json',
        'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]),
    });
  } catch { throw new McpBundleReadError(signal?.aborted ? 'cancelled' : 'schema_service_unavailable'); }
  try {
    if ([401, 403, 404].includes(response.status) || response.status >= 500) {
      throw new McpBundleReadError(denied(response.status, undefined));
    }
    const value = await boundedJson(response, signal);
    if (!response.ok) throw new McpBundleReadError(denied(response.status, value));
    return verifyReceipt(value, input);
  } catch (error) {
    if (error instanceof McpBundleReadError) throw error;
    throw new McpBundleReadError(signal?.aborted ? 'cancelled' : 'schema_service_unavailable');
  } finally { await response.body?.cancel().catch(() => { /* Already consumed or closed. */ }); }
}
