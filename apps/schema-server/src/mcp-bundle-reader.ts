import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { DocumentHead } from '@barocss/office-service/document-store';
import { isRegistryUuid, validateRegistryBundle, type RegistryBundle } from '@barocss/schema/registry-contract';

const responseLimit = 2 * 1024 * 1024;
const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const headKeys = ['documentId', 'tenantId', 'workspaceId', 'product', 'title', 'creatorUserId',
  'metadataRevision', 'mode', 'pageId', 'documentKey', 'fileFormat', 'fileVersion', 'revision', 'snapshotHash'];
function documentHead(value: unknown, tenantId: string, documentId: string): value is DocumentHead {
  if (!record(value)) return false;
  return Object.keys(value).length === headKeys.length && headKeys.every(key => Object.hasOwn(value, key)) &&
    value.tenantId === tenantId && value.documentId === documentId && isRegistryUuid(value.workspaceId) &&
    value.product === 'note' && value.fileFormat === 'barocss-note' && value.fileVersion === 2 &&
    value.mode === 'snapshot' && typeof value.title === 'string' &&
    (value.creatorUserId === null || isRegistryUuid(value.creatorUserId)) &&
    typeof value.metadataRevision === 'number' && Number.isSafeInteger(value.metadataRevision) && value.metadataRevision >= 1 &&
    typeof value.pageId === 'string' && value.pageId.length > 0 && typeof value.documentKey === 'string' &&
    typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 1 &&
    typeof value.snapshotHash === 'string' && /^[0-9a-f]{64}$/.test(value.snapshotHash);
}

export class McpBundleReadError extends Error {
  constructor(public readonly reason: string) { super(reason); }
}

export interface McpReadConfig { baseUrl: string; bearerToken?: string }
export interface ExactDocumentBundle {
  status: 'pinned';
  document: DocumentHead;
  snapshotText: string;
  documentRevision: number;
  snapshotHash: string;
  nativeFormat: { format: 'barocss-note'; version: 2 };
  bundle: RegistryBundle;
}

export function schemaServerOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new McpBundleReadError('invalid_configuration'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    (value !== url.origin && value !== url.origin + '/')) {
    throw new McpBundleReadError('invalid_configuration');
  }
  return url.origin;
}

function upstreamStatus(status: number, value: unknown): string {
  const named = record(value) && typeof value.status === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value.status)
    ? value.status : undefined;
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'scope_forbidden';
  if (status === 404) return 'not_found';
  if (status === 413) return 'response_too_large';
  if (status === 409 || status === 422) return named ?? 'document_unavailable';
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
      if (size > responseLimit) throw new McpBundleReadError('response_too_large');
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown; }
  catch { throw new McpBundleReadError('invalid_service_response'); }
}

async function getJson(url: string, token: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]) });
  } catch {
    throw new McpBundleReadError(signal?.aborted ? 'cancelled' : 'schema_service_unavailable');
  }
  try {
    if ([401, 403, 404, 413].includes(response.status) || response.status >= 500) {
      throw new McpBundleReadError(upstreamStatus(response.status, undefined));
    }
    const value = await boundedJson(response, signal);
    if (!response.ok) throw new McpBundleReadError(upstreamStatus(response.status, value));
    return value;
  } catch (error) {
    if (error instanceof McpBundleReadError) throw error;
    throw new McpBundleReadError(signal?.aborted ? 'cancelled' : 'schema_service_unavailable');
  } finally { await response.body?.cancel().catch(() => { /* Already consumed or closed. */ }); }
}

/** Read two independently authorized routes and reject a torn or altered pair. */
export async function readExactDocumentBundle(config: McpReadConfig, tenantId: string, documentId: string,
  signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<ExactDocumentBundle> {
  if (!isRegistryUuid(tenantId) || !isRegistryUuid(documentId)) throw new McpBundleReadError('invalid_request');
  const origin = schemaServerOrigin(config.baseUrl);
  const token = config.bearerToken;
  if (!token || token.length > 8000 || !/^[A-Za-z0-9_.-]+$/.test(token)) throw new McpBundleReadError('unauthorized');
  const path = `/v1/tenants/${tenantId}/note-native2/documents/${documentId}`;
  const opened = await getJson(origin + path, token, signal, fetcher);
  if (!record(opened) || !documentHead(opened.document, tenantId, documentId) || typeof opened.snapshotText !== 'string') {
    throw new McpBundleReadError('invalid_service_response');
  }
  const head = opened.document;
  if (digest(opened.snapshotText) !== head.snapshotHash) throw new McpBundleReadError('invalid_service_response');
  let raw: unknown;
  try { raw = JSON.parse(opened.snapshotText); } catch { throw new McpBundleReadError('invalid_service_response'); }
  if (!record(raw) || raw.format !== 'barocss-note' || raw.version !== 2 || !record(raw.document) ||
    raw.document.stype !== 'note' || !Array.isArray(raw.document.content) ||
    !record(raw.document.attributes) || raw.document.attributes.pageId !== head.pageId) {
    throw new McpBundleReadError('invalid_service_response');
  }
  let bundle: RegistryBundle;
  try {
    const validated = validateRegistryBundle(raw.schemaBundle);
    if (validated.selectedDefinitions.some(item => item.scope.tenantId !== tenantId || item.scope.workspaceId !== head.workspaceId)) {
      throw new Error('scope mismatch');
    }
    bundle = validated.bundle;
  } catch { throw new McpBundleReadError('invalid_service_response'); }
  const resolved = await getJson(origin + path + '/schema-bundle', token, signal, fetcher);
  if (!record(resolved) || resolved.status !== 'pinned' || resolved.documentId !== documentId ||
    resolved.documentRevision !== head.revision || resolved.snapshotHash !== head.snapshotHash ||
    !record(resolved.nativeFormat) || resolved.nativeFormat.format !== 'barocss-note' ||
    resolved.nativeFormat.version !== 2 || !isDeepStrictEqual(resolved.bundle, bundle)) {
    throw new McpBundleReadError('inconsistent_document_read');
  }
  return { status: 'pinned', document: head, snapshotText: opened.snapshotText,
    documentRevision: head.revision, snapshotHash: head.snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle };
}
