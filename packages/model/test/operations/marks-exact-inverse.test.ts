// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { applyMark, control, removeMark, setMarks, transaction, type TransactionOperation } from '../../src';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
function fixture() {
  const editor = new Editor({ schema: new Schema('exact-native-marks', { topNode: 'document', nodes: {
    document: { name: 'document', content: 'paragraph+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: ['bold', 'italic'] }
  }, marks: { bold: { name: 'bold' }, italic: { name: 'italic' } } }) });
  editors.push(editor);
  editor.loadDocument({ stype: 'document', content: [{ sid: 'p', stype: 'paragraph', content: [
    { sid: 'a', stype: 'inline-text', text: 'Alpha', marks: [{ stype: 'italic' }] },
    { sid: 'b', stype: 'inline-text', text: 'Beta', marks: [{ stype: 'bold', range: [2, 4] }, { stype: 'italic' }] }
  ] }] });
  editor.setNode({ nodeIds: ['p'] });
  return editor;
}
const native = (editor: Editor) => structuredClone(editor.exportDocument());
async function exactReplay(editor: Editor, operations: TransactionOperation[]) {
  const before = native(editor), selection = structuredClone(editor.selection);
  expect((await transaction(editor, operations).commit()).success).toBe(true);
  const after = native(editor);
  expect(after).not.toEqual(before);
  for (let repeat = 0; repeat < 3; repeat += 1) {
    expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before);
    expect(editor.selection).toEqual(selection);
    expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
    expect(editor.selection).toEqual(selection);
  }
}

it('restores whole-run omitted ranges and original mark order through repeated apply Undo/Redo', async () => {
  const editor = fixture();
  await exactReplay(editor, [applyMark('a', 0, 5, 'bold'), applyMark('b', 0, 4, 'italic')]);
});

it('restores both original endpoint snapshots of an explicit cross-node apply operation', async () => {
  const editor = fixture();
  await exactReplay(editor, [applyMark('a', 1, 'b', 3, 'bold')]);
});

it('restores a removed global mark without adding a range during inverse replay', async () => {
  const editor = fixture();
  await exactReplay(editor, [removeMark('a', 'italic', [0, 5]), removeMark('b', 'italic', [1, 3])]);
});

it('keeps authored setMarks normalization while restoring the original native snapshot exactly', async () => {
  const editor = fixture(); const before = native(editor);
  const author = control('a', [setMarks([
    { stype: 'bold', range: [-2, 2] }, { stype: 'bold', range: [2, 9] },
    { stype: 'italic', range: [1, 1] }
  ])]);
  expect((await transaction(editor, author).commit()).success).toBe(true);
  expect(editor.dataStore.getNode('a')?.marks).toEqual([{ stype: 'bold', range: [0, 5] }]);
  const after = native(editor);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
});
