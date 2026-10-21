import { createHash } from 'node:crypto';
import { isRegistryUuid } from '@barocss/schema/registry-contract';
import { McpBundleReadError, schemaServerOrigin, type McpReadConfig } from './mcp-bundle-reader.js';

interface ValidationBase {
  tenantId: string;
  documentId: string;
  expectedRevision: number;
  expectedSnapshotHash: string;
  expectedPriorPinDigest: string;
}
export type McpValidation = (ValidationBase & { kind: 'document' }) |
  (ValidationBase & { kind: 'candidate'; snapshotText: string; intendedAction: 'preserve' | 'adopt' });

const sourceChecks = ['current_authority', 'current_source', 'native2_file', 'registered_bundle',
  'source_preconditions'] as const;
const candidateChecks = [...sourceChecks, 'candidate_file', 'candidate_registered_bundle',
  'candidate_action_policy', 'pin_transition'] as const;
const hex = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function checkedInput(input: McpValidation): Record<string, unknown> {
  if (!record(input) || !isRegistryUuid(input.tenantId) || !isRegistryUuid(input.documentId) ||
    !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
    !hex(input.expectedSnapshotHash) || !hex(input.expectedPriorPinDigest)) {
    throw new McpBundleReadError('invalid_request');
  }
  const common = ['kind', 'tenantId', 'documentId', 'expectedRevision', 'expectedSnapshotHash',
    'expectedPriorPinDigest'];
  if (input.kind === 'document' && exactKeys(input, common)) {
    return { kind: input.kind, expectedRevision: input.expectedRevision,
      expectedSnapshotHash: input.expectedSnapshotHash, expectedPriorPinDigest: input.expectedPriorPinDigest };
  }
  if (input.kind === 'candidate' && exactKeys(input, [...common, 'snapshotText', 'intendedAction']) &&
    typeof input.snapshotText === 'string' && Buffer.byteLength(input.snapshotText, 'utf8') <= 524288 &&
    (input.intendedAction === 'preserve' || input.intendedAction === 'adopt')) {
    return { kind: input.kind, expectedRevision: input.expectedRevision,
      expectedSnapshotHash: input.expectedSnapshotHash, expectedPriorPinDigest: input.expectedPriorPinDigest,
      snapshotText: input.snapshotText, intendedAction: input.intendedAction };
  }
  throw new McpBundleReadError('invalid_request');
}

function verifyResult(value: unknown, input: McpValidation): Record<string, unknown> {
  const common = ['status', 'kind', 'documentId', 'documentRevision', 'snapshotHash', 'priorPinDigest', 'checks'];
  const keys = input.kind === 'candidate' ? [...common, 'candidateSnapshotHash', 'action'] : common;
  const expectedChecks = input.kind === 'candidate' ? candidateChecks : sourceChecks;
  const checks = record(value) ? value.checks : undefined;
  if (!record(value) || !exactKeys(value, keys) || value.status !== 'structurally_valid' ||
    value.kind !== input.kind || value.documentId !== input.documentId ||
    value.documentRevision !== input.expectedRevision || value.snapshotHash !== input.expectedSnapshotHash ||
    value.priorPinDigest !== input.expectedPriorPinDigest || !Array.isArray(checks) ||
    checks.length !== expectedChecks.length ||
    expectedChecks.some((check, index) => checks[index] !== check) ||
    (input.kind === 'candidate' &&
      (value.candidateSnapshotHash !== sha(input.snapshotText) || value.action !== input.intendedAction))) {
    throw new McpBundleReadError('invalid_service_response');
  }
  return value;
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
      if (size > 65536) throw new McpBundleReadError('response_too_large');
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown; }
  catch { throw new McpBundleReadError('invalid_service_response'); }
}

/** Forward one structural validation request to the same authorized HTTP service. */
export async function validateNative2(config: McpReadConfig, input: McpValidation,
  signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const requestBody = checkedInput(input);
  const origin = schemaServerOrigin(config.baseUrl);
  const token = config.bearerToken;
  if (!token || token.length > 8000 || !/^[A-Za-z0-9_.-]+$/.test(token)) {
    throw new McpBundleReadError('unauthorized');
  }
  let response: Response;
  try {
    response = await fetcher(`${origin}/v1/tenants/${input.tenantId}/note-native2/documents/${input.documentId}/validation`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, accept: 'application/json',
        'content-type': 'application/json' }, body: JSON.stringify(requestBody), redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]),
    });
  } catch { throw new McpBundleReadError(signal?.aborted ? 'cancelled' : 'schema_service_unavailable'); }
  try {
    if ([401, 403, 404].includes(response.status) || response.status >= 500) {
      throw new McpBundleReadError(denied(response.status, undefined));
    }
    const value = await boundedJson(response, signal);
    if (!response.ok) throw new McpBundleReadError(denied(response.status, value));
    return verifyResult(value, input);
  } catch (error) {
    if (error instanceof McpBundleReadError) throw error;
    throw new McpBundleReadError(signal?.aborted ? 'cancelled' : 'schema_service_unavailable');
  } finally { await response.body?.cancel().catch(() => { /* Already consumed or closed. */ }); }
}
