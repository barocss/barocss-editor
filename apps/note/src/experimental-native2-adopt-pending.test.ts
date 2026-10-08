import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { parseRegistryDefinition, REGISTRY_DIGEST } from '@barocss/schema/registry-contract';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS } from './native2-scenario-fixtures';
import { createExperimentalNative2Adopter } from './experimental-native2-adopt';
import { createExperimentalNative2AdoptJournal } from './experimental-native2-adopt-pending';
const scope = { issuer: 'controlled-issuer', subject: 'controlled-writer', tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
const documentId = '33333333-3333-4333-8333-333333333333', original = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A);
const target = JSON.stringify({ format: 'barocss-note', version: 2, schemaBundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle,
  document: NATIVE_NOTE_FIXTURES.TARGET_A2.document, savedAt: NATIVE_NOTE_FIXTURES.TARGET_A2.savedAt }, null, 2) + '\n';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const base = { snapshotText: original, document: { documentId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, product: 'note' as const,
  title: 'SOURCE_A', creatorUserId: null, metadataRevision: 1, mode: 'snapshot' as const, pageId: 'native2-note-A',
  documentKey: `wonffice-${scope.tenantId}-${documentId}`, fileFormat: 'barocss-note' as const, fileVersion: 2 as const, revision: 1, snapshotHash: hash(original) } };
