import { noteSaveAttempt, type NoteSaveAttempt } from './server-documents';
import { readNoteSnapshotFile } from '@barocss/office-note/file';

export interface PendingNoteScope {
  issuer: string;
  subject: string;
  tenantId: string;
  workspaceId: string;
}

export type PendingNoteBase =
  | { operation: 'create'; workspaceId: string }
  | { operation: 'update'; documentId: string; expectedRevision: number };

export interface PendingNoteRecord {
  version: 1;
  draftId: string;
  scope: PendingNoteScope & { documentRef: string };
  base: PendingNoteBase;
  status: 'draft' | 'pending' | 'confirmed';
  snapshotText: string;
  attempt?: Readonly<NoteSaveAttempt>;
  savedAt: string;
  source?: { kind: 'indexeddb-note'; name: string };
  confirmedCopy?: { documentId: string; pageId: string; revision: number; snapshotHash: string };
}

const rootKey = 'wonffice.note.pending.v1:';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function encode(value: unknown) { return encodeURIComponent(JSON.stringify(value)); }

function prefix(scope: PendingNoteScope) {
  if (!scope.issuer || !scope.subject || !uuid.test(scope.tenantId) || !uuid.test(scope.workspaceId)) {
    throw new Error('verified_note_scope_required');
  }
  return `${rootKey}${encode(scope)}:`;
}

function validBase(value: unknown, scope: PendingNoteScope): value is PendingNoteBase {
  if (!value || typeof value !== 'object') return false;
  const base = value as Record<string, unknown>;
  return base.operation === 'create'
    ? base.workspaceId === scope.workspaceId
    : base.operation === 'update' && typeof base.documentId === 'string' && uuid.test(base.documentId) &&
      Number.isSafeInteger(base.expectedRevision) && (base.expectedRevision as number) > 0;
}

function validSource(value: unknown): value is NonNullable<PendingNoteRecord['source']> {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return source.kind === 'indexeddb-note' && typeof source.name === 'string' && !!source.name;
}

function validCopy(value: unknown): value is NonNullable<PendingNoteRecord['confirmedCopy']> {
  if (!value || typeof value !== 'object') return false;
  const copy = value as Record<string, unknown>;
  return typeof copy.documentId === 'string' && uuid.test(copy.documentId) &&
    typeof copy.pageId === 'string' && uuid.test(copy.pageId) && copy.revision === 1 &&
    typeof copy.snapshotHash === 'string' && /^[0-9a-f]{64}$/.test(copy.snapshotHash);
}

function readRecord(raw: string, scope: PendingNoteScope): PendingNoteRecord {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('corrupt_pending_note_record'); }
  if (!value || typeof value !== 'object') throw new Error('corrupt_pending_note_record');
  const record = value as Record<string, unknown>;
  const recordScope = record.scope as Record<string, unknown> | undefined;
  if (record.version !== 1 || typeof record.draftId !== 'string' || !uuid.test(record.draftId) ||
    !recordScope || !same({ issuer: recordScope.issuer, subject: recordScope.subject,
      tenantId: recordScope.tenantId, workspaceId: recordScope.workspaceId }, scope) ||
    typeof recordScope.documentRef !== 'string' || !recordScope.documentRef ||
    !validBase(record.base, scope) || !['draft', 'pending', 'confirmed'].includes(record.status as string) ||
    typeof record.snapshotText !== 'string' || 'error' in readNoteSnapshotFile(record.snapshotText) ||
    typeof record.savedAt !== 'string' || Number.isNaN(Date.parse(record.savedAt))) {
    throw new Error('corrupt_pending_note_record');
  }
  if ((record.source !== undefined && (!validSource(record.source) || record.base.operation !== 'create')) ||
    (record.confirmedCopy !== undefined && (!validCopy(record.confirmedCopy) || !record.source || record.status !== 'confirmed'))) {
    throw new Error('corrupt_pending_note_record');
  }
  let attempt: Readonly<NoteSaveAttempt> | undefined;
  if (record.attempt !== undefined) {
    try { attempt = noteSaveAttempt(record.attempt as NoteSaveAttempt); }
    catch { throw new Error('corrupt_pending_note_record'); }
    if (attempt.snapshotText !== record.snapshotText ||
      (record.status !== 'pending' && record.status !== 'confirmed') ||
      (record.base.operation !== attempt.operation) ||
      (attempt.operation === 'create' && attempt.workspaceId !== scope.workspaceId) ||
      (attempt.operation === 'update' && record.base.operation === 'update' &&
        (attempt.documentId !== record.base.documentId || attempt.expectedRevision !== record.base.expectedRevision))) {
      throw new Error('corrupt_pending_note_record');
    }
  } else if (record.status !== 'draft') {
    throw new Error('corrupt_pending_note_record');
  }
  return { version: 1, draftId: record.draftId, scope: recordScope as unknown as PendingNoteRecord['scope'],
    base: record.base, status: record.status as PendingNoteRecord['status'], snapshotText: record.snapshotText,
    ...(attempt ? { attempt } : {}), savedAt: record.savedAt,
    ...(record.source ? { source: record.source as PendingNoteRecord['source'] } : {}),
    ...(record.confirmedCopy ? { confirmedCopy: record.confirmedCopy as PendingNoteRecord['confirmedCopy'] } : {}) };
}

