import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree } from '@barocss/office-note';
import { parseRegistryDefinition, REGISTRY_DIGEST } from '@barocss/schema/registry-contract';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS } from './native2-scenario-fixtures';
import { createExperimentalNative2NoteReader } from './experimental-native2-reader';
import { createExperimentalNative2Adopter } from './experimental-native2-adopt';
import { createExperimentalNative2AdoptJournal } from './experimental-native2-adopt-pending';
import { createProtectedNative2Handoff } from './experimental-native2-editable-target';
const scope = { issuer: 'controlled-issuer', subject: 'controlled-writer', tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
const documentId = '33333333-3333-4333-8333-333333333333', hash = (s: string) => createHash('sha256').update(s).digest('hex');
const original = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A);
const targetDocument = { ...NATIVE_NOTE_FIXTURES.TARGET_A2.document, content: NATIVE_NOTE_FIXTURES.TARGET_A2.document.content.map((node, index) => index === 0 ? NATIVE_NOTE_EXPECTED_VARIANTS.typing.document.content[0] : node) };
const target = JSON.stringify({ format: 'barocss-note', version: 2, schemaBundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle,
  document: targetDocument, savedAt: NATIVE_NOTE_FIXTURES.TARGET_A2.savedAt }, null, 2) + '\n';
const base = { snapshotText: original, document: { documentId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, product: 'note' as const,
  title: 'SOURCE_A', creatorUserId: null, metadataRevision: 1, mode: 'snapshot' as const, pageId: 'native2-note-A', documentKey: `wonffice-${scope.tenantId}-${documentId}`,
  fileFormat: 'barocss-note' as const, fileVersion: 2 as const, revision: 1, snapshotHash: hash(original) } };