class MemoryStorage implements Storage {
  items = new Map<string, string>(); fail = false; mismatch = false;
  get length() { return this.items.size; } clear() { this.items.clear(); } key(i: number) { return [...this.items.keys()][i] ?? null; }
  getItem(key: string) { const v = this.items.get(key) ?? null; return this.mismatch && v ? v + ' ' : v; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('controlled quota'); this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}
function setup(storage = new MemoryStorage(), suppliedScope = scope) {
  let current = true;
  const records = NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.definitions.map(e => ({ ...e.reference, digestAlgorithm: REGISTRY_DIGEST,
    definitionText: e.definitionText, ...parseRegistryDefinition(e.definitionText), actorIdentityId: '66666666-6666-4666-8666-666666666666', createdAt: '2026-10-01T00:00:00.000Z' }));
  const receipt = { operation: 'update', idempotencyKey: 'native2-adopt-test-1', requestHash: 'f'.repeat(64), document: { ...base.document, revision: 2, snapshotHash: hash(target) }, snapshotText: target };
  const replies = [Response.json({ record: records[3], dependencies: [records[1], records[0], records[2]] }), Response.json(receipt),
    Response.json({ document: receipt.document, snapshotText: target }), Response.json({ status: 'pinned', documentId, documentRevision: 2,
      snapshotHash: hash(target), nativeFormat: { format: 'barocss-note', version: 2 }, bundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle })];
  const journal = createExperimentalNative2AdoptJournal({ scope: suppliedScope, documentId, storage, isWritableCurrent: () => true });
  const writer = createExperimentalNative2Adopter({ scope: suppliedScope, apiBase: '/controlled-native2', isCurrent: () => current, isAdoptWritableCurrent: () => current,
    hasUnresolvedPrior: async () => false, readDurableAttempt: async () => (await journal.read())?.fixed,
    authorizedFetch: async () => { const r = replies.shift(); if (!r) throw new Error('No extra HTTP effect'); return r; } });
  return { journal, writer, storage, replies, receipt, retire: () => { current = false; } };
}
async function fixed(h = setup()) {
  const choice = await h.writer.resolveExact(NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.selected[0]);
  await h.journal.writeDraft(base, { generation: 1, snapshotText: original });
  const attempt = await h.writer.freeze(base, original, choice, [4, 0], 'native2-adopt-test-1', 1); await h.journal.fix(attempt);
  return { ...h, attempt };
}
describe('private adoption target and original-context draft recovery', () => {
  it('whole fixed target stays immutable while real source draft advances; reload does not install target or send', async () => {
    const h = await fixed(), later = JSON.stringify(NATIVE_NOTE_EXPECTED_VARIANTS.nested);
    await h.journal.writeDraft(base, { generation: 2, snapshotText: later }); await h.journal.markUnknown(h.attempt);
    const recovered = await createExperimentalNative2AdoptJournal({ scope, documentId, storage: h.storage, isWritableCurrent: () => true }).read();
    expect(recovered?.fixed).toEqual(h.attempt); expect(recovered?.fixed?.schemaAction).toBe('adopt'); expect(recovered?.fixed?.snapshotText).toBe(target);
    expect(recovered?.latestSourceDraft).toEqual({ generation: 2, snapshotText: later }); expect(recovered?.base).toEqual(base); expect(recovered?.phase).toBe('unknown');
    expect(h.replies).toHaveLength(3); expect(h.journal.key).toContain('experimental-native2-adopt.v1:');
  });
  it('cannot replace unknown fixed action/body/choice/key or reinterpret target as latest source context', async () => {
    const h = await fixed(), before = h.storage.getItem(h.journal.key);
    const choice = await h.writer.recoverAttempt(h.attempt);
    await expect(h.journal.fix({ ...choice, idempotencyKey: 'changed' })).rejects.toBeDefined(); expect(h.storage.getItem(h.journal.key)).toBe(before);
    await expect(h.journal.writeDraft(base, { generation: 2, snapshotText: target })).rejects.toBeDefined(); expect(h.storage.getItem(h.journal.key)).toBe(before);
    await h.journal.writeDraft(base, { generation: 2, snapshotText: JSON.stringify(NATIVE_NOTE_EXPECTED_VARIANTS.typing) });
    const later = h.storage.getItem(h.journal.key);
    await expect(h.journal.writeDraft(base, { generation: 1, snapshotText: original })).rejects.toThrow('native2_adopt_source_generation_conflict'); expect(h.storage.getItem(h.journal.key)).toBe(later);
    await expect(h.journal.writeDraft({ ...base, document: { ...base.document, revision: 9 } }, { generation: 3, snapshotText: original })).rejects.toThrow('native2_adopt_base_cannot_advance'); expect(h.storage.getItem(h.journal.key)).toBe(later);
  });
  it('direct verified target confirmation retains complete later original-context draft and refuses phase regression', async () => {
    const h = await fixed(), direct = await h.writer.send(h.attempt); await h.journal.observeDirect(h.attempt, direct);
    const proof = await h.writer.confirm(h.attempt, direct); if (proof.status !== 'adoption-fixed-confirmed') throw new Error('Whole target current read required');
    const later = JSON.stringify(NATIVE_NOTE_EXPECTED_VARIANTS.nested); await h.journal.writeDraft(base, { generation: 2, snapshotText: later });
    await h.journal.confirmFixed(proof); const saved = await h.journal.read();
    expect(saved?.phase).toBe('adoption-fixed-confirmed'); expect(saved?.latestSourceDraft.snapshotText).toBe(later); expect(saved?.fixed).toEqual(h.attempt);
    const raw = h.storage.getItem(h.journal.key); await expect(h.journal.markUnknown(h.attempt)).rejects.toThrow('native2_adopt_confirmation_cannot_regress'); expect(h.storage.getItem(h.journal.key)).toBe(raw); expect(h.replies).toHaveLength(0);
  });
  it.each(['observeDirect', 'confirmFixed'] as const)('origin retires during awaited %s while fresh journal remains current; entire prior durable raw is unchanged', async action => {
    const h = await fixed(), direct = await h.writer.send(h.attempt), proof = await h.writer.confirm(h.attempt, direct);
    if (proof.status !== 'adoption-fixed-confirmed') throw new Error('Exact current target required');
    if (action === 'confirmFixed') await h.journal.observeDirect(h.attempt, direct);
    const fresh = createExperimentalNative2AdoptJournal({ scope, documentId, storage: h.storage, isWritableCurrent: () => true });
    const before = h.storage.getItem(fresh.key); let entered!: () => void, release!: () => void, count = 0;
    const waiting = new Promise<void>(r => { entered = r; }), held = new Promise<void>(r => { release = r; });
    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await realDigest(...args); if (++count === 9) { entered(); await held; } return result;
    });
    try {
      const pending = action === 'observeDirect' ? fresh.observeDirect(h.attempt, direct) : fresh.confirmFixed(proof);
      await waiting; h.retire(); release(); await expect(pending).rejects.toThrow('native2_adopt_origin_retired'); expect(h.storage.getItem(fresh.key)).toBe(before); expect(h.replies).toHaveLength(0);
    } finally { spy.mockRestore(); release(); }
  });
  it('scope separation retains original record and quota/readback failure never invents protection', async () => {
    const h = await fixed(), before = h.storage.getItem(h.journal.key);
    expect(await setup(h.storage, { ...scope, subject: 'other-user' }).journal.read()).toBeUndefined();
    expect(await setup(h.storage, { ...scope, issuer: 'other-issuer' }).journal.read()).toBeUndefined(); expect(h.storage.getItem(h.journal.key)).toBe(before);
    h.storage.fail = true; await expect(h.journal.writeDraft(base, { generation: 2, snapshotText: original })).rejects.toThrow('controlled quota'); expect(h.storage.getItem(h.journal.key)).toBe(before);
    const storage = new MemoryStorage(); storage.mismatch = true; await expect(setup(storage).journal.writeDraft(base, { generation: 1, snapshotText: original })).rejects.toThrow('native2_adopt_write_not_verified');
  });
  it.each(['duplicate', 'broken', 'wrong-action', 'foreign', 'array-phase', 'target-as-source'] as const)('corrupt %s raw is not deleted or rewritten', async kind => {
    const h = await fixed(); const decoded: unknown = JSON.parse(h.storage.getItem(h.journal.key)!);
    if (!decoded || typeof decoded !== 'object' || !('fixed' in decoded)) throw new Error('Whole fixed record required');
    const value = { ...decoded };
    const raw = kind === 'broken' ? '{broken' : kind === 'duplicate' ? JSON.stringify(value).replace('"version":1', '"version":1,"version":1') :
      kind === 'array-phase' ? JSON.stringify({ ...value, phase: ['pending'] }) : kind === 'target-as-source' ? JSON.stringify({ ...value, latestSourceDraft: { generation: 2, snapshotText: target } }) :
      kind === 'foreign' ? JSON.stringify({ ...value, scope: { ...scope, subject: 'other-user', documentId } }) :
      JSON.stringify({ ...value, fixed: { ...h.attempt, schemaAction: 'preserve' } });
    h.storage.setItem(h.journal.key, raw); await expect(h.journal.read()).rejects.toThrow('corrupt_native2_adopt_record'); expect(h.storage.getItem(h.journal.key)).toBe(raw);
  });
});
