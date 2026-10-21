import { isRegistryUuid, parseRegistryDefinition, parseRegistryJson } from '../../../packages/schema/src/registry-contract';
import { isNotePageId, readNoteSnapshotFile } from '../../../packages/office-note/src/note-file-codec';
import { AuthError, captureAuthorizedSession, captureNative2ReadSession } from './auth-client';
import { Native2MutationError, verifyNative2UpdateReceipt,
  type Native2ReceiptCorrelation, type Native2UpdateReceipt } from './native2-authenticated-mutation';

/** Persisted operation data is untrusted. It contains no credentials or approval. */
export interface Native2OriginalUpdate {
  readonly tenantId: string; readonly workspaceId: string; readonly documentId: string;
  readonly expectedRevision: number; readonly expectedSnapshotHash: string; readonly expectedPriorPinDigest: string;
  readonly snapshotText: string; readonly schemaAction: 'preserve' | 'adopt'; readonly idempotencyKey: string;
}
export interface Native2HistoricalAcknowledgment {
  readonly kind: 'historical_acknowledgment';
  readonly original: Native2OriginalUpdate;
  readonly receipt: Native2UpdateReceipt;
  readonly isCurrent: () => boolean;
  readonly retire: () => void;
  readonly subscribeRetirement: (callback: () => void) => () => void;
}
const originalKeys = ['tenantId', 'workspaceId', 'documentId', 'expectedRevision', 'expectedSnapshotHash',
  'expectedPriorPinDigest', 'snapshotText', 'schemaAction', 'idempotencyKey'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function fail(code: string, status: number | null = null): never { throw new Native2MutationError(code, status); }
async function sha(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function originalRecord(input: unknown): { original: Native2OriginalUpdate; pageId: string } {
  if (!record(input) || Object.keys(input).length !== originalKeys.length ||
    originalKeys.some(key => !Object.hasOwn(input, key))) return fail('invalid_original');
  // Copy once, before hashing/HTTP awaits. Later draft edits cannot replace old fields.
  const { tenantId, workspaceId, documentId, expectedRevision, expectedSnapshotHash, expectedPriorPinDigest,
    snapshotText, schemaAction, idempotencyKey } = input;
  if (!isRegistryUuid(tenantId) || !isRegistryUuid(workspaceId) || !isRegistryUuid(documentId) ||
    typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
    expectedRevision >= Number.MAX_SAFE_INTEGER || !digest(expectedSnapshotHash) || !digest(expectedPriorPinDigest) ||
    typeof snapshotText !== 'string' || (schemaAction !== 'preserve' && schemaAction !== 'adopt') ||
    typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(idempotencyKey)) return fail('invalid_original');
  const bytes = new TextEncoder().encode(snapshotText);
  if (bytes.length > 524288 || new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== snapshotText) return fail('invalid_original');
  const file = readNoteSnapshotFile(snapshotText);
  if ('error' in file || !('fileVersion' in file) || file.fileVersion !== 2) return fail('invalid_candidate');
  const pageId = file.document.attributes?.pageId;
  if (!isNotePageId(pageId)) return fail('invalid_candidate');
  for (const entry of file.schemaBundle.definitions) {
    const { definition } = parseRegistryDefinition(entry.definitionText);
    if (definition.scope.tenantId !== tenantId || definition.scope.workspaceId !== workspaceId) return fail('foreign_candidate');
  }
  return { original: Object.freeze({ tenantId, workspaceId, documentId, expectedRevision, expectedSnapshotHash,
    expectedPriorPinDigest, snapshotText, schemaAction, idempotencyKey }), pageId };
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
  const stream = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await aborted(stream.read(), signal);
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
  } finally { void stream.cancel().catch(() => {}); stream.releaseLock(); }
}

/** Fresh current login, GET-only historical correlation. No original writer brand is restored. */
export function createAuthenticatedNative2ReceiptRecovery() {
  const session = captureAuthorizedSession();
  // This existing private capture supplies the login/expiry lifetime, not its GET allowlist.
  const lifetime = captureNative2ReadSession();
  let active: { retire: () => void } | undefined;
  let stopLifetime: (() => void) | undefined;
  const isCurrent = () => session.isCurrent() && lifetime.isCurrent();
  const current = () => { if (!isCurrent()) fail('cancelled'); };
  const retire = () => {
    active?.retire(); active = undefined;
    lifetime.retire();
    const stop = stopLifetime; stopLifetime = undefined; stop?.();
  };
  stopLifetime = lifetime.subscribeRetirement(retire);

  const recover = async (input: unknown): Promise<Native2HistoricalAcknowledgment> => {
    current();
    active?.retire();
    const controller = new AbortController();
    const callbacks = new Set<() => void>();
    let retired = false;
    const notify = (callback: () => void) => { try { callback(); } catch { /* Retirement is already terminal. */ } };
    const retireResult = () => {
      if (retired) return;
      retired = true; controller.abort();
      const pending = [...callbacks]; callbacks.clear();
      pending.forEach(notify);
    };
    active = { retire: retireResult };
    const resultCurrent = () => {
      if (!retired && (!isCurrent() || controller.signal.aborted)) retireResult();
      return !retired;
    };
    const check = () => { if (!resultCurrent()) fail('cancelled'); };
    const subscribeRetirement = (callback: () => void) => {
      if (!resultCurrent()) { notify(callback); return () => {}; }
      callbacks.add(callback); return () => { callbacks.delete(callback); };
    };
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response: Response | undefined;
    try {
      const { original, pageId } = originalRecord(input);
      const candidateSnapshotHash = await sha(original.snapshotText);
      check();
      const requestHash = await sha(JSON.stringify(['note-native2-snapshot-v1', original.tenantId,
        original.workspaceId, original.documentId, original.schemaAction, original.expectedRevision,
        original.expectedSnapshotHash, original.expectedPriorPinDigest, original.snapshotText]));
      check();
      const expected: Native2ReceiptCorrelation = { ...original, pageId, requestHash, candidateSnapshotHash };
      const url = `/api/v1/tenants/${original.tenantId}/note-native2/receipts/update/${original.idempotencyKey}`;
      const pending = session.requestFetch(url, { method: 'GET', headers: { accept: 'application/json' },
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal }).then(value => {
        if (controller.signal.aborted) { void value.body?.cancel().catch(() => {}); return fail('cancelled'); }
        return value;
      });
      response = await aborted(pending, controller.signal);
      check();
      if (response.redirected || (response.url && response.url !== new URL(url, location.origin).href)) fail('invalid_service_response');
      if (response.status === 404 || response.status >= 500) fail(response.status === 404 ? 'not_found' : 'service_unavailable', response.status);
      const value = await boundedJson(response, controller.signal);
      check();
      if (!response.ok) {
        const code = record(value) && typeof value.status === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value.status)
          ? value.status : 'service_refused';
        fail(code, response.status);
      }
      const receipt = verifyNative2UpdateReceipt(value, expected);
      check();
      return Object.freeze({ kind: 'historical_acknowledgment', original, receipt,
        isCurrent: resultCurrent, retire: retireResult, subscribeRetirement });
    } catch (error) {
      check();
      retireResult();
      if (error instanceof Native2MutationError) throw error;
      if (error instanceof AuthError) fail(error.kind, error.kind === 'forbidden' ? 403 : null);
      return fail('service_unavailable');
    } finally { clearTimeout(timeout); void response?.body?.cancel().catch(() => {}); }
  };
  return Object.freeze({ recover, retire, isCurrent,
    subscribeRetirement: (callback: () => void) => lifetime.subscribeRetirement(callback) });
}
