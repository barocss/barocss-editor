import { isRegistryUuid, parseRegistryJson, parseRegistryDefinition } from '@barocss/schema/registry-contract';
import { readNoteSnapshotFile } from '@barocss/office-note/file';
import { createExperimentalNative2NoteReader, decodeExperimentalNative2Head, type ExperimentalNative2Read } from './experimental-native2-reader';
import type { PendingNoteScope } from './server-pending';

export type Native2PreserveBase = Pick<ExperimentalNative2Read, 'document' | 'snapshotText'>;
export interface Native2PreserveAttempt {
  readonly version: 1; readonly operation: 'update'; readonly scope: PendingNoteScope & { documentId: string };
  readonly generation: number; readonly base: Native2PreserveBase; readonly snapshotText: string;
  readonly snapshotHash: string; readonly idempotencyKey: string; readonly expectedPriorPinDigest: string;
  readonly bodyText: string;
}
export interface Native2PreserveReceipt {
  readonly operation: 'update'; readonly idempotencyKey: string; readonly requestHash: string;
  readonly document: ExperimentalNative2Read['document']; readonly snapshotText: string;
}
export interface Native2FixedConfirmation {
  readonly status: 'fixed-confirmed'; readonly generation: number; readonly attempt: Native2PreserveAttempt;
  readonly receipt: Native2PreserveReceipt; readonly read: ExperimentalNative2Read;
}
export class Native2PreserveError extends Error {
  constructor(public readonly status: number | null, public readonly code: string) { super(code); }
}
export const native2Record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function native2Equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => native2Equal(v, b[i]));
  if (!native2Record(a) || !native2Record(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && native2Equal(a[k], b[k]));
}
export function freezeNative2Value<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freezeNative2Value); Object.freeze(value); }
  return value;
}
export const native2Digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const keyValid = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(v);
export function native2Exact(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!native2Record(value) || keys.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !keys.includes(k) && !optional.includes(k))) {
    throw new Native2PreserveError(null, 'invalid_native2_attempt');
  }
  return value;
}
export function requireNative2Writable(isCurrent: () => boolean): void {
  let current = false; try { current = isCurrent(); } catch { /* Closed trusted host. */ }
  if (!current) throw new Native2PreserveError(null, 'stale_native2_writable_context');
}
export function validateNative2Scope(scope: PendingNoteScope): void {
  const s = native2Exact(scope, ['issuer', 'subject', 'tenantId', 'workspaceId']);
  if (typeof s.issuer !== 'string' || !s.issuer || typeof s.subject !== 'string' || !s.subject || !isRegistryUuid(s.tenantId) || !isRegistryUuid(s.workspaceId)) {
    throw new Native2PreserveError(null, 'invalid_native2_scope');
  }
}
async function hash(text: string, current: () => boolean): Promise<string> {
  requireNative2Writable(current);
  const value = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); requireNative2Writable(current);
  return Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, '0')).join('');
}
export function readPreserveNative2(raw: string, scope: PendingNoteScope) {
  const file = readNoteSnapshotFile(raw);
  if ('error' in file || !('fileVersion' in file) || file.fileVersion !== 2) throw new Native2PreserveError(null, 'invalid_native2_snapshot');
  for (const entry of file.schemaBundle.definitions) {
    const { definition } = parseRegistryDefinition(entry.definitionText);
    if (definition.scope.tenantId !== scope.tenantId || definition.scope.workspaceId !== scope.workspaceId) throw new Native2PreserveError(null, 'native2_preserve_conflict');
  }
  return file;
}
export async function validateNative2Base(value: unknown, scope: PendingNoteScope, current: () => boolean): Promise<Native2PreserveBase> {
  requireNative2Writable(current); const b = native2Exact(value, ['document', 'snapshotText']);
  if (!native2Record(b.document) || !isRegistryUuid(b.document.documentId) || typeof b.snapshotText !== 'string') throw new Native2PreserveError(null, 'invalid_native2_attempt');
  const document = decodeExperimentalNative2Head(b.document, scope.tenantId, scope.workspaceId, b.document.documentId);
  if (await hash(b.snapshotText, current) !== document.snapshotHash) throw new Native2PreserveError(null, 'invalid_native2_attempt');
  const file = readPreserveNative2(b.snapshotText, scope);
  if (file.document.attributes?.pageId !== document.pageId) throw new Native2PreserveError(null, 'native2_preserve_conflict');
  return freezeNative2Value({ document, snapshotText: b.snapshotText });
}
export function validateNative2Draft(base: Native2PreserveBase, text: string, scope: PendingNoteScope): void {
  const previous = readPreserveNative2(base.snapshotText, scope), next = readPreserveNative2(text, scope);
  if (next.document.attributes?.pageId !== base.document.pageId || !native2Equal(previous.schemaBundle, next.schemaBundle)) throw new Native2PreserveError(null, 'native2_preserve_conflict');
}
async function freezeAttempt(scope: PendingNoteScope, baseValue: unknown, snapshotText: string, idempotencyKey: string, generation: number, current: () => boolean): Promise<Native2PreserveAttempt> {
  requireNative2Writable(current); validateNative2Scope(scope);
  if (!keyValid(idempotencyKey) || !positive(generation) || typeof snapshotText !== 'string') throw new Native2PreserveError(null, 'invalid_native2_attempt');
  const base = await validateNative2Base(baseValue, scope, current); requireNative2Writable(current); validateNative2Draft(base, snapshotText, scope);
  const file = readPreserveNative2(base.snapshotText, scope), documentId = base.document.documentId;
  const expectedPriorPinDigest = await hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', scope.tenantId, scope.workspaceId,
    documentId, 'pinned', file.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest])]), current);
  const snapshotHash = await hash(snapshotText, current);
  const bodyText = JSON.stringify({ schemaAction: 'preserve', expectedRevision: base.document.revision,
    expectedSnapshotHash: base.document.snapshotHash, expectedPriorPinDigest, snapshotText, idempotencyKey });
  return freezeNative2Value({ version: 1, operation: 'update', scope: { ...scope, documentId }, generation,
    base, snapshotText, snapshotHash, idempotencyKey, expectedPriorPinDigest, bodyText });
}
export async function recoverNative2PreserveAttempt(value: unknown, scope: PendingNoteScope, current: () => boolean): Promise<Native2PreserveAttempt> {
  requireNative2Writable(current);
  try {
    const v = native2Exact(value, ['version', 'operation', 'scope', 'generation', 'base', 'snapshotText', 'snapshotHash', 'idempotencyKey', 'expectedPriorPinDigest', 'bodyText']);
    if (v.version !== 1 || v.operation !== 'update' || typeof v.snapshotText !== 'string' || !keyValid(v.idempotencyKey) || !positive(v.generation)) throw new Error('Invalid attempt');
    const expected = await freezeAttempt(scope, v.base, v.snapshotText, v.idempotencyKey, v.generation, current);
    if (!native2Equal(v, expected)) throw new Error('Invalid attempt'); return expected;
  } catch (error) { requireNative2Writable(current); throw new Native2PreserveError(null, 'invalid_native2_attempt'); }
}
const directReceipts = new WeakMap<Native2PreserveReceipt, { attempt: Native2PreserveAttempt; current: () => boolean }>();
const confirmed = new WeakMap<Native2FixedConfirmation, () => boolean>();
export const isNative2FixedConfirmation = (value: Native2FixedConfirmation): boolean => {
  const current = confirmed.get(value); if (!current) return false;
  try { return current(); } catch { return false; }
};
export function isNative2DirectReceipt(value: Native2PreserveReceipt, attempt: Native2PreserveAttempt): boolean {
  const captured = directReceipts.get(value);
  try { return !!captured && captured.current() && native2Equal(captured.attempt, attempt); } catch { return false; }
}