export function createServerPendingStore(scope: PendingNoteScope, suppliedStorage?: Storage) {
  const scopedPrefix = prefix(scope);
  const getStorage = () => suppliedStorage ?? window.localStorage;
  const recordKey = (documentRef: string, draftId: string) => {
    if (!documentRef || !uuid.test(draftId)) throw new Error('invalid_pending_note_identity');
    return `${scopedPrefix}${encode(documentRef)}:${draftId}`;
  };

  function list(): PendingNoteRecord[] {
    const storage = getStorage();
    const records: PendingNoteRecord[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(scopedPrefix)) continue;
      const raw = storage.getItem(key);
      if (raw === null) throw new Error('pending_note_changed_during_discovery');
      const record = readRecord(raw, scope);
      if (key !== recordKey(record.scope.documentRef, record.draftId)) throw new Error('corrupt_pending_note_record');
      records.push(record);
    }
    return records.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  }

  function write(input: Omit<PendingNoteRecord, 'version' | 'scope' | 'savedAt'> & { documentRef: string }): PendingNoteRecord {
    if (!input.documentRef || !uuid.test(input.draftId) ||
      !['draft', 'pending', 'confirmed'].includes(input.status) ||
      'error' in readNoteSnapshotFile(input.snapshotText) || !validBase(input.base, scope)) {
      throw new Error('invalid_pending_note_draft');
    }
    if ((input.status === 'draft') === !!input.attempt ||
      (input.attempt && (input.attempt.snapshotText !== input.snapshotText ||
        input.base.operation !== input.attempt.operation ||
        (input.attempt.operation === 'create' && input.attempt.workspaceId !== scope.workspaceId) ||
        (input.attempt.operation === 'update' && input.base.operation === 'update' &&
          (input.attempt.documentId !== input.base.documentId || input.attempt.expectedRevision !== input.base.expectedRevision))))) {
      throw new Error('pending_note_attempt_mismatch');
    }
    if ((input.source !== undefined && (!validSource(input.source) || input.base.operation !== 'create')) ||
      (input.confirmedCopy !== undefined && (!validCopy(input.confirmedCopy) || !input.source || input.status !== 'confirmed'))) {
      throw new Error('invalid_pending_note_copy');
    }
    const record: PendingNoteRecord = {
      version: 1, draftId: input.draftId, scope: { ...scope, documentRef: input.documentRef },
      base: input.base, status: input.status, snapshotText: input.snapshotText,
      ...(input.attempt ? { attempt: noteSaveAttempt(input.attempt) } : {}), savedAt: new Date().toISOString(),
      ...(input.source ? { source: { ...input.source } } : {}),
      ...(input.confirmedCopy ? { confirmedCopy: { ...input.confirmedCopy } } : {})
    };
    const storage = getStorage();
    const key = recordKey(input.documentRef, input.draftId);
    const previousRaw = storage.getItem(key);
    if (previousRaw !== null) {
      const previous = readRecord(previousRaw, scope);
      if (previous.status !== 'draft' &&
        (previous.snapshotText !== record.snapshotText || !same(previous.attempt, record.attempt) || !same(previous.source, record.source))) {
        throw new Error('fixed_pending_note_cannot_be_replaced');
      }
    }
    const raw = JSON.stringify(record);
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw new Error('pending_note_write_not_verified');
    return record;
  }

  return { list, write, key: recordKey };
}

export function newPendingNoteDraftId() { return crypto.randomUUID(); }
