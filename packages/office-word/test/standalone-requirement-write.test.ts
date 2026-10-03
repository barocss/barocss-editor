import { expect, it, vi } from 'vitest';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { registerPreCommitGuard } from '@barocss/model';
import { createStarterDocument } from '../src/starter-document';
import { createStandaloneRequirement, linkBusinessDecision, readBusinessPair, type BusinessPairPayload } from '../src/business-pair';
import { prepareBusinessPairWrite } from '../src/business-pair-write';
import { wordFileText } from '../src/word-file';
import { mountWordRuntime } from '../../../apps/word/src/runtime';

async function fixture() {
  const source = createStarterDocument();
  const surface = source.content!.find(node => typeof node === 'object' && node.stype === 'surface');
  if (!surface || typeof surface !== 'object') throw new Error('Missing surface');
  surface.content = [
    { stype: 'paragraph', attributes: { styleId: 'Body', objectId: 'requirement-original' }, content: [
      { stype: 'inline-text', text: 'Keep the native requirement.', marks: [{ stype: 'bold', range: [0, 4] }] }
    ] },
    { stype: 'paragraph', attributes: { styleId: 'Body', objectId: 'decision-original' }, content: [
      { stype: 'inline-text', text: 'Use the existing editor.' }
    ] }
  ];
  const render = vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const runtime = mountWordRuntime(host, { initialDocument: source, editable: true });
  const paragraphs = runtime.editor.dataStore.getAllNodes().filter(node => node.stype === 'paragraph');
  for (const [index, name] of ['standalone-requirement', 'later-decision'].entries()) {
    const id = String(paragraphs[index].content![0]);
    const selection = { type: 'range' as const, startNodeId: id, endNodeId: id, startOffset: 0, endOffset: 0, collapsed: true };
    runtime.editor.updateSelection(selection);
    expect(await runtime.editor.run('addWordBookmark', { name, selection })).toBe(true);
  }
  return { runtime, host, native: () => wordFileText(runtime.exportNativeDocument(), ''),
    dispose() { runtime.dispose(); host.remove(); render.mockRestore(); } };
}

function cleanPin(bytes: string) {
  const native = JSON.parse(bytes).document;
  delete native.metadata.wonfficeBusinessPair;
  return wordFileText(native, '');
}

function withMetadata(bytes: string, payload: unknown) {
  const native = JSON.parse(bytes).document;
  native.metadata = { ...native.metadata, wonfficeBusinessPair: payload };
  return wordFileText(native, '');
}

it('authors only one native requirement, then explicitly links a later decision with exact original pins and whole Undo/Redo', async () => {
  const f = await fixture();
  try {
    const before = f.native();
    const created = createStandaloneRequirement(f.runtime.exportNativeDocument(), 'standalone-requirement');
    // Only the fresh random identity comes from the writer. All durable fields and native pins are declared independently.
    const requirement = { id: created.items[0].id, kind: 'requirement', currentVersion: 1,
      locator: { kind: 'point-bookmark', bookmarkId: 'standalone-requirement' },
      versions: [{ version: 1, snapshotText: cleanPin(before) }] };
    const standalone = { schemaVersion: 2, lifecycle: 'unlinked', items: [requirement], relations: [] };
    expect(created).toEqual(standalone);
    const standaloneBytes = withMetadata(before, standalone);
    const author = prepareBusinessPairWrite(f.runtime, created, () => true)!;
    expect(author).not.toBeNull(); expect(f.native()).toBe(before);
    expect(await author.apply()).toBe(true); expect(f.native()).toBe(standaloneBytes);
    expect(readBusinessPair(f.runtime.exportNativeDocument())).toMatchObject({ status: 'valid', lifecycle: 'unlinked', review: 'current' });

    const linked = linkBusinessDecision(f.runtime.exportNativeDocument(), 'later-decision', 1);
    const decision = { id: linked.items.find(item => item.kind === 'decision')!.id, kind: 'decision', currentVersion: 1,
      locator: { kind: 'point-bookmark', bookmarkId: 'later-decision' },
      versions: [{ version: 1, snapshotText: cleanPin(standaloneBytes) }] };
    const expected = { schemaVersion: 2, lifecycle: 'linked', items: [requirement, decision], relations: [
      { kind: 'supported_by', source: { itemId: requirement.id, version: 1 }, target: { itemId: decision.id, version: 1 } }
    ] };
    expect(linked).toEqual(expected); expect(linked.items[0]).toEqual(requirement);
    const linkedBytes = withMetadata(standaloneBytes, expected);
    expect(await prepareBusinessPairWrite(f.runtime, linked, () => true)!.apply()).toBe(true);
    expect(f.native()).toBe(linkedBytes);
    expect(readBusinessPair(f.runtime.exportNativeDocument())).toMatchObject({ status: 'valid', lifecycle: 'linked', review: 'current' });
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(await f.runtime.editor.undo()).toBe(true); expect(f.native()).toBe(standaloneBytes);
      expect(await f.runtime.editor.undo()).toBe(true); expect(f.native()).toBe(before);
      expect(await f.runtime.editor.redo()).toBe(true); expect(f.native()).toBe(standaloneBytes);
      expect(await f.runtime.editor.redo()).toBe(true); expect(f.native()).toBe(linkedBytes);
    }
  } finally { f.dispose(); }
});

