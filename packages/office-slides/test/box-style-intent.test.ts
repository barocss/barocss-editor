import { afterEach, expect, it } from 'vitest';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { registerPreCommitGuard, registerPreExecutionGuard } from '@barocss/model';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { captureSlidesSelectionOwner, createSlidesSelectionLifetime, ownsSlidesSelection, trackSlidesSelectionLifetime } from '../src/selection-owner';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup()));
function fixture() {
  const editor = createSlidesEditor({ editable: true, schema: createSchema('box-style-intent', getSlidesSchemaDefinition()) });
  cleanups.push(() => editor.destroy());
  editor.loadDocument({ stype: 'document', attributes: {}, metadata: { title: 'Style intent' }, content: [
    { stype: 'surface', attributes: { kind: 'slide' }, content: [
      { stype: 'rectangle', attributes: { name: 'A', x: 0, y: 0, width: 4000, height: 2000, stroke: '#123456' } },
      { stype: 'picture', attributes: { name: 'B', x: 5000, y: 0, width: 4000, height: 2000, src: 'data:image/svg+xml,test', fit: 'contain' } }
    ] },
    { stype: 'resources', attributes: {}, content: [] }
  ] });
  const a = [...editor.dataStore.getNodes().values()].find(node => node.attributes?.name === 'A')!.sid!;
  const b = [...editor.dataStore.getNodes().values()].find(node => node.attributes?.name === 'B')!.sid!;
  const slide = editor.dataStore.getNode(a)!.parentId!;
  editor.setNode({ nodeIds: [a] });
  const lifetime = createSlidesSelectionLifetime(editor, slide);
  cleanups.push(trackSlidesSelectionLifetime(lifetime));
  const capture = () => {
    const owner = captureSlidesSelectionOwner(lifetime);
    return () => ownsSlidesSelection(owner);
  };
  return { editor, a, b, capture };
}
const native = (editor: Editor) => structuredClone(editor.exportDocument());
const state = (editor: Editor) => ({ document: native(editor), selection: structuredClone(editor.selection), history: structuredClone(editor.historyManager.getHistory()) });

it.each(['selection', 'authority'] as const)('retires a queued style intent across %s ABA before native writes', async kind => {
  const { editor, a, b, capture } = fixture();
  const before = state(editor);
  const lock = await editor.dataStore.acquireLock('style-queue');
  const pending = editor.executeCommand('setBoxStyle', { nodeIds: [a], strokeWidth: 40, canApply: capture() });
  if (kind === 'selection') { editor.setNode({ nodeIds: [b] }); editor.setNode({ nodeIds: [a] }); }
  else { editor.setEditable(false); editor.setEditable(true); }
  editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false);
  expect(state(editor)).toEqual(before);
});

it.each(['selection', 'authority', 'owner'] as const)('rolls back a style intent retired by %s during an awaited host guard', async kind => {
  const { editor, a, b, capture } = fixture();
  const before = state(editor), owner = capture();
  let active = true;
  const dispose = registerPreCommitGuard(editor, async () => {
    await Promise.resolve();
    if (kind === 'selection') { editor.setNode({ nodeIds: [b] }); editor.setNode({ nodeIds: [a] }); }
    else if (kind === 'authority') { editor.setEditable(false); editor.setEditable(true); }
    else active = false;
  });
  cleanups.push(dispose);
  expect(await editor.executeCommand('setBoxStyle', { nodeIds: [a], strokeWidth: 40, canApply: () => active && owner() })).toBe(false);
  expect(state(editor)).toEqual(before);
  dispose(); active = true;
  expect(await editor.executeCommand('setBoxStyle', { nodeIds: [a], strokeWidth: 40, canApply: capture() })).toBe(true);
  expect(editor.dataStore.getNode(a)!.attributes?.strokeWidth).toBe(40);
  expect(editor.historyManager.getHistory()).toHaveLength(1);
  expect(await editor.undo()).toBe(true);
  expect(native(editor)).toEqual(before.document);
});

it('does not replace an existing pre-execution policy and checks the owner again after it awaits', async () => {
  const { editor, a } = fixture();
  const before = state(editor);
  let current = true, calls = 0;
  cleanups.push(registerPreExecutionGuard(editor, async () => { calls += 1; await Promise.resolve(); current = false; }));
  expect(await editor.executeCommand('setBoxStyle', { nodeIds: [a], strokeWidth: 40, canApply: () => current })).toBe(false);
  expect(calls).toBe(1);
  expect(state(editor)).toEqual(before);
});

it('preserves native target identity, object selection and exact Undo/Redo for guarded picture fitting', async () => {
  const { editor, a, b, capture } = fixture();
  editor.setNode({ nodeIds: [b] });
  const before = state(editor), outside = structuredClone(editor.dataStore.getNode(a));
  expect(await editor.executeCommand('setBoxStyle', { nodeIds: [b], fit: 'cover', canApply: capture() })).toBe(true);
  expect(editor.dataStore.getNode(b)!.attributes?.fit).toBe('cover');
  expect(editor.dataStore.getNode(a)).toEqual(outside);
  expect(editor.selection).toEqual(before.selection);
  expect(editor.historyManager.getHistory()).toHaveLength(1);
  const after = native(editor);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before.document);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
});

it('refuses an invalid guard and preserves the ordinary explicit-target API without a guard', async () => {
  const { editor, a, b } = fixture();
  const before = state(editor);
  expect(await editor.executeCommand('setBoxStyle', { nodeIds: [a], strokeWidth: 40, canApply: true })).toBe(false);
  expect(state(editor)).toEqual(before);
  // Existing property callers can name a native object independently of selection.
  expect(await editor.executeCommand('setBoxStyle', { nodeIds: [b], fit: 'cover' })).toBe(true);
  expect(editor.dataStore.getNode(b)!.attributes?.fit).toBe('cover');
  expect(editor.selection).toEqual(before.selection);
});
