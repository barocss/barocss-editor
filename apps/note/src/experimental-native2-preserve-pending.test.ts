import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS } from './native2-scenario-fixtures';
import { createExperimentalNative2Preserver } from './experimental-native2-preserve';
import { createExperimentalNative2PendingJournal } from './experimental-native2-preserve-pending';

const scope = { issuer: 'controlled-issuer', subject: 'controlled-writer', tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
const documentId = '33333333-3333-4333-8333-333333333333';
const original = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A);
const base = { snapshotText: original, document: { documentId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, product: 'note' as const,
  title: 'Controlled original', creatorUserId: null, metadataRevision: 1, mode: 'snapshot' as const, pageId: 'native2-note-A',
  documentKey: `wonffice-${scope.tenantId}-${documentId}`, fileFormat: 'barocss-note' as const, fileVersion: 2 as const, revision: 1,
  snapshotHash: createHash('sha256').update(original).digest('hex') } };
class MemoryStorage implements Storage {
  items = new Map<string, string>(); fail = false; mismatch = false;
  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  getItem(key: string) { const v = this.items.get(key) ?? null; return this.mismatch && v !== null ? v + ' ' : v; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('controlled quota'); this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}
function setup(storage = new MemoryStorage(), suppliedScope = scope) {
  let current = true;
  const journal = createExperimentalNative2PendingJournal({ scope: suppliedScope, documentId, storage, isWritableCurrent: () => current });
  const writer = createExperimentalNative2Preserver({ scope: suppliedScope, apiBase: '/controlled-native2',
    authorizedFetch: async () => { throw new Error('No network allowed in journal test'); }, isCurrent: () => current,
    isWritableCurrent: () => current, readDurableAttempt: async () => (await journal.read())?.fixed });
  return { journal, writer, storage, retire: () => { current = false; } };
}
describe('private native2 preserve recovery journal', () => {
  it.each(['observeDirect', 'confirmFixed', 'nextFixed'] as const)('retired originating proof during awaited %s cannot advance a separately current journal', async operation => {
    const h = setup(); let originCurrent = true;
    await h.journal.writeDraft(base, { generation: 1, snapshotText: original });
    const receipt = { operation: 'update', idempotencyKey: 'native2-preserve-test-1', requestHash: 'e'.repeat(64),
      document: { ...base.document, revision: 2 }, snapshotText: original };
    const replies = [Response.json(receipt), Response.json({ document: receipt.document, snapshotText: original }), Response.json({
      status: 'pinned', documentId, documentRevision: 2, snapshotHash: base.document.snapshotHash,
      nativeFormat: { format: 'barocss-note', version: 2 }, bundle: NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle })];
    const writer = createExperimentalNative2Preserver({ scope, apiBase: '/controlled-native2',
      authorizedFetch: async () => { const reply = replies.shift(); if (!reply) throw new Error('No additional effect'); return reply; },
      isCurrent: () => originCurrent, isWritableCurrent: () => originCurrent, readDurableAttempt: async () => (await h.journal.read())?.fixed });
    const fixed = await writer.freeze(base, original, receipt.idempotencyKey, 1); await h.journal.fix(fixed);
    const direct = await writer.send(fixed), proof = await writer.confirm(fixed, direct);
    if (proof.status !== 'fixed-confirmed') throw new Error('Full original current confirmation required');
    if (operation !== 'observeDirect') await h.journal.observeDirect(fixed, direct);
    if (operation === 'nextFixed') { await h.journal.confirmFixed(proof); await h.journal.writeDraft(base, { generation: 2, snapshotText: original }); }
    const next = operation === 'nextFixed' ? await writer.freeze({ document: proof.read.document, snapshotText: proof.read.snapshotText }, original, 'next-fixed-key', 2) : undefined;
    const fresh = createExperimentalNative2PendingJournal({ scope, documentId, storage: h.storage, isWritableCurrent: () => true });
    const before = h.storage.getItem(fresh.key); let entered!: () => void, release!: () => void, count = 0;
    const waiting = new Promise<void>(r => { entered = r; }), held = new Promise<void>(r => { release = r; });
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await originalDigest(...args); if (++count === (operation === 'nextFixed' ? 8 : 5)) { entered(); await held; } return result;
    });
    try {
      const pending = operation === 'observeDirect' ? fresh.observeDirect(fixed, direct) : operation === 'confirmFixed' ? fresh.confirmFixed(proof) : fresh.nextFixed(proof, next!);
      await waiting; originCurrent = false; release();
      await expect(pending).rejects.toThrow('native2_origin_proof_retired'); expect(h.storage.getItem(fresh.key)).toBe(before);
      expect(replies).toHaveLength(0);
    } finally { spy.mockRestore(); release(); }
  });
  it('explicit verified next freeze retains the whole prior fixed lineage and later draft; foreign or unresolved advance has no effect', async () => {
    const h = setup(); const later = JSON.stringify(NATIVE_NOTE_EXPECTED_VARIANTS.nested);
    const receipt = { operation: 'update', idempotencyKey: 'native2-preserve-test-1', requestHash: 'e'.repeat(64),
      document: { ...base.document, revision: 2 }, snapshotText: original };
    const replies = [Response.json(receipt), Response.json({ document: receipt.document, snapshotText: original }), Response.json({
      status: 'pinned', documentId, documentRevision: 2, snapshotHash: base.document.snapshotHash,
      nativeFormat: { format: 'barocss-note', version: 2 }, bundle: NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle })];
    const writer = createExperimentalNative2Preserver({ scope, apiBase: '/controlled-native2', authorizedFetch: async () => {
      const response = replies.shift(); if (!response) throw new Error('No extra HTTP effect'); return response;
    }, isCurrent: () => true, isWritableCurrent: () => true, readDurableAttempt: async () => (await h.journal.read())?.fixed });
    await h.journal.writeDraft(base, { generation: 1, snapshotText: original });
    const fixed = await writer.freeze(base, original, receipt.idempotencyKey, 1); await h.journal.fix(fixed);
    const direct = await writer.send(fixed); await h.journal.observeDirect(fixed, direct);
    const proof = await writer.confirm(fixed, direct); if (proof.status !== 'fixed-confirmed') throw new Error('Current read required');
    await h.journal.writeDraft(base, { generation: 2, snapshotText: later });
    const nextBase = { document: proof.read.document, snapshotText: proof.read.snapshotText };
    const next = await writer.freeze(nextBase, later, 'explicit-next-fixed', 2);
    const unresolved = h.storage.getItem(h.journal.key);
    await expect(h.journal.nextFixed(proof, next)).rejects.toThrow('native2_next_fixed_conflict'); expect(h.storage.getItem(h.journal.key)).toBe(unresolved);
    await h.journal.confirmFixed(proof); const confirmedRaw = h.storage.getItem(h.journal.key);
    const foreign = await writer.freeze({ ...nextBase, document: { ...nextBase.document, revision: 9 } }, later, 'foreign-next-fixed', 2);
    await expect(h.journal.nextFixed(proof, foreign)).rejects.toThrow('native2_next_fixed_conflict'); expect(h.storage.getItem(h.journal.key)).toBe(confirmedRaw);
    const advanced = await h.journal.nextFixed(proof, next);
    expect(advanced).toEqual({ version: 1, kind: 'experimental-native2-preserve', scope: { ...scope, documentId }, base: nextBase,
      latestDraft: { generation: 2, snapshotText: later }, fixed: next, phase: 'pending', lineage: [{ fixed, requestHash: receipt.requestHash }] });
    expect(await setup(h.storage).journal.read()).toEqual(advanced); expect(replies).toHaveLength(0);
  });
  it('durably protects a full fixed request while later independently authored raw advances; reload is no send', async () => {
    const h = setup(); await h.journal.writeDraft(base, { generation: 1, snapshotText: original });
    const fixed = await h.writer.freeze(base, original, 'native2-preserve-test-1', 1); await h.journal.fix(fixed);
    const before = await h.journal.read(); expect(before?.fixed).toEqual(fixed); expect(before?.phase).toBe('pending');
    const later = JSON.stringify(NATIVE_NOTE_EXPECTED_VARIANTS.nested);
    await h.journal.writeDraft(base, { generation: 2, snapshotText: later }); await h.journal.markUnknown(fixed);
    const reloaded = await setup(h.storage).journal.read();
    expect(reloaded?.base).toEqual(base); expect(reloaded?.fixed).toEqual(fixed);
    expect(reloaded?.latestDraft).toEqual({ generation: 2, snapshotText: later }); expect(reloaded?.phase).toBe('unknown');
    expect(h.journal.key).toContain('wonffice.note.experimental-native2-preserve.v1:');
    expect(h.journal.key).not.toContain('wonffice.note.pending.v1:');
  });
  it('cannot replace unknown fixed bytes/key/base or roll back later generation', async () => {
    const h = setup(), fixed = await h.writer.freeze(base, original, 'native2-preserve-test-1', 1);
    await h.journal.writeDraft(base, { generation: 1, snapshotText: original }); await h.journal.fix(fixed);
    const protectedRaw = h.storage.getItem(h.journal.key);
    const changed = await h.writer.freeze(base, original, 'another-key', 1);
    await expect(h.journal.fix(changed)).rejects.toThrow('fixed_native2_attempt_cannot_be_replaced'); expect(h.storage.getItem(h.journal.key)).toBe(protectedRaw);
    await h.journal.writeDraft(base, { generation: 2, snapshotText: JSON.stringify(NATIVE_NOTE_EXPECTED_VARIANTS.typing) });
    const laterRaw = h.storage.getItem(h.journal.key);
    await expect(h.journal.writeDraft(base, { generation: 1, snapshotText: original })).rejects.toThrow('native2_draft_generation_conflict');
    expect(h.storage.getItem(h.journal.key)).toBe(laterRaw);
    await expect(h.journal.writeDraft({ ...base, document: { ...base.document, revision: 9 } }, { generation: 3, snapshotText: original })).rejects.toBeDefined();
    expect(h.storage.getItem(h.journal.key)).toBe(laterRaw);
  });
  it('foreign issuer/subject cannot discover same document recovery; original scope returning recovers exact record', async () => {
    const h = setup(); await h.journal.writeDraft(base, { generation: 1, snapshotText: original });
    const raw = h.storage.getItem(h.journal.key);
    for (const foreign of [{ ...scope, subject: 'other-user' }, { ...scope, issuer: 'other-issuer' }]) {
      expect(await setup(h.storage, foreign).journal.read()).toBeUndefined();
    }
    expect((await setup(h.storage).journal.read())?.latestDraft.snapshotText).toBe(original); expect(h.storage.getItem(h.journal.key)).toBe(raw);
  });
  it('quota leaves previously verified fixed raw; mismatched readback never reports protection', async () => {
    const h = setup(), fixed = await h.writer.freeze(base, original, 'native2-preserve-test-1', 1);
    await h.journal.writeDraft(base, { generation: 1, snapshotText: original }); await h.journal.fix(fixed);
    const raw = h.storage.getItem(h.journal.key); h.storage.fail = true;
    await expect(h.journal.writeDraft(base, { generation: 2, snapshotText: JSON.stringify(NATIVE_NOTE_EXPECTED_VARIANTS.nested) })).rejects.toThrow('controlled quota');
    expect(h.storage.getItem(h.journal.key)).toBe(raw); h.storage.fail = false;
    // Real Storage set succeeds but its next read does not match. This cannot be credited durable.
    const mismatched = new MemoryStorage(); mismatched.mismatch = true;
    await expect(setup(mismatched).journal.writeDraft(base, { generation: 1, snapshotText: original })).rejects.toThrow('native2_pending_write_not_verified');
  });
  it.each(['invalid-json', 'foreign-scope', 'wrong-body', 'native1', 'duplicate-key'] as const)('retains corrupt %s raw without rewrite or removal', async kind => {
    const h = setup(), fixed = await h.writer.freeze(base, original, 'native2-preserve-test-1', 1);
    await h.journal.writeDraft(base, { generation: 1, snapshotText: original }); await h.journal.fix(fixed);
    const value = JSON.parse(h.storage.getItem(h.journal.key)!);
    if (kind === 'foreign-scope') value.scope.subject = 'other-user';
    if (kind === 'wrong-body') value.fixed.bodyText = value.fixed.bodyText.replace('preserve', 'adopt');
    if (kind === 'native1') value.latestDraft.snapshotText = '{"format":"barocss-note","version":1}';
    const raw = kind === 'invalid-json' ? '{broken' : kind === 'duplicate-key' ? JSON.stringify(value).replace('"version":1', '"version":1,"version":1') : JSON.stringify(value);
    h.storage.setItem(h.journal.key, raw);
    await expect(h.journal.read()).rejects.toThrow('corrupt_native2_pending_record'); expect(h.storage.getItem(h.journal.key)).toBe(raw);
  });
  it('retirement cannot persist or recover on behalf of the old captured owner', async () => {
    const h = setup(); await h.journal.writeDraft(base, { generation: 1, snapshotText: original }); const raw = h.storage.getItem(h.journal.key); h.retire();
    await expect(h.journal.writeDraft(base, { generation: 2, snapshotText: original })).rejects.toThrow('stale_native2_writable_context');
    await expect(h.journal.read()).rejects.toThrow('stale_native2_writable_context'); expect(h.storage.getItem(h.journal.key)).toBe(raw);
  });
});
