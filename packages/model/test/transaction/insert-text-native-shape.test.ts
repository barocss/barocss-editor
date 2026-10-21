// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import type { IMark, INode } from '@barocss/datastore';
import { control, insertText, transaction } from '../../src';

type Case = { name: string; marks?: IMark[]; position: number; expectedMarks?: IMark[] };
const cases: Case[] = [
  { name: 'omitted marks', position: 2 },
  { name: 'authored empty marks', marks: [], position: 2, expectedMarks: [] },
  { name: 'global end-boundary mark', marks: [{ stype: 'bold' }], position: 5, expectedMarks: [{ stype: 'bold' }] },
  { name: 'existing global interior extension', marks: [{ stype: 'italic' }], position: 2, expectedMarks: [{ stype: 'italic', range: [0, 7] }] },
  { name: 'ranged mark extension and shift', position: 2,
    marks: [{ stype: 'bold', range: [0, 4] }, { stype: 'italic', range: [3, 5] }],
    expectedMarks: [{ stype: 'bold', range: [0, 6] }, { stype: 'italic', range: [5, 7] }] },
  { name: 'existing adjacent equal-mark coalescing', position: 5,
    marks: [{ stype: 'bold', range: [0, 2] }, { stype: 'bold', range: [2, 5] }],
    expectedMarks: [{ stype: 'bold', range: [0, 5] }] }
];
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));

function fixture(testCase: Case) {
  const editor = new Editor({ schema: new Schema('insert-native-shape', { topNode: 'document', nodes: {
    document: { name: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline', marks: ['bold', 'italic'] },
    resources: { name: 'resources', group: 'block', content: 'richText*' },
    richText: { name: 'richText', content: 'paragraph+' }
  }, marks: { bold: { name: 'bold' }, italic: { name: 'italic' } } }) });
  editors.push(editor);
  const target: INode = { sid: 'target', stype: 'inline-text', text: 'Alpha', attributes: { language: 'en' }, metadata: { source: 'authored run' } };
  if (testCase.marks !== undefined) target.marks = structuredClone(testCase.marks);
  editor.loadDocument(JSON.parse(JSON.stringify({
    sid: 'document', stype: 'document', attributes: { id: 'native-shape' }, metadata: { title: 'Full native original', author: 'fixture' },
    content: [
      { sid: 'paragraph', stype: 'paragraph', attributes: { id: 'input' }, content: [target] },
      { sid: 'untouched', stype: 'paragraph', content: [{ sid: 'styled', stype: 'inline-text', text: 'Keep this original', marks: [{ stype: 'italic', range: [0, 4] }], metadata: { source: 'untouched' } }] },
      { sid: 'resources', stype: 'resources', attributes: { scope: 'document' }, content: [
        { sid: 'resource', stype: 'richText', attributes: { id: 'retained-body' }, metadata: { purpose: 'durable resource' }, content: [
          { sid: 'resource-paragraph', stype: 'paragraph', content: [{ sid: 'resource-run', stype: 'inline-text', text: 'Nested resource', marks: [] }] }
        ] }
      ] }
    ]
  })));
  editor.setRange({ type: 'range', startNodeId: 'target', endNodeId: 'target', startOffset: testCase.position, endOffset: testCase.position, collapsed: true });
  return editor;
}

const native = (editor: Editor): INode => structuredClone(editor.exportDocument());
const file = (editor: Editor): INode => JSON.parse(JSON.stringify(editor.exportDocument()));
function run(tree: INode): INode {
  const found = findRun(tree);
  if (!found) throw new Error('The complete native fixture must contain the target run');
  return found;
}
function findRun(tree: INode): INode | undefined {
  if (tree.sid === 'target') return tree;
  for (const child of tree.content ?? []) {
    if (typeof child !== 'string') { const found = findRun(child); if (found) return found; }
  }
  return undefined;
}

for (const testCase of cases) it(`keeps the complete native shape, caret and history through three Undo/Redo cycles with ${testCase.name}`, async () => {
  const editor = fixture(testCase);
  const before = native(editor), beforeFile = file(editor), beforeSelection = structuredClone(editor.selection);
  expect(run(before).marks).toStrictEqual(testCase.marks);
  expect(Object.hasOwn(run(beforeFile), 'marks')).toBe(testCase.marks !== undefined);
  expect(editor.getHistoryStats()).toEqual({ totalEntries: 0, currentIndex: -1, canUndo: false, canRedo: false });
  const expected = structuredClone(before);
  run(expected).text = 'Alpha'.slice(0, testCase.position) + '++' + 'Alpha'.slice(testCase.position);
  if (testCase.expectedMarks !== undefined) run(expected).marks = structuredClone(testCase.expectedMarks);
  const expectedFile = JSON.parse(JSON.stringify(expected)) as INode;
  const expectedSelection = { ...beforeSelection, startOffset: testCase.position + 2, endOffset: testCase.position + 2 };

  expect((await transaction(editor, control('target', [insertText(testCase.position, '++')])).commit()).success).toBe(true);
  expect(native(editor)).toStrictEqual(expected);
  expect(file(editor)).toStrictEqual(expectedFile);
  expect(editor.selection).toEqual(expectedSelection);
  expect(editor.getHistoryStats()).toEqual({ totalEntries: 1, currentIndex: 0, canUndo: true, canRedo: false });
  const committedHistory = structuredClone(editor.historyManager.getHistory());

  for (let repeat = 0; repeat < 3; repeat += 1) {
    expect(await editor.undo()).toBe(true);
    expect(native(editor)).toStrictEqual(before);
    expect(file(editor)).toStrictEqual(beforeFile);
    expect(editor.selection).toEqual(beforeSelection);
    expect(editor.getHistoryStats()).toEqual({ totalEntries: 1, currentIndex: -1, canUndo: false, canRedo: true });
    expect(editor.historyManager.getHistory()).toEqual(committedHistory);
    expect(await editor.redo()).toBe(true);
    expect(native(editor)).toStrictEqual(expected);
    expect(file(editor)).toStrictEqual(expectedFile);
    expect(editor.selection).toEqual(expectedSelection);
    expect(editor.getHistoryStats()).toEqual({ totalEntries: 1, currentIndex: 0, canUndo: true, canRedo: false });
    expect(editor.historyManager.getHistory()).toEqual(committedHistory);
  }
});
