import { parseRegistryDefinition, parseRegistryJson } from '../../../packages/schema/src/registry-contract';
import { readNoteSnapshotFile } from '../../../packages/office-note/src/note-file-codec';
import { decodeExperimentalNative2Head, type ExperimentalNative2Read } from '../../note/src/experimental-native2-reader';
import { AuthError, captureAuthorizedSession } from './auth-client';
import { createAuthenticatedNative2Reader, type Native2ReadScope } from './native2-authenticated-reader';

export class Native2MutationError extends Error {
  constructor(public readonly code: string, public readonly status: number | null = null) { super(code); }
}
export interface Native2MutationInput {
  snapshotText: string; schemaAction: 'preserve' | 'adopt'; idempotencyKey: string;
}
/** Fixed bytes, never a transferable authority grant. Methods require the original private context. */
export interface Native2MutationAttempt extends Readonly<Native2MutationInput> {
  readonly expectedRevision: number; readonly expectedSnapshotHash: string;
  readonly expectedPriorPinDigest: string; readonly candidateSnapshotHash: string; readonly requestHash: string;
}
export interface Native2Validation {
  readonly status: 'structurally_valid'; readonly kind: 'document' | 'candidate';
  readonly documentId: string; readonly documentRevision: number; readonly snapshotHash: string;
  readonly priorPinDigest: string; readonly checks: readonly string[];
  readonly candidateSnapshotHash?: string; readonly action?: 'preserve' | 'adopt';
}
export interface Native2UpdateReceipt {
  readonly operation: 'update'; readonly idempotencyKey: string; readonly requestHash: string;
  readonly document: ExperimentalNative2Read['document']; readonly snapshotText: string;
}
export interface Native2VerifiedReceipt extends Native2UpdateReceipt {
  /** A checked selected-pin delta, not model adoption or full product acceptance. */
  readonly selectedPinsChanged: boolean;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const sourceChecks = ['current_authority', 'current_source', 'native2_file', 'registered_bundle', 'source_preconditions'];
const candidateChecks = [...sourceChecks, 'candidate_file', 'candidate_registered_bundle', 'candidate_action_policy', 'pin_transition'];
function fail(code: string, status: number | null = null): never { throw new Native2MutationError(code, status); }
function exact(value: unknown, keys: readonly string[], code = 'invalid_service_response'): Record<string, unknown> {
  if (!record(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail(code);
  return value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
async function sha(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export interface Native2ReceiptCorrelation {
  readonly tenantId: string; readonly workspaceId: string; readonly documentId: string; readonly pageId: string;
  readonly expectedRevision: number; readonly idempotencyKey: string; readonly requestHash: string;
  readonly snapshotText: string; readonly candidateSnapshotHash: string;
}

/** Pure byte/head correlation only. This function cannot grant a login, write or native effect. */
export function verifyNative2UpdateReceipt(value: unknown, expected: Native2ReceiptCorrelation): Native2UpdateReceipt {
  const v = exact(value, ['operation', 'idempotencyKey', 'requestHash', 'document', 'snapshotText']);
  if (v.operation !== 'update' || v.idempotencyKey !== expected.idempotencyKey ||
    v.requestHash !== expected.requestHash || v.snapshotText !== expected.snapshotText) fail('invalid_service_response');
  let document: ExperimentalNative2Read['document'];
  try { document = decodeExperimentalNative2Head(v.document, expected.tenantId, expected.workspaceId, expected.documentId); }
  catch { return fail('invalid_service_response'); }
  if (document.revision !== expected.expectedRevision + 1 || document.snapshotHash !== expected.candidateSnapshotHash ||
    document.pageId !== expected.pageId) fail('invalid_service_response');
  return freeze({ operation: 'update', idempotencyKey: expected.idempotencyKey, requestHash: expected.requestHash,
    document, snapshotText: expected.snapshotText });
}
function selected(file: ExperimentalNative2Read['file']): string {
  return JSON.stringify(file.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest]));
}
function candidateFile(text: string, source: ExperimentalNative2Read) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 524288 || new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== text) return fail('invalid_request');
  const file = readNoteSnapshotFile(text);
  if ('error' in file || !('fileVersion' in file) || file.fileVersion !== 2 ||
    file.document.attributes?.pageId !== source.document.pageId) return fail('invalid_candidate');
  for (const entry of file.schemaBundle.definitions) {
    const { definition } = parseRegistryDefinition(entry.definitionText);
    if (definition.scope.tenantId !== source.document.tenantId ||
      definition.scope.workspaceId !== source.document.workspaceId) return fail('foreign_candidate');
  }
  return file;
}
function aborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Native2MutationError('cancelled'));
    if (signal.aborted) { stop(); return; }
    signal.addEventListener('abort', stop, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) return fail('invalid_service_response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await aborted(reader.read(), signal);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 1048576) return fail('response_too_large');
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return parseRegistryJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes), 1048576); }
    catch { return fail('invalid_service_response'); }
  } finally {
    // Cancel even a held body on expiry/timeout; no unbounded wait for producer cleanup.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Office-private transport only. Server authority and Editor native effects remain separate. */
export function createAuthenticatedNative2Mutation() {
  const session = captureAuthorizedSession();
  const reader = createAuthenticatedNative2Reader();
  // One key cannot be repurposed across source generations in this factory.
  const keys = new Map<string, string>();
  const open = async (scope: Native2ReadScope) => {
    const lease = await reader.open(scope);
    const source = lease.read;
    const { tenantId, workspaceId, documentId } = source.document;
    const root = `/api/v1/tenants/${tenantId}/note-native2`;
    const current = () => {
      if (!session.isCurrent() || !lease.isCurrent()) fail('cancelled');
    };
    const priorPinDigest = await sha(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId,
      workspaceId, documentId, 'pinned', source.file.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest])]));
    current();
    if (source.document.revision >= Number.MAX_SAFE_INTEGER) fail('invalid_source');
    const attempts = new WeakMap<Native2MutationAttempt, { body: string; validationBody: string; pinsChanged: boolean }>();
    const prepare = async (input: Native2MutationInput): Promise<Native2MutationAttempt> => {
      current();
      exact(input, ['snapshotText', 'schemaAction', 'idempotencyKey'], 'invalid_request');
      if (typeof input.snapshotText !== 'string' || !['preserve', 'adopt'].includes(input.schemaAction) ||
        typeof input.idempotencyKey !== 'string' || !keyPattern.test(input.idempotencyKey)) fail('invalid_request');
      // Copy the caller's fields before any await. Subsequent drafts cannot replace these bytes.
      const { snapshotText, schemaAction, idempotencyKey } = input;
      const file = candidateFile(snapshotText, source);
      const pinsChanged = selected(file) !== selected(source.file);
      if (schemaAction === 'preserve' && pinsChanged) fail('pin_transition_invalid');
      const candidateSnapshotHash = await sha(snapshotText);
      const expectedRevision = source.document.revision, expectedSnapshotHash = source.document.snapshotHash;
      const requestHash = await sha(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId,
        schemaAction, expectedRevision, expectedSnapshotHash, priorPinDigest, snapshotText]));
      current();
      const existing = keys.get(idempotencyKey);
      if (existing !== undefined && existing !== requestHash) fail('key_reuse');
      keys.set(idempotencyKey, requestHash);
      const body = JSON.stringify({ schemaAction, expectedRevision, expectedSnapshotHash,
        expectedPriorPinDigest: priorPinDigest, snapshotText, idempotencyKey });
      if (new TextEncoder().encode(body).length > 1048576) fail('request_too_large');
      const attempt = freeze({ snapshotText, schemaAction, idempotencyKey, expectedRevision, expectedSnapshotHash,
        expectedPriorPinDigest: priorPinDigest, candidateSnapshotHash, requestHash });
      attempts.set(attempt, { body, validationBody: JSON.stringify({ kind: 'candidate', expectedRevision,
        expectedSnapshotHash, expectedPriorPinDigest: priorPinDigest, snapshotText, intendedAction: schemaAction }), pinsChanged });
      return attempt;
    };
    const owned = (attempt: Native2MutationAttempt) => {
      current();
      const data = attempts.get(attempt);
      if (!data) return fail('foreign_attempt');
      return data;
    };
    const request = async (path: string, method: 'GET' | 'POST' | 'PUT', body?: string) => {
      current();
      const controller = new AbortController();
      const stop = lease.subscribeRetirement(() => controller.abort());
      const timeout = setTimeout(() => controller.abort(), 10000);
      let response: Response | undefined;
      try {
        const url = root + path;
        const pending = session.requestFetch(url, { method, body,
          headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal }).then(value => {
          // An ignored abort can deliver headers after the outer race has already rejected.
          if (controller.signal.aborted) { void value.body?.cancel().catch(() => {}); return fail('cancelled'); }
          return value;
        });
        response = await aborted(pending, controller.signal);
        current();
        if (response.redirected || (response.url && response.url !== new URL(url, location.origin).href)) fail('invalid_service_response');
        if (response.status === 404 || response.status >= 500) fail(response.status === 404 ? 'not_found' : 'service_unavailable', response.status);
        const value = await boundedJson(response, controller.signal);
        current();
        if (!response.ok) {
          const code = record(value) && typeof value.status === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value.status)
            ? value.status : 'service_refused';
          fail(code, response.status);
        }
        return value;
      } catch (error) {
        current();
        if (error instanceof Native2MutationError) throw error;
        if (error instanceof AuthError) fail(error.kind, error.kind === 'forbidden' ? 403 : null);
        return fail('service_unavailable');
      } finally {
        clearTimeout(timeout); stop();
        void response?.body?.cancel().catch(() => {});
      }
    };
    const checkedValidation = (value: unknown, attempt?: Native2MutationAttempt): Native2Validation => {
      const v = exact(value, ['status', 'kind', 'documentId', 'documentRevision', 'snapshotHash', 'priorPinDigest', 'checks',
        ...(attempt ? ['candidateSnapshotHash', 'action'] : [])]);
      const checks = attempt ? candidateChecks : sourceChecks;
      if (v.status !== 'structurally_valid' || v.kind !== (attempt ? 'candidate' : 'document') ||
        v.documentId !== documentId || v.documentRevision !== source.document.revision ||
        v.snapshotHash !== source.document.snapshotHash || v.priorPinDigest !== priorPinDigest ||
        !Array.isArray(v.checks) || v.checks.length !== checks.length || v.checks.some((item, index) => item !== checks[index]) ||
        (attempt && (v.candidateSnapshotHash !== attempt.candidateSnapshotHash || v.action !== attempt.schemaAction))) fail('invalid_service_response');
      current();
      return freeze({ status: 'structurally_valid', kind: attempt ? 'candidate' : 'document', documentId,
        documentRevision: source.document.revision, snapshotHash: source.document.snapshotHash, priorPinDigest,
        checks: [...checks], ...(attempt ? { candidateSnapshotHash: attempt.candidateSnapshotHash, action: attempt.schemaAction } : {}) });
    };
    const checkedReceipt = (value: unknown, attempt: Native2MutationAttempt): Native2VerifiedReceipt => {
      const data = owned(attempt);
      const receipt = verifyNative2UpdateReceipt(value, { ...attempt, tenantId, workspaceId, documentId,
        pageId: source.document.pageId });
      current();
      return freeze({ ...receipt, selectedPinsChanged: data.pinsChanged });
    };
    return Object.freeze({ source, prepare, isCurrent: lease.isCurrent, retire: lease.retire,
      subscribeRetirement: lease.subscribeRetirement,
      validateSource: async () => checkedValidation(await request(`/documents/${documentId}/validation`, 'POST',
        JSON.stringify({ kind: 'document', expectedRevision: source.document.revision,
          expectedSnapshotHash: source.document.snapshotHash, expectedPriorPinDigest: priorPinDigest }))),
      validate: async (attempt: Native2MutationAttempt) => {
        const data = owned(attempt);
        return checkedValidation(await request(`/documents/${documentId}/validation`, 'POST', data.validationBody), attempt);
      },
      update: async (attempt: Native2MutationAttempt) => {
        const data = owned(attempt);
        return checkedReceipt(await request(`/documents/${documentId}/snapshot`, 'PUT', data.body), attempt);
      },
      recover: async (attempt: Native2MutationAttempt) => {
        owned(attempt);
        return checkedReceipt(await request(`/receipts/update/${attempt.idempotencyKey}`, 'GET'), attempt);
      },
    });
  };
  return Object.freeze({ open, retire: reader.retire, isCurrent: reader.isCurrent, subscribeRetirement: reader.subscribeRetirement });
}