class MemoryStorage implements Storage {
  data = new Map<string,string>(); get length() { return this.data.size; } clear() { this.data.clear(); }
  key(i: number) { return [...this.data.keys()][i] ?? null; } getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string,v: string) { this.data.set(k,v); } removeItem(k: string) { this.data.delete(k); }
}
async function setup() {
  let oldCurrent = true, role = true;
  const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Trusted controlled source authority' }] }] });
  const session = openNoteNativeSnapshot(createNoteNative2Context(original), { authority: authority.editor, after: 60000 });
  const leaf = [...session.editor.dataStore.getNodes().values()].find(n => n.text === '\uBAA9\uD45C A');
  if (!leaf?.sid) throw new Error('Real heading required');
  const range = { type: 'range' as const, startNodeId: leaf.sid, endNodeId: leaf.sid, startOffset: 4, endOffset: 4, collapsed: true };
  expect(await session.editor.executeCommand('replaceText', { range, text: ' \u2022 \uB3C5\uB9BD \uD3B8\uC9D1' })).toBe(true);
  session.flush();
  const sourceText = session.exportSnapshot();
  expect(session.exportNativeDocument()).toEqual(NATIVE_NOTE_EXPECTED_VARIANTS.typing.document);
  expect(session.editor.getHistoryStats().totalEntries).toBeGreaterThan(0);
  const entries = NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.definitions.map(e => ({ ...e.reference, digestAlgorithm: REGISTRY_DIGEST, definitionText: e.definitionText,
    ...parseRegistryDefinition(e.definitionText), actorIdentityId: '66666666-6666-4666-8666-666666666666', createdAt: '2026-10-01T00:00:00.000Z' }));
  const receipt = { operation: 'update', idempotencyKey: 'native2-adopt-test-1', requestHash: 'f'.repeat(64), document: { ...base.document, revision: 2, snapshotHash: hash(target) }, snapshotText: target };
  const store = new MemoryStorage(), journal = createExperimentalNative2AdoptJournal({ scope, documentId, storage: store, isWritableCurrent: () => oldCurrent && role });
  const calls: string[] = [];
  const transport: typeof fetch = async (url, init) => {
    calls.push(init?.method ?? 'GET');
    return Response.json(String(url).includes('/schemas/') ? { record: entries[3], dependencies: [entries[1], entries[0], entries[2]] } :
      init?.method === 'PUT' || String(url).includes('/receipts/') ? receipt : String(url).endsWith('/schema-bundle') ? {
        status: 'pinned', documentId, documentRevision: 2, snapshotHash: hash(target), nativeFormat: { format: 'barocss-note', version: 2 }, bundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle } : { document: receipt.document, snapshotText: target });
  };
  // Separately captured post-retirement reader: does not use an old proof or old writer callback.
  const freshReader = createExperimentalNative2NoteReader({ tenantId: scope.tenantId, workspaceId: scope.workspaceId, apiBase: '/controlled-native2', authorizedFetch: transport, isCurrent: () => role });
  const writer = createExperimentalNative2Adopter({ scope, apiBase: '/controlled-native2', isCurrent: () => oldCurrent, isAdoptWritableCurrent: () => role,
    hasUnresolvedPrior: async () => false, readDurableAttempt: async () => (await journal.read())?.fixed, authorizedFetch: transport });
  await journal.writeDraft(base, { generation: 2, snapshotText: sourceText });
  const choice = await writer.resolveExact(NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.selected[0]), fixed = await writer.freeze(base, sourceText, choice, [4,0], 'native2-adopt-test-1', 2);
  await journal.fix(fixed); const direct = await writer.send(fixed); await journal.observeDirect(fixed, direct); const proof = await writer.confirm(fixed, direct);
  if (proof.status !== 'adoption-fixed-confirmed') throw new Error('Whole current proof required'); await journal.confirmFixed(proof);
  return { authority, session, journal, store, calls, proof, writer, readFresh: () => freshReader.open(documentId),
    revoke: () => { role = false; }, restoreRole: () => { role = true; }, isRoleCurrent: () => role, isOldCurrent: () => oldCurrent && role, retire: () => { oldCurrent = false; },
    protect: async () => { session.flush(); const current = await journal.read(); if (!current) throw new Error('Current protected source required');
      return journal.writeDraft(base, current.latestSourceDraft); },
    qualify: async () => { const known = await journal.read(); if (!known?.directRequestHash) throw new Error('Current known direct hash required');
      const got = await writer.confirm(fixed, await writer.checkReceipt(fixed), known.directRequestHash); if (got.status !== 'adoption-fixed-confirmed') throw new Error('Unconfirmed'); return got; } };
}
describe('protected fresh native target owner and old history parking', () => {
  it('real supported fresh target is initially independent; whole old model/context/history entries retained readonly and transition never PUTs', async () => {
    const h = await setup(), sourceBefore = h.session.editor.exportDocument(), nativeBefore = h.session.exportNativeDocument(), historyBefore = h.session.editor.historyManager;
    expect(historyBefore.getHistory().length).toBeGreaterThan(0);
    const operatedEntries = historyBefore.getHistory().map(e => ({ entry: e, operations: e.operations, inverse: e.inverseOperations, refs: [...e.operations], inverseRefs: [...e.inverseOperations] }));
    const beforeRaw = [...h.store.data.entries()], puts = h.calls.filter(v => v === 'PUT').length;
    const controller = createProtectedNative2Handoff({ source: { ...h, children: () => [], isCurrent: h.isOldCurrent }, isActorWritableCurrent: h.isRoleCurrent, readFreshTarget: h.readFresh });
    try {
      const fresh = await controller.begin(); expect(fresh.session.rootId).not.toBe(h.session.rootId); expect(fresh.session.session).not.toBe(h.session.session);
      expect(fresh.session.exportNativeDocument()).toEqual(targetDocument); expect(fresh.session.exportSnapshot()).toBe(target);
      expect(fresh.session.editor.getHistoryStats()).toEqual({ totalEntries:0,currentIndex:-1,canUndo:false,canRedo:false });
      expect(h.session.editor.exportDocument()).toEqual(sourceBefore); expect(h.session.exportNativeDocument()).toEqual(nativeBefore); expect(h.session.editor.historyManager).toBe(historyBefore);
      for (const [i, before] of operatedEntries.entries()) { const entry = historyBefore.getHistory()[i]; expect(entry).toBe(before.entry); expect(entry.operations).toBe(before.operations); expect(entry.inverseOperations).toBe(before.inverse); expect(entry.operations).toEqual(before.refs); expect(entry.inverseOperations).toEqual(before.inverseRefs); }
      expect(controller.observeParked().oldHistoryRetained).toBe(true); expect(h.session.editor.isEditable).toBe(false); expect(fresh.isCurrent()).toBe(true);
      expect(h.calls.filter(v => v === 'PUT')).toHaveLength(puts); expect([...h.store.data.entries()]).toEqual(beforeRaw);
      await expect(async () => h.journal.confirmFixed(h.proof)).rejects.toThrow('stale_native2_writable_context'); expect(fresh.session.exportSnapshot()).toBe(target); expect(controller.observeParked().oldHistoryRetained).toBe(true);
    } finally { controller.dispose(); h.session.close(); h.authority.close(); }
  });
  it('later whole old-context generation/draft blocks BEFOREretirement and keeps original source/history/recovery, without a new PUT', async () => {
    const h = await setup(); await h.journal.writeDraft(base, { generation: 3, snapshotText: JSON.stringify(NATIVE_NOTE_EXPECTED_VARIANTS.nested) });
    const before = [...h.store.data.entries()], model = h.session.editor.exportDocument(), history = h.session.editor.getHistoryStats(), puts = h.calls.filter(v => v === 'PUT').length;
    const controller = createProtectedNative2Handoff({ source: { ...h, children: () => [], isCurrent: h.isOldCurrent }, isActorWritableCurrent: h.isRoleCurrent, readFreshTarget: h.readFresh });
    try { await expect(controller.begin()).rejects.toThrow('native2_source_diverged_or_unconfirmed'); expect(controller.sourceRetired).toBe(false); expect(h.session.editor.isEditable).toBe(true);
      expect(h.session.editor.exportDocument()).toEqual(model); expect(h.session.editor.getHistoryStats()).toEqual(history); expect([...h.store.data.entries()]).toEqual(before); expect(h.calls.filter(v => v === 'PUT')).toHaveLength(puts);
    } finally { controller.dispose(); h.session.close(); h.authority.close(); }
  });
  it('postretirement role failure leaves no editing owner, oldactual data/history parked, stagedtargetreadonly and no storage/network effect', async () => {
    const h = await setup(); const before = [...h.store.data.entries()], model = h.session.editor.exportDocument();
    const controller = createProtectedNative2Handoff({ source: { ...h, children: () => [], isCurrent: h.isOldCurrent }, isActorWritableCurrent: h.isRoleCurrent,
      readFreshTarget: async () => { h.revoke(); return h.readFresh(); } });
    try { await expect(controller.begin()).rejects.toThrow('stale_native2_context'); expect(controller.state).toBe('blocked-after-retirement-no-editingowner');
      expect(controller.target).toBeUndefined(); expect(h.session.editor.isEditable).toBe(false); expect(h.session.editor.exportDocument()).toEqual(model); expect(controller.observeParked().oldHistoryRetained).toBe(true); expect([...h.store.data.entries()]).toEqual(before);
    } finally { controller.dispose(); h.session.close(); h.authority.close(); }
  });
  it('explicit retry after a held separately captured reader failure cannot revive old callbacks, while parked operated history stays exact', async () => {
    const h = await setup(); let fail = true, freshReads = 0;
    const before = h.session.editor.exportDocument(), history = h.session.editor.historyManager.getHistory(), raw = [...h.store.data.entries()];
    const controller = createProtectedNative2Handoff({ source: { ...h, children: () => [], isCurrent: h.isOldCurrent }, isActorWritableCurrent: h.isRoleCurrent,
      readFreshTarget: async () => { freshReads++; expect(h.isOldCurrent()).toBe(false); if (fail) throw new Error('controlled fresh read unavailable'); return h.readFresh(); } });
    try {
      await expect(controller.begin()).rejects.toThrow('controlled fresh read unavailable'); expect(controller.sourceRetired).toBe(true); expect(h.session.editor.isEditable).toBe(false);
      expect(controller.state).toBe('blocked-after-retirement-no-editingowner'); expect(controller.target).toBeUndefined(); fail = false;
      const fresh = await controller.retry(); expect(fresh.isCurrent()).toBe(true); expect(freshReads).toBe(2);
      await expect(async () => h.journal.confirmFixed(h.proof)).rejects.toThrow('stale_native2_writable_context');
      await expect(h.writer.checkReceipt(h.proof.attempt)).rejects.toMatchObject({ code: 'stale_native2_writable_context' });
      expect(h.session.editor.exportDocument()).toEqual(before); expect(h.session.editor.historyManager.getHistory()).toEqual(history);
      expect(controller.observeParked().oldHistoryRetained).toBe(true); expect([...h.store.data.entries()]).toEqual(raw); expect(fresh.session.exportNativeDocument()).toEqual(targetDocument);
      h.revoke(); expect(fresh.isCurrent()).toBe(false); expect(controller.observeParked().oldHistoryRetained).toBe(true);
    } finally { controller.dispose(); h.session.close(); h.authority.close(); }
  });
  it('actual source input during held qualification is durably protected and blocks BEFORE retirement, retaining operated history', async () => {
    const h = await setup();
    const controller = createProtectedNative2Handoff({ source: { ...h, children: () => [], isCurrent: h.isOldCurrent,
      protect: async () => { h.session.flush(); const prior = await h.journal.read(); if (!prior) throw new Error('Existing source record required');
        const text = h.session.exportSnapshot(); return h.journal.writeDraft(base, { generation: text === prior.latestSourceDraft.snapshotText ? prior.latestSourceDraft.generation : prior.latestSourceDraft.generation + 1, snapshotText: text }); },
      qualify: async () => { const proof = await h.qualify(); const leaf = [...h.session.editor.dataStore.getNodes().values()].find(n => n.text === '목표 A • 독립 편집');
        if (!leaf?.sid || typeof leaf.text !== 'string') throw new Error('Operated source heading required');
        const range = { type: 'range' as const, startNodeId: leaf.sid, endNodeId: leaf.sid, startOffset: leaf.text.length, endOffset: leaf.text.length, collapsed: true };
        expect(await h.session.editor.executeCommand('replaceText', { range, text: ' late source' })).toBe(true); return proof; } },
      isActorWritableCurrent: h.isRoleCurrent, readFreshTarget: h.readFresh });
    try { await expect(controller.begin()).rejects.toThrow('native2_source_diverged_or_unconfirmed'); expect(controller.sourceRetired).toBe(false); expect(h.session.editor.isEditable).toBe(true);
      const recovered = await h.journal.read(); expect(recovered?.latestSourceDraft.generation).toBe(3); expect(recovered?.latestSourceDraft.snapshotText).toBe(h.session.exportSnapshot()); expect(recovered?.fixed).toEqual(h.proof.attempt);
      expect(h.session.editor.getHistoryStats().totalEntries).toBeGreaterThan(0); expect(h.calls.filter(v => v === 'PUT')).toHaveLength(1);
    } finally { controller.dispose(); h.session.close(); h.authority.close(); }
  });

});