it('accepts the independently declared v2 native standalone lifecycle at the existing prepared write boundary', async () => {
  const f = await fixture();
  try {
    const before = f.native();
    const payload = { schemaVersion: 2, lifecycle: 'unlinked', items: [{
      id: '3f3ac87b-5b86-4eb5-91c3-48555c2d153f', kind: 'requirement', currentVersion: 1,
      locator: { kind: 'point-bookmark', bookmarkId: 'standalone-requirement' },
      versions: [{ version: 1, snapshotText: cleanPin(before) }]
    }], relations: [] } as unknown as BusinessPairPayload;
    const action = prepareBusinessPairWrite(f.runtime, payload, () => true);
    expect(action).not.toBeNull(); expect(f.native()).toBe(before);
    expect(await action!.apply()).toBe(true); expect(f.native()).toBe(withMetadata(before, payload));
  } finally { f.dispose(); }
});

it.each(['standalone', 'link'] as const)('refuses deferred %s writes after role ABA without metadata or history effects', async operation => {
  const f = await fixture();
  let cleanup = () => {};
  try {
    if (operation === 'link') {
      const initial = createStandaloneRequirement(f.runtime.exportNativeDocument(), 'standalone-requirement');
      expect(await prepareBusinessPairWrite(f.runtime, initial, () => true)!.apply()).toBe(true);
    }
    const payload = operation === 'standalone'
      ? createStandaloneRequirement(f.runtime.exportNativeDocument(), 'standalone-requirement')
      : linkBusinessDecision(f.runtime.exportNativeDocument(), 'later-decision', 1);
    const before = f.native(), history = f.runtime.editor.historyManager.getHistory().length;
    let entered!: () => void, release!: () => void;
    const paused = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    cleanup = registerPreCommitGuard(f.runtime.editor, async () => { entered(); await resume; });
    const pending = prepareBusinessPairWrite(f.runtime, payload, () => true)!.apply();
    await paused;
    f.runtime.editor.setEditable(false); f.runtime.editor.setEditable(true);
    release(); expect(await pending).toBe(false);
    expect(f.native()).toBe(before); expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(history);
  } finally { cleanup(); f.dispose(); }
});

it.each(['standalone', 'link'] as const)('retires prepared %s writes after selection ABA, source edit, composition, root replacement, or authority loss', async operation => {
  for (const cause of ['selection-aba', 'source', 'composition', 'root', 'authority'] as const) {
    const f = await fixture(); let authority = true;
    try {
      if (operation === 'link') {
        expect(await prepareBusinessPairWrite(f.runtime,
          createStandaloneRequirement(f.runtime.exportNativeDocument(), 'standalone-requirement'), () => true)!.apply()).toBe(true);
      }
      const payload = operation === 'standalone'
        ? createStandaloneRequirement(f.runtime.exportNativeDocument(), 'standalone-requirement')
        : linkBusinessDecision(f.runtime.exportNativeDocument(), 'later-decision', 1);
      const action = prepareBusinessPairWrite(f.runtime, payload, () => authority)!;
      expect(action).not.toBeNull();
      if (cause === 'selection-aba') {
        const selection = structuredClone(f.runtime.editor.selection);
        f.runtime.editor.updateSelection(null); f.runtime.editor.updateSelection(selection);
      }
      if (cause === 'source') {
        const run = f.runtime.editor.dataStore.getAllNodes().find(node => node.text === 'Use the existing editor.')!;
        const range = { type: 'range' as const, startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true };
        expect(await f.runtime.editor.run('replaceText', { range, text: 'Changed: ' })).toBe(true);
      }
      if (cause === 'composition') f.host.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      if (cause === 'root') f.runtime.editor.loadDocument(f.runtime.exportNativeDocument(), 'replacement-root');
      if (cause === 'authority') authority = false;
      const before = f.native(), history = f.runtime.editor.historyManager.getHistory().length;
      expect(await action.apply(), cause).toBe(false);
      expect(f.native(), cause).toBe(before); expect(f.runtime.editor.historyManager.getHistory(), cause).toHaveLength(history);
      action.dispose();
    } finally { f.dispose(); }
  }
});