/** Controlled app-private experiment. No ordinary workspace/SDK registration or public requestHash algorithm. */
export function createExperimentalNative2Preserver({ scope: inputScope, apiBase, authorizedFetch, isCurrent, isWritableCurrent, readDurableAttempt }: {
  scope: PendingNoteScope; apiBase: string; authorizedFetch: typeof fetch; isCurrent: () => boolean; isWritableCurrent: () => boolean;
  readDurableAttempt: () => Promise<Native2PreserveAttempt | undefined>;
}) {
  validateNative2Scope(inputScope); const scope = freezeNative2Value({ ...inputScope });
  const current = () => isCurrent() && isWritableCurrent();
  if (!apiBase || /[?#]/.test(apiBase)) throw new Native2PreserveError(null, 'invalid_native2_context');
  const root = `${apiBase.replace(/\/$/, '')}/v1/tenants/${scope.tenantId}/note-native2`;
  const reader = createExperimentalNative2NoteReader({ ...scope, apiBase, authorizedFetch, isCurrent: current });
  const recoverAttempt = (value: unknown) => recoverNative2PreserveAttempt(value, scope, current);
  const durable = async (value: Native2PreserveAttempt) => {
    const attempt = await recoverAttempt(value); requireNative2Writable(current);
    const stored = await readDurableAttempt(); requireNative2Writable(current);
    if (!native2Equal(stored, attempt)) throw new Native2PreserveError(null, 'native2_attempt_not_durable'); return attempt;
  };
  const decodeReceipt = async (value: unknown, attempt: Native2PreserveAttempt): Promise<Native2PreserveReceipt> => {
    requireNative2Writable(current); const r = native2Exact(value, ['operation', 'idempotencyKey', 'requestHash', 'document', 'snapshotText']);
    if (r.operation !== 'update' || r.idempotencyKey !== attempt.idempotencyKey || !native2Digest(r.requestHash) || r.snapshotText !== attempt.snapshotText) throw new Native2PreserveError(null, 'native2_receipt_conflict');
    const document = decodeExperimentalNative2Head(r.document, scope.tenantId, scope.workspaceId, attempt.scope.documentId);
    if (document.revision !== attempt.base.document.revision + 1 || document.pageId !== attempt.base.document.pageId ||
      document.snapshotHash !== attempt.snapshotHash || await hash(r.snapshotText, current) !== document.snapshotHash) throw new Native2PreserveError(null, 'native2_receipt_conflict');
    validateNative2Draft(attempt.base, r.snapshotText, scope);
    return freezeNative2Value({ operation: 'update', idempotencyKey: r.idempotencyKey, requestHash: r.requestHash, document, snapshotText: r.snapshotText });
  };
  const request = async (path: string, init: RequestInit): Promise<unknown> => {
    requireNative2Writable(current); let response: Response;
    try { response = await authorizedFetch(root + path, init); }
    catch (error) {
      requireNative2Writable(current);
      if (native2Record(error) && (error.kind === 'unauthorized' || error.kind === 'forbidden')) throw new Native2PreserveError(error.kind === 'unauthorized' ? 401 : 403, error.kind);
      throw new Native2PreserveError(null, 'network_error');
    }
    requireNative2Writable(current); let text: string;
    try { text = await response.text(); } catch { requireNative2Writable(current); throw new Native2PreserveError(null, 'network_error'); }
    requireNative2Writable(current); let value: unknown;
    try { value = parseRegistryJson(text, 1048576); } catch { throw new Native2PreserveError(response.ok ? null : response.status, response.ok ? 'invalid_native2_receipt' : 'http_error'); }
    if (!response.ok) throw new Native2PreserveError(response.status, native2Record(value) && typeof value.status === 'string' ? value.status : 'http_error'); return value;
  };
  const send = async (value: Native2PreserveAttempt) => {
    const attempt = await durable(value);
    const receipt = await decodeReceipt(await request(`/documents/${attempt.scope.documentId}/snapshot`, {
      method: 'PUT', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: attempt.bodyText }), attempt);
    requireNative2Writable(current); directReceipts.set(receipt, { attempt, current }); return receipt;
  };
  const checkReceipt = async (value: Native2PreserveAttempt) => {
    const attempt = await durable(value);
    return decodeReceipt(await request(`/receipts/update/${encodeURIComponent(attempt.idempotencyKey)}`, { method: 'GET', cache: 'no-store' }), attempt);
  };
  const confirm = async (value: Native2PreserveAttempt, response: Native2PreserveReceipt, knownDirectHash?: string): Promise<Native2FixedConfirmation | { status: 'unconfirmed'; reason: string }> => {
    const attempt = await durable(value), receipt = await decodeReceipt(response, attempt);
    if (knownDirectHash !== undefined && (!native2Digest(knownDirectHash) || knownDirectHash !== receipt.requestHash)) throw new Native2PreserveError(null, 'native2_receipt_conflict');
    if (!isNative2DirectReceipt(response, attempt) && knownDirectHash === undefined) return { status: 'unconfirmed', reason: 'receipt_not_correlated' };
    const read = await reader.open(attempt.scope.documentId); requireNative2Writable(current);
    if (!native2Equal(read.document, receipt.document) || read.snapshotText !== attempt.snapshotText || !native2Equal(read.file.schemaBundle, readPreserveNative2(attempt.base.snapshotText, scope).schemaBundle)) return { status: 'unconfirmed', reason: 'current_head_differs' };
    const result = freezeNative2Value({ status: 'fixed-confirmed' as const, generation: attempt.generation, attempt, receipt, read });
    confirmed.set(result, current); return result;
  };
  return Object.freeze({ freeze: (base: Native2PreserveBase, text: string, key: string, generation: number) => freezeAttempt(scope, base, text, key, generation, current), recoverAttempt, send, checkReceipt, confirm });
}
