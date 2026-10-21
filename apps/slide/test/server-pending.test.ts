import { describe, expect, it } from 'vitest';
import { createStarterDeck } from '@barocss/office-slides';
import { serverSlidesFileText } from '../src/server-file';
import { createServerPendingStore, type PendingSlidesScope } from '../src/server-pending';
import { slidesSaveAttempt } from '../src/server-documents';

const scope: PendingSlidesScope = { issuer: 'https://login.example.test', subject: 'user-a',
  tenantId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' };
const sourceRef = '33333333-3333-4333-8333-333333333333';
const tree = createStarterDeck();
tree.metadata = { label: 'Exact local body' };
const snapshot = serverSlidesFileText(tree);
const docId = '44444444-4444-4444-8444-444444444444';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('durable Slides recovery records', () => {
  it('keeps independent drafts for two tabs and discovers both without a mutable index', () => {
    const storage = new MemoryStorage();
    const store = createServerPendingStore(scope, storage);
    store.write({ draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: docId,
      base: { operation: 'update', documentId: docId, expectedRevision: 3 }, status: 'draft', snapshotText: snapshot });
    store.write({ draftId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', documentRef: docId,
      base: { operation: 'update', documentId: docId, expectedRevision: 3 }, status: 'draft', snapshotText: snapshot.replace('Exact local body', 'Other tab body') });

    const recovered = createServerPendingStore(scope, storage).list();
    expect(recovered).toHaveLength(2);
    expect(new Set(recovered.map(record => record.draftId))).toEqual(new Set([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    ]));
    expect(recovered.map(record => record.snapshotText)).toContain(snapshot);
    expect(recovered.map(record => record.snapshotText)).toContain(snapshot.replace('Exact local body', 'Other tab body'));
  });

  it('recognizes the same verified account when caller property order changes', () => {
    const storage = new MemoryStorage();
    const reordered = { tenantId: scope.tenantId, workspaceId: scope.workspaceId, subject: scope.subject, issuer: scope.issuer };
    const store = createServerPendingStore(reordered, storage);
    const input = { draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: docId,
      base: { operation: 'update' as const, documentId: docId, expectedRevision: 1 }, status: 'draft' as const, snapshotText: snapshot };
    store.write(input);
    store.write({ ...input, snapshotText: snapshot.replace('Exact local body', 'Latest input') });
    expect(createServerPendingStore(scope, storage).list()[0].snapshotText).toContain('Latest input');
    expect(createServerPendingStore(reordered, storage).list()).toHaveLength(1);
  });

  it('reuses the exact create attempt after reload, including the original body and idempotency key', () => {
    const storage = new MemoryStorage();
    const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const attempt = slidesSaveAttempt({ operation: 'create', workspaceId: scope.workspaceId,
      title: 'Recovered', snapshotText: snapshot, idempotencyKey: 'copy-attempt-1' });
    createServerPendingStore(scope, storage).write({ draftId, documentRef: sourceRef,
      base: { operation: 'create', workspaceId: scope.workspaceId }, status: 'pending', snapshotText: snapshot, attempt });

    const record = createServerPendingStore(scope, storage).list()[0];
    expect(record.draftId).toBe(draftId);
    expect(record.attempt).toEqual(attempt);
    expect(record.attempt?.idempotencyKey).toBe('copy-attempt-1');
    expect(record.snapshotText).toBe(snapshot);
  });

  it('partitions records by verified account and tenant without deleting hidden records', () => {
    const storage = new MemoryStorage();
    const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    createServerPendingStore(scope, storage).write({ draftId, documentRef: docId,
      base: { operation: 'update', documentId: docId, expectedRevision: 1 }, status: 'draft', snapshotText: snapshot });

    const otherAccount = createServerPendingStore({ ...scope, subject: 'user-b' }, storage);
    expect(otherAccount.list()).toEqual([]);
    expect(createServerPendingStore({ ...scope, tenantId: '55555555-5555-4555-8555-555555555555' }, storage).list()).toEqual([]);
    expect(createServerPendingStore(scope, storage).list()).toHaveLength(1);
  });

  it('fails the current write when browser storage refuses it', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    expect(() => createServerPendingStore(scope, storage).write({
      draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: docId,
      base: { operation: 'update', documentId: docId, expectedRevision: 1 }, status: 'draft', snapshotText: snapshot
    })).toThrow('quota');
  });

  it('does not accept an attempt whose persisted body differs from the request', () => {
    const storage = new MemoryStorage();
    const attempt = slidesSaveAttempt({ operation: 'update', documentId: docId, expectedRevision: 1,
      snapshotText: snapshot, idempotencyKey: 'update-attempt-1' });
    expect(() => createServerPendingStore(scope, storage).write({
      draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: docId,
      base: { operation: 'update', documentId: docId, expectedRevision: 1 }, status: 'pending',
      snapshotText: snapshot.replace('Exact local body', 'changed body'), attempt
    })).toThrow('pending_slides_attempt_mismatch');
  });

  it('keeps a fixed pending attempt when a stale writer tries to replace it', () => {
    const store = createServerPendingStore(scope, new MemoryStorage());
    const attempt = slidesSaveAttempt({ operation: 'update', documentId: docId, expectedRevision: 1,
      snapshotText: snapshot, idempotencyKey: 'original-attempt' });
    const input = { draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: docId,
      base: { operation: 'update' as const, documentId: docId, expectedRevision: 1 },
      status: 'pending' as const, snapshotText: snapshot, attempt };
    store.write(input);
    expect(() => store.write({ ...input, attempt: { ...attempt, idempotencyKey: 'other-attempt' } })).toThrow('fixed_pending_slides_cannot_be_replaced');
    expect(store.list()[0]?.attempt).toEqual(attempt);
  });

  it('does not claim protection when a storage implementation silently discards a write', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => undefined;
    expect(() => createServerPendingStore(scope, storage).write({
      draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: docId,
      base: { operation: 'update', documentId: docId, expectedRevision: 1 }, status: 'draft', snapshotText: snapshot
    })).toThrow('pending_slides_write_not_verified');
  });
  it('retains a selected IndexedDB source and its confirmed server mapping across reloads', () => {
    const storage = new MemoryStorage();
    const store = createServerPendingStore(scope, storage);
    const attempt = slidesSaveAttempt({ operation: 'create', workspaceId: scope.workspaceId,
      title: 'Recovered', snapshotText: snapshot, idempotencyKey: 'copy-source-1' });
    const input = { draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: sourceRef,
      base: { operation: 'create' as const, workspaceId: scope.workspaceId }, status: 'pending' as const,
      snapshotText: snapshot, attempt, source: { kind: 'indexeddb-slides' as const, name: sourceRef } };
    store.write(input);
    expect(createServerPendingStore(scope, storage).list()[0]?.source).toEqual(input.source);
    const confirmedCopy = { documentId: docId, revision: 1, snapshotHash: 'a'.repeat(64) };
    store.write({ ...input, status: 'confirmed', confirmedCopy });
    const restored = createServerPendingStore(scope, storage).list()[0];
    expect(restored.source).toEqual(input.source);
    expect(restored.snapshotText).toBe(snapshot);
    expect(restored.confirmedCopy).toEqual(confirmedCopy);
    expect(() => store.write({ ...input, source: { ...input.source, name: 'another-local-source' } }))
      .toThrow('fixed_pending_slides_cannot_be_replaced');
  });

  it('retains later input separately from a fixed attempt and isolates issuer, workspace and document', () => {
    const storage = new MemoryStorage();
    const store = createServerPendingStore(scope, storage);
    const attempt = slidesSaveAttempt({ operation: 'update', documentId: docId, expectedRevision: 1,
      snapshotText: snapshot, idempotencyKey: 'exact-retry' });
    store.write({ draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: docId,
      base: { operation: 'update', documentId: docId, expectedRevision: 1 }, status: 'pending', snapshotText: snapshot, attempt });
    store.write({ draftId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', documentRef: docId,
      base: { operation: 'update', documentId: docId, expectedRevision: 1 }, status: 'draft',
      snapshotText: snapshot.replace('Exact local body', 'Later local edit') });
    const records = createServerPendingStore(scope, storage).list();
    expect(records.find(record => record.status === 'pending')?.attempt).toEqual(attempt);
    expect(records.find(record => record.status === 'draft')?.snapshotText).toContain('Later local edit');
    expect(createServerPendingStore({ ...scope, issuer: 'https://other-login.test' }, storage).list()).toEqual([]);
    expect(createServerPendingStore({ ...scope, workspaceId: '55555555-5555-4555-8555-555555555555' }, storage).list()).toEqual([]);
    expect(() => store.write({ draftId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', documentRef: sourceRef,
      base: { operation: 'update', documentId: docId, expectedRevision: 1 }, status: 'draft', snapshotText: snapshot }))
      .toThrow('invalid_pending_slides_draft');
    expect(store.list()).toHaveLength(2);
  });

});


it('retains an old v1 pending body and immutable attempt through restart', () => {
  const legacy = JSON.stringify({ format: 'barocss-slides', version: 1, document: createStarterDeck() });
  const storage = new MemoryStorage();
  const attempt = slidesSaveAttempt({ operation: 'create', workspaceId: scope.workspaceId, title: 'Legacy',
    snapshotText: legacy, idempotencyKey: 'old-v1-attempt' });
  createServerPendingStore(scope, storage).write({ draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentRef: sourceRef,
    base: { operation: 'create', workspaceId: scope.workspaceId }, status: 'pending', snapshotText: legacy, attempt });
  const restored = createServerPendingStore(scope, storage).list()[0];
  expect(restored.snapshotText).toBe(legacy);
  expect(restored.attempt).toEqual(attempt);
  expect(JSON.parse(restored.attempt!.snapshotText).version).toBe(1);
});
