import { afterEach, expect, it } from 'vitest';
import { openNoteTree, type NoteSession } from '../src/session';
import { planNoteInputRule } from '../src/input-rules';
import { validateTree } from '@barocss/schema';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.close()));
function setup(value: string, stype = 'paragraph', marks: any[] = []) {
  const session = openNoteTree({ stype: 'note', content: [{ stype, ...(stype === 'heading' ? { attributes: { level: 2 } } : {}), content: [{ stype: 'inline-text', text: value, marks }] }] });
  sessions.push(session);
  const editor = session.editor, run = [...editor.dataStore.getNodes().values()].find(node => node.text === value)!;
  editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: value.length, endOffset: value.length, collapsed: true });
  return editor;
}
for (const [prefix, input, kind, attrs] of [
  ['#', ' ', 'heading', { level: 1 }], ['######', ' ', 'heading', { level: 6 }],
  ['```', '\n', 'codeBlock', { language: 'text' }], ['```typescript', ' ', 'codeBlock', { language: 'typescript' }],
  ['>', ' ', 'blockQuote', {}], ['-', ' ', 'list', { type: 'bullet' }], ['1.', ' ', 'list', { type: 'ordered' }],
  ['[ ]', ' ', 'taskItem', { checked: false }], ['[x]', ' ', 'taskItem', { checked: true }]
] as const) it(`converts ${prefix} with ${JSON.stringify(input)} in one reversible transaction`, async () => {
  const editor = setup(prefix); const before = editor.exportDocument();
  const commit = planNoteInputRule(editor, editor.selection!, input);
  expect(commit).toBeDefined(); expect(await commit!()).toBe(true);
  const block = editor.exportDocument().content![0] as any;
  expect(block.stype).toBe(kind); expect(block.attributes ?? {}).toMatchObject(attrs);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.text).toBe('');
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true);
});
for (const [value, input, mark] of [['hello `code', '`', 'code'], ['**bold*', '*', 'bold'], ['*italic', '*', 'italic'], ['~~strike~', '~', 'strikethrough']] as const) {
  it(`applies ${mark}, removes delimiters and leaves an unmarked caret`, async () => {
    const editor = setup(value), before = editor.exportDocument();
    const commit = planNoteInputRule(editor, editor.selection!, input);
    expect(commit).toBeDefined(); expect(await commit!()).toBe(true);
    const runs = (editor.exportDocument().content![0] as any).content;
    expect(runs.some((node: any) => node.marks?.some((held: any) => held.stype === mark))).toBe(true);
    expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.marks ?? []).toEqual([]);
    expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  });
}
it('does not interpret code, escaped delimiters, multiline or non-start markers', () => {
  for (const [value, input, kind, marks] of [
    ['#', ' ', 'codeBlock', []], ['`a', '`', 'paragraph', [{ stype: 'code' }]],
    ['\\`a', '`', 'paragraph', []], ['before #', ' ', 'paragraph', []],
    ['`two\nlines', '`', 'paragraph', []], ['#######', ' ', 'paragraph', []]
  ] as const) {
    const editor = setup(value, kind, [...marks]);
    expect(planNoteInputRule(editor, editor.selection!, input)).toBeUndefined();
  }
});

it('keeps a suffix, existing neighboring marks and inline atoms when replacing delimiters', async () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [
    { stype: 'inline-text', text: 'keep', marks: [{ stype: 'bold', range: [0, 4] }] },
    { stype: 'emoji', attributes: { unicode: '🙂' } },
    { stype: 'inline-text', text: ' `value tail', marks: [] }
  ] }] }); sessions.push(session);
  const editor = session.editor, run = [...editor.dataStore.getNodes().values()].find(node => node.text === ' `value tail')!;
  editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 7, endOffset: 7, collapsed: true });
  const before = editor.exportDocument();
  const commit = planNoteInputRule(editor, editor.selection!, '`');
  expect(await commit!()).toBe(true);
  const children = (editor.exportDocument().content![0] as any).content;
  expect(children[0]).toMatchObject({ text: 'keep', marks: [{ stype: 'bold' }] });
  expect(children[1]).toMatchObject({ stype: 'emoji', attributes: { unicode: '🙂' } });
  expect(children.map((node: any) => node.text ?? '').join('')).toBe('keep value tail');
  expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.text).toBe(' tail');
  expect(editor.selection!.startOffset).toBe(0);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
});

it('does not replace a non-collapsed selection or reinterpret an existing heading', () => {
  const editor = setup('#', 'heading');
  expect(planNoteInputRule(editor, editor.selection!, ' ')).toBeUndefined();
  editor.setRange({ ...editor.selection!, startOffset: 0, collapsed: false });
  expect(planNoteInputRule(editor, editor.selection!, ' ')).toBeUndefined();
});

it('converts a fence split across visually formatted runs and an empty caret run, reversibly', async () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [
    { stype: 'inline-text', text: '`', marks: [{ stype: 'bold', range: [0, 1] }] },
    { stype: 'inline-text', text: '``', marks: [] },
    { stype: 'inline-text', text: '', marks: [] }
  ] }] }); sessions.push(session);
  const editor = session.editor;
  const run = [...editor.dataStore.getNodes().values()].find(node => node.text === '')!;
  editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  const before = editor.exportDocument();
  expect(await planNoteInputRule(editor, editor.selection!, '\n')!()).toBe(true);
  expect(editor.exportDocument().content![0].stype).toBe('codeBlock');
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
});
it('turns typed dollar math into an atom and undoes as one edit', async () => {
  const editor = setup('수식 $x^2'), before = editor.exportDocument();
  const commit = planNoteInputRule(editor, editor.selection!, '$');
  expect(commit).toBeDefined(); expect(await commit!()).toBe(true);
  expect(editor.dataStore.getAllNodes().find(node => node.stype === 'mathInline')?.attributes?.tex).toBe('x^2');
  await editor.undo(); expect(editor.exportDocument()).toEqual(before);
});
it.each(['price $5 and ', '\\$x', '$$x', '$ x', '$x '])('keeps non-math dollars literal: %s', value => {
  const editor = setup(value); expect(planNoteInputRule(editor, editor.selection!, '$')).toBeUndefined();
});
