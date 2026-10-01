import { afterEach, beforeEach, expect, it } from 'vitest';
import { DataStoreExporter } from '@barocss/datastore';
import { createSampleDocument, createWordEditor } from '../src/index';
import { captureWordSelectionOwner, ownsWordSelection, createWordSelectionLifetime, trackWordSelectionLifetime } from '../src/selection-owner';

let lifetime: ReturnType<typeof createWordSelectionLifetime>, dispose: () => void;
let editor: ReturnType<typeof createWordEditor>;
const native = () => JSON.stringify(new DataStoreExporter(editor.dataStore).exportToTree(editor.getRootId()!));
function selectFirst() {
  const nodes: NonNullable<ReturnType<typeof editor.dataStore.getNode>>[] = [];
  const visit = (id: string) => { const node = editor.dataStore.getNode(id)!; nodes.push(node); for (const child of node.content ?? []) visit(String(child)); };
  visit(editor.getRootId()!);
  const paragraph = nodes.find(node => node.stype === 'paragraph' && node.content?.some(id => typeof editor.dataStore.getNode(String(id))?.text === 'string'))!;
  const run = editor.dataStore.getNode(String(paragraph.content![0]))!;
  editor.updateSelection({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 3, collapsed: false });
  return run;
}
beforeEach(() => { editor = createWordEditor(); editor.loadDocument(createSampleDocument()); selectFirst(); lifetime = createWordSelectionLifetime(editor); dispose = trackWordSelectionLifetime(lifetime); });
afterEach(() => { dispose(); editor.destroy(); });

it('keeps captured tools non-mutating and allows an owned formatting edit with undo and redo', async () => {
  const initial = native();
  const owner = captureWordSelectionOwner(editor, editor.selection, lifetime);
  expect(ownsWordSelection(editor, owner)).toBe(true);
  expect(native()).toBe(initial);
  expect(await editor.run('setHeading2')).toBe(true);
  const changed = native();
  expect(changed).not.toBe(initial);
  await editor.undo();
  expect(native()).toBe(initial);
  await editor.redo();
  expect(native()).toBe(changed);
});

it('refuses a deferred target after current authority is revoked and does not change native content', () => {
  const initial = native();
  const owner = captureWordSelectionOwner(editor, editor.selection, lifetime);
  editor.setEditable(false);
  expect(ownsWordSelection(editor, owner)).toBe(false);
  expect(native()).toBe(initial);
});

it('refuses a prior range after selecting another target, even when the original nodes remain', () => {
  const owner = captureWordSelectionOwner(editor, editor.selection, lifetime);
  const initial = native();
  const selection = editor.selection!;
  editor.updateSelection({ ...selection, startOffset: 1, endOffset: 2 });
  expect(ownsWordSelection(editor, owner)).toBe(false);
  expect(native()).toBe(initial);
  expect(ownsWordSelection(editor, captureWordSelectionOwner(editor, editor.selection, lifetime))).toBe(true);
});

it('retires deferred work after range A to B to A, but permits a fresh captured intent', () => {
  const owner = captureWordSelectionOwner(editor, editor.selection, lifetime);
  const initial = native();
  const selection = structuredClone(editor.selection!);
  editor.updateSelection({ ...selection, startOffset: 1, endOffset: 2 });
  editor.updateSelection(selection);
  expect(ownsWordSelection(editor, owner)).toBe(false);
  expect(ownsWordSelection(editor, captureWordSelectionOwner(editor, editor.selection, lifetime))).toBe(true);
  expect(native()).toBe(initial);
});

it('retires a target after same-session root replacement and refuses A to B to A reuse', () => {
  const owner = captureWordSelectionOwner(editor, editor.selection, lifetime);
  const initial = createSampleDocument();
  const session = String(editor.dataStore.getSessionId());
  editor.loadDocument(createSampleDocument(), session);
  selectFirst();
  expect(ownsWordSelection(editor, owner)).toBe(false);
  editor.loadDocument(initial, session);
  selectFirst();
  expect(ownsWordSelection(editor, owner)).toBe(false);
  expect(ownsWordSelection(editor, captureWordSelectionOwner(editor, editor.selection, lifetime))).toBe(true);
});
