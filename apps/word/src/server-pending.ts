import { wordSaveAttempt, type WordSaveAttempt } from './server-documents';
import { readServerWordFile } from './server-file';

export interface PendingWordScope {
  issuer: string;
  subject: string;
  tenantId: string;
  workspaceId: string;
}

export type PendingWordBase =
  | { operation: 'create'; workspaceId: string }
  | { operation: 'update'; documentId: string; expectedRevision: number };

export interface PendingWordRecord {
  version: 1;
  draftId: string;
  scope: PendingWordScope & { documentRef: string };
  base: PendingWordBase;
  status: 'draft' | 'pending' | 'confirmed';
  snapshotText: string;
  attempt?: Readonly<WordSaveAttempt>;
  savedAt: string;
  source?: { kind: 'indexeddb-word'; name: string };
  confirmedCopy?: { documentId: string; revision: number; snapshotHash: string };
}

const rootKey = 'wonffice.word.pending.v1:';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function encode(value: unknown) { return encodeURIComponent(JSON.stringify(value)); }

function prefix(scope: PendingWordScope) {
  if (!scope.issuer || !scope.subject || !uuid.test(scope.tenantId) || !uuid.test(scope.workspaceId)) {
    throw new Error('verified_word_scope_required');
  }
  return `${rootKey}${encode(scope)}:`;
}

function validBase(value: unknown, scope: PendingWordScope): value is PendingWordBase {
  if (!value || typeof value !== 'object') return false;
  const base = value as Record<string, unknown>;
  return base.operation === 'create'
    ? base.workspaceId === scope.workspaceId
    : base.operation === 'update' && typeof base.documentId === 'string' && uuid.test(base.documentId) &&
      Number.isSafeInteger(base.expectedRevision) && (base.expectedRevision as number) > 0;
}

function validSource(value: unknown): value is NonNullable<PendingWordRecord['source']> {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return source.kind === 'indexeddb-word' && typeof source.name === 'string' && !!source.name;
}

function validCopy(value: unknown): value is NonNullable<PendingWordRecord['confirmedCopy']> {
  if (!value || typeof value !== 'object') return false;
  const copy = value as Record<string, unknown>;
  return typeof copy.documentId === 'string' && uuid.test(copy.documentId) &&
    copy.revision === 1 &&
    typeof copy.snapshotHash === 'string' && /^[0-9a-f]{64}$/.test(copy.snapshotHash);
}

function readRecord(raw: string, scope: PendingWordScope): PendingWordRecord {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('corrupt_pending_word_record'); }
  if (!value || typeof value !== 'object') throw new Error('corrupt_pending_word_record');
  const record = value as Record<string, unknown>;
  const recordScope = record.scope as Record<string, unknown> | undefined;
  if (record.version !== 1 || typeof record.draftId !== 'string' || !uuid.test(record.draftId) ||
    !recordScope || !same({ issuer: recordScope.issuer, subject: recordScope.subject,
      tenantId: recordScope.tenantId, workspaceId: recordScope.workspaceId }, scope) ||
    typeof recordScope.documentRef !== 'string' || !uuid.test(recordScope.documentRef) ||
    !validBase(record.base, scope) || !['draft', 'pending', 'confirmed'].includes(record.status as string) ||
    typeof record.snapshotText !== 'string' || 'error' in readServerWordFile(record.snapshotText) ||
    typeof record.savedAt !== 'string' || Number.isNaN(Date.parse(record.savedAt))) {
    throw new Error('corrupt_pending_word_record');
  }
  if ((record.source !== undefined && (!validSource(record.source) || record.base.operation !== 'create')) ||
    (record.confirmedCopy !== undefined && (!validCopy(record.confirmedCopy) || !record.source || record.status !== 'confirmed'))) {
    throw new Error('corrupt_pending_word_record');
  }
  let attempt: Readonly<WordSaveAttempt> | undefined;
  if (record.attempt !== undefined) {
    try { attempt = wordSaveAttempt(record.attempt as WordSaveAttempt); }
    catch { throw new Error('corrupt_pending_word_record'); }
    if (attempt.snapshotText !== record.snapshotText ||
      (record.status !== 'pending' && record.status !== 'confirmed') ||
      (record.base.operation !== attempt.operation) ||
      (attempt.operation === 'create' && attempt.workspaceId !== scope.workspaceId) ||
      (attempt.operation === 'update' && record.base.operation === 'update' &&
        (attempt.documentId !== record.base.documentId || attempt.expectedRevision !== record.base.expectedRevision))) {
      throw new Error('corrupt_pending_word_record');
    }
  } else if (record.status !== 'draft') {
    throw new Error('corrupt_pending_word_record');
  }
  return { version: 1, draftId: record.draftId, scope: recordScope as unknown as PendingWordRecord['scope'],
    base: record.base, status: record.status as PendingWordRecord['status'], snapshotText: record.snapshotText,
    ...(attempt ? { attempt } : {}), savedAt: record.savedAt,
    ...(record.source ? { source: record.source as PendingWordRecord['source'] } : {}),
    ...(record.confirmedCopy ? { confirmedCopy: record.confirmedCopy as PendingWordRecord['confirmedCopy'] } : {}) };
}

