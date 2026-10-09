import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree } from '@barocss/office-note';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';
import { createExperimentalNative2NoteReader } from './experimental-native2-reader';
import { createExperimentalNative2ReadStage } from './experimental-native2-authenticated-stage';

const raw = (value: unknown) => JSON.stringify(value);

/** Controlled native primitive baseline. The authenticated Office reader is a separate dependency. */
describe('separate readonly native2 stage before an authenticated consumer', () => {
  it('keeps an operated root and the last nested input in the mounted source while A2 and B are staged and closed', async () => {
    const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original authority' }] }] });
    const source = openNoteNativeSnapshot(createNoteNative2Context(raw(NATIVE_NOTE_FIXTURES.SOURCE_A)), { authority: authority.editor, after: 60000 });
    const staged: Array<ReturnType<typeof openNoteNativeSnapshot>> = [];
    let child: ReturnType<typeof source.openChildResource> | undefined;
    try {
      const heading = [...source.editor.dataStore.getNodes().values()].find(node => node.text === '목표 A');
      if (!heading?.sid) throw new Error('Original source heading SID required');
      const rootRange = { type: 'range' as const, startNodeId: heading.sid, endNodeId: heading.sid,
        startOffset: 4, endOffset: 4, collapsed: true };
      expect(await source.editor.executeCommand('replaceText', { range: rootRange, text: ' • 마지막 원본 입력' })).toBe(true);

      const resource = [...source.editor.dataStore.getNodes().values()].find(node => node.stype === 'richText');
      if (!resource?.sid) throw new Error('Original nested resource SID required');
      child = source.openChildResource(resource.sid);
      const nested = [...child.editor.dataStore.getNodes().values()].find(node => node.text === '항목 본문 A');
      if (!nested?.sid) throw new Error('Original nested text SID required');
      const nestedRange = { type: 'range' as const, startNodeId: nested.sid, endNodeId: nested.sid,
        startOffset: 7, endOffset: 7, collapsed: true };
      expect(await child.editor.executeCommand('replaceText', { range: nestedRange, text: ' / 마지막 중첩 입력' })).toBe(true);
      expect(await source.commitChildResource(resource.sid, child)).toBe(true);

      const sourceModel = source.editor.exportDocument();
      const sourceNative = source.exportNativeDocument();
      const sourceRaw = source.exportSnapshot();
      const sourceSelection = source.editor.selection;
      const sourceHistory = source.editor.historyManager;
      const entries = sourceHistory.getHistory().map(entry => ({ entry, operations: entry.operations,
        inverse: entry.inverseOperations, forwardRefs: [...entry.operations], inverseRefs: [...entry.inverseOperations] }));
      const historyIndex = sourceHistory.getCurrentIndex();
      const sourceRoot = source.rootId, sourceSession = source.session;
      const sourceEpoch = source.editor.dataStore.getDocumentEpoch();
      expect(entries.length).toBeGreaterThan(0);
      expect(sourceRaw).toContain('마지막 원본 입력');
      expect(sourceRaw).toContain('마지막 중첩 입력');

      for (const original of [NATIVE_NOTE_FIXTURES.TARGET_A2, NATIVE_NOTE_FIXTURES.SOURCE_B]) {
        const text = raw(original);
        const one = openNoteNativeSnapshot(createNoteNative2Context(text));
        staged.push(one);
        expect(one.editor.isEditable).toBe(false);
        expect(one.exportSnapshot()).toBe(text);
        expect(one.exportNativeDocument()).toEqual(original.document);
        expect(one.context.schemaBundle).toEqual(original.schemaBundle);
        expect(one.editor.getHistoryStats()).toEqual({ totalEntries: 0, currentIndex: -1, canUndo: false, canRedo: false });
        expect(one.rootId).not.toBe(sourceRoot);
        expect(one.session).not.toBe(sourceSession);
      }

      for (const one of staged.splice(0).reverse()) one.close();
      expect(source.editor.isEditable).toBe(true);
      expect(source.rootId).toBe(sourceRoot);
      expect(source.session).toBe(sourceSession);
      expect(source.editor.dataStore.getDocumentEpoch()).toBe(sourceEpoch);
      expect(source.editor.exportDocument()).toEqual(sourceModel);
      expect(source.exportNativeDocument()).toEqual(sourceNative);
      expect(source.exportSnapshot()).toBe(sourceRaw);
      expect(source.editor.selection).toEqual(sourceSelection);
      expect(source.editor.historyManager).toBe(sourceHistory);
      expect(sourceHistory.getCurrentIndex()).toBe(historyIndex);
      for (const [index, before] of entries.entries()) {
        const after = sourceHistory.getHistory()[index];
        expect(after).toBe(before.entry);
        expect(after.operations).toBe(before.operations);
        expect(after.inverseOperations).toBe(before.inverse);
        expect(after.operations).toEqual(before.forwardRefs);
        expect(after.inverseOperations).toEqual(before.inverseRefs);
      }
    } finally {
      for (const one of staged.splice(0).reverse()) one.close();
      child?.close();
      source.close();
      authority.close();
    }
  });
});

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333';
const scope = { issuer: 'controlled-issuer', subject: 'controlled-subject', currentUserId: null, tenantId, workspaceId, documentId };
type Original = typeof NATIVE_NOTE_FIXTURES.SOURCE_A | typeof NATIVE_NOTE_FIXTURES.TARGET_A2 | typeof NATIVE_NOTE_FIXTURES.SOURCE_B;

