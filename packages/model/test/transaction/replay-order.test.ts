// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { insertText } from '../../src';
import { globalOperationRegistry } from '../../src/operations/define-operation';

const editors: Editor[] = [];
afterEach(() => { vi.restoreAllMocks(); editors.splice(0).forEach(editor => editor.destroy()); });
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
async function setup(two = false) {
  const editor = new Editor({ schema: new Schema('replay-order', { topNode: 'document', nodes: {
    document: { name: 'document', content: 'paragraph+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  } }) });
  editors.push(editor);
  editor.loadDocument({ stype: 'document', content: [{ sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'A' }] }] });
  editor.setRange({ type: 'range', startNodeId: 't', endNodeId: 't', startOffset: 1, endOffset: 1, collapsed: true });
  expect((await editor.executeTransaction({ operations: [insertText('t', 1, 'x')] })).success).toBe(true);
  if (two) {
    editor.historyManager.closeGroup();
    expect((await editor.executeTransaction({ operations: [insertText('t', 2, 'y')] })).success).toBe(true);
  }
  return editor;
}
function holdNext(name: string, fail = false) {
  const started = deferred(), release = deferred();
  const operation = globalOperationRegistry.get(name)!;
  const execute = operation.execute;
  vi.spyOn(operation, 'execute').mockImplementationOnce(async (...args) => {
    const result = await execute(...args);
    started.resolve();
    await release.promise;
    return fail ? { ok: false, error: 'Injected held replay failure' } : result;
  });
  return { started, release };
}
const text = (editor: Editor) => editor.dataStore.getNode('t')!.text;

for (const direction of ['undo', 'redo'] as const) {
  it(`serializes two ${direction} requests without advancing history before commit`, async () => {
    const editor = await setup(true);
    if (direction === 'redo') { await editor.undo(); await editor.undo(); }
    const before = editor.historyManager.getStats();
    const held = holdNext(direction === 'undo' ? 'deleteTextRange' : 'insertText');
    const first = editor[direction]();
    await held.started.promise;
    const second = editor[direction]();
    try { expect(editor.historyManager.getStats()).toEqual(before); }
    finally { held.release.resolve(); await Promise.all([first, second]); }
    expect(await first).toBe(true); expect(await second).toBe(true);
    expect(text(editor)).toBe(direction === 'undo' ? 'A' : 'Axy');
    expect(editor.historyManager.getStats()).toEqual({ totalEntries: 2, currentIndex: direction === 'undo' ? -1 : 1, canUndo: direction === 'redo', canRedo: direction === 'undo' });
  });

  it(`lets a queued ${direction} retry the same entry after the first replay fails`, async () => {
    const editor = await setup(true);
    if (direction === 'redo') { await editor.undo(); await editor.undo(); }
    const held = holdNext(direction === 'undo' ? 'deleteTextRange' : 'insertText', true);
    const first = editor[direction]();
    await held.started.promise;
    const second = editor[direction]();
    held.release.resolve();
    expect(await first).toBe(false); expect(await second).toBe(true);
    expect(text(editor)).toBe('Ax');
    expect(editor.historyManager.getStats()).toEqual({ totalEntries: 2, currentIndex: 0, canUndo: true, canRedo: true });
  });
}

it('records an edit queued after undo and discards only the undone branch', async () => {
  const editor = await setup();
  const held = holdNext('deleteTextRange');
  const undo = editor.undo();
  await held.started.promise;
  const edit = editor.executeTransaction({ operations: [insertText('t', 1, 'z')] });
  held.release.resolve();
  expect(await undo).toBe(true); expect((await edit).success).toBe(true);
  expect(text(editor)).toBe('Az');
  expect(editor.canRedo()).toBe(false);
  expect(editor.historyManager.getStats().totalEntries).toBe(1);
  expect(editor.selection).toMatchObject({ startOffset: 2, endOffset: 2 });
  expect(await editor.undo()).toBe(true); expect(text(editor)).toBe('A');
  expect(await editor.redo()).toBe(true); expect(text(editor)).toBe('Az');
});

it('selects the undo entry after a previously queued edit has committed', async () => {
  const editor = await setup();
  editor.historyManager.closeGroup();
  const held = holdNext('insertText');
  const edit = editor.executeTransaction({ operations: [insertText('t', 2, 'y')] });
  await held.started.promise;
  const undo = editor.undo();
  held.release.resolve();
  expect((await edit).success).toBe(true); expect(await undo).toBe(true);
  expect(text(editor)).toBe('Ax');
  expect(editor.historyManager.getStats()).toEqual({ totalEntries: 2, currentIndex: 0, canUndo: true, canRedo: true });
  expect(await editor.redo()).toBe(true); expect(text(editor)).toBe('Axy');
});

it('records an edit requested by a committed replay notification after restoring the replay selection', async () => {
  const editor = await setup();
  let followUp: ReturnType<Editor['executeTransaction']> | undefined;
  let observed: unknown;
  editor.on('editor:content.change', () => {
    if (text(editor) !== 'A') return;
    observed = editor.historyManager.getStats();
    followUp = editor.executeTransaction({ operations: [insertText('t', 1, 'z')] });
  });
  expect(await editor.undo()).toBe(true);
  expect(observed).toEqual({ totalEntries: 1, currentIndex: -1, canUndo: false, canRedo: true });
  expect(followUp).toBeDefined();
  expect((await followUp!).success).toBe(true);
  expect(text(editor)).toBe('Az');
  expect(editor.historyManager.getStats()).toEqual({ totalEntries: 1, currentIndex: 0, canUndo: true, canRedo: false });
  expect(editor.selection).toMatchObject({ startOffset: 2, endOffset: 2 });
});

for (const direction of ['undo', 'redo'] as const) {
  it(`preserves the ${direction} entry when lock acquisition fails`, async () => {
    const editor = await setup();
    if (direction === 'redo') await editor.undo();
    const before = structuredClone(editor.exportDocument()), state = editor.historyManager.getStats();
    vi.spyOn(editor.dataStore, 'acquireLock').mockRejectedValueOnce(new Error('Injected lock timeout'));
    expect(await editor[direction]()).toBe(false);
    expect(editor.exportDocument()).toEqual(before);
    expect(editor.historyManager.getStats()).toEqual(state);
    expect(editor.transactionManager._isUndoRedoOperation).toBe(false);
    expect(await editor[direction]()).toBe(true);
  });
}


it('records an edit queued by a DataStore operation observer after replay finalization', async () => {
  const editor = await setup();
  let followUp: ReturnType<Editor['executeTransaction']> | undefined;
  editor.dataStore.onOperation(() => {
    if (text(editor) !== 'A' || followUp) return;
    followUp = editor.executeTransaction({ operations: [insertText('t', 1, 'z')] });
  });
  expect(await editor.undo()).toBe(true);
  expect(followUp).toBeDefined();
  expect((await followUp!).success).toBe(true);
  expect(text(editor)).toBe('Az');
  expect(editor.historyManager.getStats()).toEqual({ totalEntries: 1, currentIndex: 0, canUndo: true, canRedo: false });
  expect(await editor.undo()).toBe(true);
  expect(text(editor)).toBe('A');
});

it('captures the legacy replay flag before waiting for the transaction lock', async () => {
  const editor = await setup();
  const held = holdNext('deleteTextRange');
  const undo = editor.undo();
  await held.started.promise;
  const edit = editor.executeTransaction({ operations: [insertText('t', 1, 'z')] });
  editor.transactionManager._isUndoRedoOperation = true;
  held.release.resolve();
  try {
    expect(await undo).toBe(true);
    expect((await edit).success).toBe(true);
    expect(editor.historyManager.getStats()).toEqual({ totalEntries: 1, currentIndex: 0, canUndo: true, canRedo: false });
    expect(text(editor)).toBe('Az');
  } finally {
    editor.transactionManager._isUndoRedoOperation = false;
  }
});