export function createServerPendingStore(inputScope: PendingWordScope, suppliedStorage?: Storage) {
  const scope = { issuer: inputScope.issuer, subject: inputScope.subject, tenantId: inputScope.tenantId, workspaceId: inputScope.workspaceId };
  const scopedPrefix = prefix(scope);
  const getStorage = () => suppliedStorage ?? window.localStorage;
  const recordKey = (documentRef: string, draftId: string) => {
    if (!uuid.test(documentRef) || !uuid.test(draftId)) throw new Error('invalid_pending_word_identity');
    return `${scopedPrefix}${encode(documentRef)}:${draftId}`;
  };

  function list(): PendingWordRecord[] {
    const storage = getStorage();
    const records: PendingWordRecord[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(scopedPrefix)) continue;
      const raw = storage.getItem(key);
      if (raw === null) throw new Error('pending_word_changed_during_discovery');
      const record = readRecord(raw, scope);
      if (key !== recordKey(record.scope.documentRef, record.draftId)) throw new Error('corrupt_pending_word_record');
      records.push(record);
    }
    return records.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  }

  function write(input: Omit<PendingWordRecord, 'version' | 'scope' | 'savedAt'> & { documentRef: string }): PendingWordRecord {
    if (!uuid.test(input.documentRef) || !uuid.test(input.draftId) ||
      !['draft', 'pending', 'confirmed'].includes(input.status) ||
      'error' in readServerWordFile(input.snapshotText) || !validBase(input.base, scope)) {
      throw new Error('invalid_pending_word_draft');
    }
    if ((input.status === 'draft') === !!input.attempt ||
      (input.attempt && (input.attempt.snapshotText !== input.snapshotText ||
        input.base.operation !== input.attempt.operation ||
        (input.attempt.operation === 'create' && input.attempt.workspaceId !== scope.workspaceId) ||
        (input.attempt.operation === 'update' && input.base.operation === 'update' &&
          (input.attempt.documentId !== input.base.documentId || input.attempt.expectedRevision !== input.base.expectedRevision))))) {
      throw new Error('pending_word_attempt_mismatch');
    }
    if ((input.source !== undefined && (!validSource(input.source) || input.base.operation !== 'create')) ||
      (input.confirmedCopy !== undefined && (!validCopy(input.confirmedCopy) || !input.source || input.status !== 'confirmed'))) {
      throw new Error('invalid_pending_word_copy');
    }
    const record: PendingWordRecord = {
      version: 1, draftId: input.draftId, scope: { ...scope, documentRef: input.documentRef },
      base: input.base, status: input.status, snapshotText: input.snapshotText,
      ...(input.attempt ? { attempt: wordSaveAttempt(input.attempt) } : {}), savedAt: new Date().toISOString(),
      ...(input.source ? { source: { ...input.source } } : {}),
      ...(input.confirmedCopy ? { confirmedCopy: { ...input.confirmedCopy } } : {})
    };
    const storage = getStorage();
    const key = recordKey(input.documentRef, input.draftId);
    const previousRaw = storage.getItem(key);
    if (previousRaw !== null) {
      const previous = readRecord(previousRaw, scope);
      if (previous.status !== 'draft' &&
        (previous.snapshotText !== record.snapshotText || !same(previous.attempt, record.attempt) || !same(previous.source, record.source) || !same(previous.base, record.base) ||
          (previous.status === 'confirmed' && (record.status !== 'confirmed' || !same(previous.confirmedCopy, record.confirmedCopy))))) {
        throw new Error('fixed_pending_word_cannot_be_replaced');
      }
    }
    const raw = JSON.stringify(record);
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw new Error('pending_word_write_not_verified');
    return record;
  }

  return { list, write, key: recordKey };
}

export function newPendingWordDraftId() { return crypto.randomUUID(); }