async function controlledLease(original: Original) {
  const snapshotText = raw(original);
  const snapshotHash = createHash('sha256').update(snapshotText).digest('hex');
  const document = { documentId, tenantId, workspaceId, product: 'note', title: 'Controlled exact native2',
    creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: original.document.attributes.pageId,
    documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2, revision: 2, snapshotHash };
  const responses = [Response.json({ document, snapshotText }), Response.json({ status: 'pinned', documentId,
    documentRevision: 2, snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle: original.schemaBundle })];
  const calls: string[] = [];
  const reader = createExperimentalNative2NoteReader({ tenantId, workspaceId, apiBase: '/controlled-native2',
    isCurrent: () => true, authorizedFetch: async (_input, init) => {
      calls.push(init?.method ?? 'GET');
      const response = responses.shift();
      if (!response) throw new Error('Unexpected controlled request');
      return response;
    } });
  const read = await reader.open(documentId);
  let retired = false;
  const listeners = new Set<() => void>();
  return { lease: { read, provenance: { ...scope, role: 'editor' as const },
    isCurrent: () => !retired,
    retire: () => {
      if (retired) return;
      retired = true;
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
    subscribeRetirement: (listener: () => void) => {
      if (retired) listener();
      else listeners.add(listener);
      return () => { listeners.delete(listener); };
    } }, calls, listeners };
}

function mountedSource() {
  const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Trusted source authority' }] }] });
  const session = openNoteNativeSnapshot(createNoteNative2Context(raw(NATIVE_NOTE_FIXTURES.SOURCE_A)), { authority: authority.editor });
  const resource = [...session.editor.dataStore.getNodes().values()].find(node => node.stype === 'richText');
  if (!resource?.sid) throw new Error('Original nested resource required');
  const listeners = new Set<() => void>();
  let hostCurrent = true;
  return { authority, session, resourceId: resource.sid, listeners, source: {
    authority, session, resourceIds: [resource.sid], scope, sourceSnapshot: () => session.exportSnapshot(), isCurrent: () => hostCurrent,
    subscribeAuthority: (retire: () => void) => { listeners.add(retire); return () => { listeners.delete(retire); }; }
  }, retireHost: () => { hostCurrent = false; for (const listener of [...listeners]) listener(); } };
}

describe('explicit controlled stage lifetime, pending authenticated Office wiring', () => {
  it('closes only the staged model immediately on read retirement and unsubscribes permanently', async () => {
    const mounted = mountedSource();
    const prepared = await controlledLease(NATIVE_NOTE_FIXTURES.SOURCE_B);
    const onRetire = vi.fn();
    const heading = [...mounted.session.editor.dataStore.getNodes().values()].find(node => node.text === '목표 A');
    if (!heading?.sid) throw new Error('Original source heading required');
    expect(await mounted.session.editor.executeCommand('replaceText', { range: { type: 'range',
      startNodeId: heading.sid, endNodeId: heading.sid, startOffset: 4, endOffset: 4, collapsed: true },
    text: ' / retained root input' })).toBe(true);
    const child = mounted.session.openChildResource(mounted.resourceId);
    try {
      const leaf = [...child.editor.dataStore.getNodes().values()].find(node => node.text === '항목 본문 A');
      if (!leaf?.sid) throw new Error('Original nested SID required');
      expect(await child.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: leaf.sid,
        endNodeId: leaf.sid, startOffset: 7, endOffset: 7, collapsed: true }, text: ' / retained nested input' })).toBe(true);
      expect(await mounted.session.commitChildResource(mounted.resourceId, child)).toBe(true);
    } finally { child.close(); }
    const before = { raw: mounted.session.exportSnapshot(), model: mounted.session.editor.exportDocument(),
      history: mounted.session.editor.historyManager, entries: mounted.session.editor.historyManager.getHistory(),
      index: mounted.session.editor.historyManager.getCurrentIndex(), selection: mounted.session.editor.selection };
    const references = before.entries.map(entry => ({ entry, forward: entry.operations, inverse: entry.inverseOperations }));
    expect(before.entries.length).toBeGreaterThan(0);
    expect(before.raw).toContain('retained root input');
    expect(before.raw).toContain('retained nested input');
    const stage = createExperimentalNative2ReadStage({ source: mounted.source, readFresh: async () => prepared.lease, onRetire });
    try {
      const value = await stage.stage();
      const close = vi.spyOn(value.session, 'close');
      expect(prepared.listeners.size).toBe(1);
      prepared.lease.retire();
      // No isCurrent call drives cleanup: the terminal event closes the model.
      expect(close).toHaveBeenCalledTimes(1);
      expect(() => value.session.exportNativeDocument()).toThrow('native_context_changed');
      expect(onRetire).toHaveBeenCalledTimes(1);
      expect(prepared.listeners.size).toBe(0);
      expect(mounted.listeners.size).toBe(0);
      prepared.lease.retire(); stage.dispose(); value.dispose();
      expect(close).toHaveBeenCalledTimes(1);
      expect(onRetire).toHaveBeenCalledTimes(1);
      await expect(stage.stage()).rejects.toThrow('native2_stage_source_changed');
      expect(mounted.session.exportSnapshot()).toBe(before.raw);
      expect(mounted.session.editor.exportDocument()).toEqual(before.model);
      expect(mounted.session.editor.historyManager).toBe(before.history);
      expect(before.history.getHistory()).toEqual(before.entries);
      for (const [index, reference] of references.entries()) {
        const entry = before.history.getHistory()[index];
        expect(entry).toBe(reference.entry);
        expect(entry.operations).toBe(reference.forward);
        expect(entry.inverseOperations).toBe(reference.inverse);
      }
      expect(before.history.getCurrentIndex()).toBe(before.index);
      expect(mounted.session.editor.selection).toEqual(before.selection);
      expect(mounted.session.editor.isEditable).toBe(true);
    } finally { stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });

  it('refuses a lease that retires synchronously during subscription', async () => {
    const mounted = mountedSource();
    const prepared = await controlledLease(NATIVE_NOTE_FIXTURES.TARGET_A2);
    prepared.lease.retire();
    const onRetire = vi.fn();
    const stage = createExperimentalNative2ReadStage({ source: mounted.source, readFresh: async () => prepared.lease, onRetire });
    try {
      await expect(stage.stage()).rejects.toThrow('native2_stage_read_retired');
      expect(onRetire).toHaveBeenCalledTimes(1);
      expect(prepared.listeners.size).toBe(0);
      expect(mounted.listeners.size).toBe(0);
      expect(mounted.session.exportSnapshot()).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_A));
    } finally { stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });

  it('does not retire a newer visible stage when an older retired read arrives late', async () => {
    const mounted = mountedSource();
    const first = await controlledLease(NATIVE_NOTE_FIXTURES.TARGET_A2);
    const second = await controlledLease(NATIVE_NOTE_FIXTURES.SOURCE_B);
    let release!: (value: typeof first.lease) => void;
    const firstRead = new Promise<typeof first.lease>(resolve => { release = resolve; });
    const onRetire = vi.fn();
    let reads = 0;
    const stage = createExperimentalNative2ReadStage({ source: mounted.source,
      readFresh: () => reads++ === 0 ? firstRead : Promise.resolve(second.lease), onRetire });
    try {
      const older = stage.stage();
      const refusal = expect(older).rejects.toThrow('native2_stage_source_changed');
      const newer = await stage.stage();
      first.lease.retire(); release(first.lease);
      await refusal;
      expect(newer.isCurrent()).toBe(true);
      expect(newer.session.exportSnapshot()).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
      expect(onRetire).not.toHaveBeenCalled();
      expect(first.listeners.size).toBe(0);
      expect(second.listeners.size).toBe(1);
    } finally { stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });

  it('refuses retirement while the read hash is awaiting completion', async () => {
    const mounted = mountedSource();
    const prepared = await controlledLease(NATIVE_NOTE_FIXTURES.TARGET_A2);
    const digest = createHash('sha256').update(prepared.lease.read.snapshotText).digest();
    let release!: (bytes: ArrayBuffer) => void;
    const hash = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const onRetire = vi.fn();
    const stage = createExperimentalNative2ReadStage({ source: mounted.source, readFresh: async () => prepared.lease, onRetire });
    try {
      const pending = stage.stage();
      const refusal = expect(pending).rejects.toThrow('native2_stage_source_changed');
      await vi.waitFor(() => expect(hash).toHaveBeenCalledTimes(1));
      prepared.lease.retire();
      expect(onRetire).toHaveBeenCalledTimes(1);
      release(Uint8Array.from(digest).buffer);
      await refusal;
      expect(prepared.listeners.size).toBe(0);
      expect(mounted.session.exportSnapshot()).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_A));
    } finally { hash.mockRestore(); stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });

  it('keeps the replacement stage when an older hash-pending lease later retires', async () => {
    const mounted = mountedSource();
    const first = await controlledLease(NATIVE_NOTE_FIXTURES.TARGET_A2);
    const second = await controlledLease(NATIVE_NOTE_FIXTURES.SOURCE_B);
    const digest = createHash('sha256').update(first.lease.read.snapshotText).digest();
    let release!: (bytes: ArrayBuffer) => void;
    const hash = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const onRetire = vi.fn();
    let reads = 0;
    const stage = createExperimentalNative2ReadStage({ source: mounted.source,
      readFresh: async () => reads++ === 0 ? first.lease : second.lease, onRetire });
    try {
      const older = stage.stage();
      const refusal = expect(older).rejects.toThrow('native2_stage_source_changed');
      await vi.waitFor(() => expect(hash).toHaveBeenCalledTimes(1));
      const newer = await stage.stage();
      first.lease.retire();
      expect(onRetire).not.toHaveBeenCalled();
      expect(newer.isCurrent()).toBe(true);
      release(Uint8Array.from(digest).buffer);
      await refusal;
      expect(newer.isCurrent()).toBe(true);
      expect(newer.session.exportSnapshot()).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
      expect(first.listeners.size).toBe(0);
      expect(second.listeners.size).toBe(1);
    } finally { hash.mockRestore(); stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });

  it('stages complete A1, A2 and supported B reads without retiring or editing the original', async () => {
    const mounted = mountedSource();
    const before = { model: mounted.session.editor.exportDocument(), raw: mounted.session.exportSnapshot(),
      native: mounted.session.exportNativeDocument(), history: mounted.session.editor.historyManager,
      selection: mounted.session.editor.selection };
    const originals = [NATIVE_NOTE_FIXTURES.SOURCE_A, NATIVE_NOTE_FIXTURES.TARGET_A2, NATIVE_NOTE_FIXTURES.SOURCE_B];
    const prepared = await Promise.all(originals.map(controlledLease));
    let index = 0;
    const stage = createExperimentalNative2ReadStage({ source: mounted.source, readFresh: async () => prepared[index++].lease });
    try {
      for (const [at, original] of originals.entries()) {
        const one = await stage.stage();
        expect(one.isCurrent()).toBe(true);
        expect(one.session.editor.isEditable).toBe(false);
        expect(one.session.exportSnapshot()).toBe(raw(original));
        expect(one.session.exportNativeDocument()).toEqual(original.document);
        expect(one.session.context.schemaBundle).toEqual(original.schemaBundle);
        expect(prepared[at].calls).toEqual(['GET', 'GET']);
      }
      expect(prepared[0].lease.isCurrent()).toBe(false);
      expect(prepared[1].lease.isCurrent()).toBe(false);
      expect(mounted.session.editor.isEditable).toBe(true);
      expect(mounted.session.editor.exportDocument()).toEqual(before.model);
      expect(mounted.session.exportSnapshot()).toBe(before.raw);
      expect(mounted.session.exportNativeDocument()).toEqual(before.native);
      expect(mounted.session.editor.historyManager).toBe(before.history);
      expect(mounted.session.editor.selection).toEqual(before.selection);
    } finally { stage.dispose(); mounted.session.close(); mounted.authority.close(); }
    expect(prepared[2].lease.isCurrent()).toBe(false);
  });

  it('refuses a late read after the source resource changes and retires only that read', async () => {
    const mounted = mountedSource();
    const prepared = await controlledLease(NATIVE_NOTE_FIXTURES.TARGET_A2);
    let release: ((value: typeof prepared.lease) => void) | undefined;
    const pending = new Promise<typeof prepared.lease>(resolve => { release = resolve; });
    const stage = createExperimentalNative2ReadStage({ source: mounted.source, readFresh: () => pending });
    try {
      const opening = stage.stage();
      const resource = mounted.session.editor.dataStore.getNode(mounted.resourceId);
      if (!resource) throw new Error('Original resource required');
      const child = mounted.session.openChildResource(mounted.resourceId);
      try {
        const leaf = [...child.editor.dataStore.getNodes().values()].find(node => node.text === '항목 본문 A');
        if (!leaf?.sid) throw new Error('Original nested SID required');
        const range = { type: 'range' as const, startNodeId: leaf.sid, endNodeId: leaf.sid,
          startOffset: 7, endOffset: 7, collapsed: true };
        expect(await child.editor.executeCommand('replaceText', { range, text: ' / newer draft' })).toBe(true);
        expect(await mounted.session.commitChildResource(mounted.resourceId, child)).toBe(true);
      } finally { child.close(); }
      const changed = mounted.session.exportSnapshot();
      release?.(prepared.lease);
      await expect(opening).rejects.toThrow('native2_stage_source_changed');
      expect(prepared.lease.isCurrent()).toBe(false);
      expect(mounted.session.exportSnapshot()).toBe(changed);
      expect(mounted.session.editor.isEditable).toBe(true);
    } finally { stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });

  it('observed authority retirement closes the stage permanently, including after role restoration', async () => {
    const mounted = mountedSource();
    const prepared = await controlledLease(NATIVE_NOTE_FIXTURES.TARGET_A2);
    const stage = createExperimentalNative2ReadStage({ source: mounted.source, readFresh: async () => prepared.lease });
    try {
      const one = await stage.stage();
      expect(one.isCurrent()).toBe(true);
      mounted.retireHost();
      expect(one.isCurrent()).toBe(false);
      expect(prepared.lease.isCurrent()).toBe(false);
      await expect(stage.stage()).rejects.toThrow('native2_stage_source_changed');
      expect(mounted.session.editor.exportDocument()).toBeDefined();
    } finally { stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });

  it('refuses an undelivered source snapshot before it requests authenticated data', async () => {
    const mounted = mountedSource();
    let reads = 0;
    const stage = createExperimentalNative2ReadStage({ source: { ...mounted.source,
      sourceSnapshot: () => { throw new Error('undelivered_input'); } },
    readFresh: async () => { reads++; throw new Error('must_not_read'); } });
    try {
      await expect(stage.stage()).rejects.toThrow('native2_stage_source_changed');
      expect(reads).toBe(0);
      expect(mounted.session.editor.isEditable).toBe(true);
      expect(mounted.session.exportSnapshot()).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_A));
    } finally { stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });

  it('rejects a foreign account provenance and retires only its read lease', async () => {
    const mounted = mountedSource();
    const prepared = await controlledLease(NATIVE_NOTE_FIXTURES.TARGET_A2);
    const foreign = { ...prepared.lease, provenance: { ...prepared.lease.provenance, subject: 'foreign-subject' } };
    const sourceBefore = mounted.session.exportSnapshot();
    const stage = createExperimentalNative2ReadStage({ source: mounted.source, readFresh: async () => foreign });
    try {
      await expect(stage.stage()).rejects.toThrow('native2_stage_read_invalid');
      expect(prepared.lease.isCurrent()).toBe(false);
      expect(mounted.session.exportSnapshot()).toBe(sourceBefore);
      expect(mounted.session.editor.isEditable).toBe(true);
    } finally { stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });

  it('closes its readonly model after a later source generation changes', async () => {
    const mounted = mountedSource();
    const prepared = await controlledLease(NATIVE_NOTE_FIXTURES.TARGET_A2);
    const stage = createExperimentalNative2ReadStage({ source: mounted.source, readFresh: async () => prepared.lease });
    try {
      const one = await stage.stage();
      const heading = [...mounted.session.editor.dataStore.getNodes().values()].find(node => node.text === '목표 A');
      if (!heading?.sid) throw new Error('Original source heading required');
      const range = { type: 'range' as const, startNodeId: heading.sid, endNodeId: heading.sid,
        startOffset: 4, endOffset: 4, collapsed: true };
      expect(await mounted.session.editor.executeCommand('replaceText', { range, text: ' later' })).toBe(true);
      const sourceAfter = mounted.session.exportSnapshot();
      expect(one.isCurrent()).toBe(false);
      expect(prepared.lease.isCurrent()).toBe(false);
      expect(mounted.session.editor.isEditable).toBe(true);
      expect(mounted.session.exportSnapshot()).toBe(sourceAfter);
    } finally { stage.dispose(); mounted.session.close(); mounted.authority.close(); }
  });
});
