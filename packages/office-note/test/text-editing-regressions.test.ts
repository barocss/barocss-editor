import { afterEach, describe, expect, it } from 'vitest';
import { validateTree } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import type { INode } from '@barocss/datastore';
import { openNoteTree, type NoteSession } from '../src/session';

const sessions: NoteSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.close(); });
const text = (value: string, marks: unknown[] = []) => ({ stype: 'inline-text', text: value, marks });
const paragraph = (value: string) => ({ stype: 'paragraph', content: [text(value)] });
const bold = (start: number, end: number) => ({ stype: 'bold', range: [start, end] });
const shapes = ['paragraph', 'heading', 'taskItem', 'summary', 'callout-body', 'callout-title'] as const;
type Shape = typeof shapes[number];
function setup(shape: Shape, runs: unknown[] = [text('ABCD', [bold(0, 4)])]) {
  const block = shape === 'summary'
    ? { stype: 'bDetails', attributes: { open: true }, content: [{ stype: 'bSummary', content: runs }, paragraph('Body stays')] }
    : shape === 'callout-body' || shape === 'callout-title'
      ? { stype: 'callout', attributes: { type: 'note' }, content: [
        { stype: 'calloutTitle', content: shape === 'callout-title' ? runs : [text('Title stays')] },
        shape === 'callout-title' ? paragraph('Body stays') : { stype: 'paragraph', content: runs }
      ] }
      : { stype: shape, attributes: shape === 'heading' ? { level: 2 } : shape === 'taskItem' ? { checked: true } : {}, content: runs };
  const session = openNoteTree({ stype: 'note', content: [paragraph('Before stays'), block, paragraph('After stays')] });
  sessions.push(session);
  return session.editor;
}
function nodes(editor: Editor, sid = editor.getRootId()!): INode[] {
  const node = editor.dataStore.getNode(sid);
  if (!node) return [];
  return [node, ...(node.content ?? []).flatMap(child => typeof child === 'string' ? nodes(editor, child) : [])];
}
const findText = (editor: Editor, value: string) => nodes(editor).find(node => node.text === value)!;
const words = (editor: Editor, sid = editor.getRootId()!) => nodes(editor, sid).filter(node => typeof node.text === 'string').map(node => node.text).join('');
function select(editor: Editor, start: INode, startOffset: number, end = start, endOffset = startOffset) {
  editor.selectionManager.setSelection({ type: 'range', startNodeId: start.sid!, endNodeId: end.sid!, startOffset, endOffset,
    collapsed: start.sid === end.sid && startOffset === endOffset });
}
function expectUsableCaret(editor: Editor) {
  const selection = editor.selection;
  expect(selection?.collapsed).toBe(true);
  const node = editor.dataStore.getNode(selection!.startNodeId);
  expect(node?.text).toBeTypeOf('string');
  expect(selection!.startOffset).toBeGreaterThanOrEqual(0);
  expect(selection!.startOffset).toBeLessThanOrEqual(node!.text!.length);
  expect(nodes(editor).some(node => node.sid === selection!.startNodeId)).toBe(true);
}
function expectValid(editor: Editor) {
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
}
function letters(editor: Editor, sid: string) {
  return nodes(editor, sid).filter(node => typeof node.text === 'string').flatMap(node => [...node.text!].map((value, offset) => ({
    value, bold: (node.marks ?? []).some(mark => mark.stype === 'bold' && (!mark.range || offset >= mark.range[0] && offset < mark.range[1]))
  })));
}

describe.each(shapes)('%s text editing', shape => {
  it('replaces only the selected range and restores content, marks and selection through history', async () => {
    const editor = setup(shape);
    const run = findText(editor, 'ABCD');
    const before = editor.exportDocument();
    select(editor, run, 1, run, 3);
    const originalSelection = { ...editor.selection };
    expect(await editor.executeCommand('replaceText', { range: editor.selection, text: '한' })).toBe(true);
    expect(words(editor, run.parentId!)).toBe('A한D');
    expect(letters(editor, run.parentId!).filter(letter => ['A', 'D'].includes(letter.value))).toEqual([
      { value: 'A', bold: true }, { value: 'D', bold: true }
    ]);
    expect(words(editor)).toContain('Before stays');
    expect(words(editor)).toContain('After stays');
    expectUsableCaret(editor);
    expect(editor.selection?.startOffset).toBe(2);
    expectValid(editor);
    const after = editor.exportDocument();
    expect(await editor.undo()).toBe(true);
    expect(editor.exportDocument()).toEqual(before);
    expect(editor.selection).toMatchObject(originalSelection);
    expect(await editor.redo()).toBe(true);
    expect(editor.exportDocument()).toEqual(after);
    expectUsableCaret(editor);
  });

  it('can delete all text, type into the empty block, and undo without detaching its caret', async () => {
    const editor = setup(shape);
    const run = findText(editor, 'ABCD');
    const before = editor.exportDocument();
    select(editor, run, 0, run, 4);
    expect(await editor.executeCommand('backspace')).toBe(true);
    expect(words(editor, run.parentId!)).toBe('');
    expectUsableCaret(editor);
    expectValid(editor);
    // Separate the delete and the next typing burst, as a focus/pause boundary does in the UI.
    editor.historyManager.closeGroup();
    expect(await editor.executeCommand('replaceText', { range: editor.selection, text: '다시' })).toBe(true);
    expect(words(editor, run.parentId!)).toBe('다시');
    expectUsableCaret(editor);
    expect(await editor.undo()).toBe(true);
    expect(await editor.undo()).toBe(true);
    expect(editor.exportDocument()).toEqual(before);
    expectValid(editor);
  });

  it('toggles a partial bold range reversibly without formatting the adjacent text', async () => {
    const editor = setup(shape, [text('ABCD')]);
    const run = findText(editor, 'ABCD');
    const before = editor.exportDocument();
    select(editor, run, 1, run, 3);
    expect(await editor.executeCommand('toggleBold')).toBe(true);
    expect(letters(editor, run.parentId!)).toEqual([
      { value: 'A', bold: false }, { value: 'B', bold: true }, { value: 'C', bold: true }, { value: 'D', bold: false }
    ]);
    expect(await editor.undo()).toBe(true);
    expect(editor.exportDocument()).toEqual(before);
    expect(await editor.redo()).toBe(true);
    expect(letters(editor, run.parentId!).filter(letter => letter.bold).map(letter => letter.value)).toEqual(['B', 'C']);
  });

  it('deletes across differently formatted runs without losing the unselected characters', async () => {
    const editor = setup(shape, [text('AB', [bold(0, 2)]), text('CD', [{ stype: 'italic', range: [0, 2] }]), text('EF')]);
    const first = findText(editor, 'AB'), last = findText(editor, 'EF');
    const before = editor.exportDocument();
    select(editor, first, 1, last, 1);
    expect(await editor.executeCommand('backspace')).toBe(true);
    expect(words(editor, first.parentId!)).toBe('AF');
    expect(letters(editor, first.parentId!)).toEqual([{ value: 'A', bold: true }, { value: 'F', bold: false }]);
    expectUsableCaret(editor);
    expectValid(editor);
    expect(await editor.undo()).toBe(true);
    expect(editor.exportDocument()).toEqual(before);
  });

  it('Enter keeps surrounding text and marks with one reversible edit', async () => {
    const editor = setup(shape, [text('ABCD', [bold(1, 3)])]);
    const run = findText(editor, 'ABCD');
    select(editor, run, 2);
    const before = editor.exportDocument();
    const beforeWords = words(editor);
    expect(await editor.executeCommand('insertParagraph')).toBe(true);
    expect(words(editor)).toBe(beforeWords);
    expectUsableCaret(editor);
    expectValid(editor);
    if (shape === 'summary') {
      expect(editor.selection?.startNodeId).toBe(findText(editor, 'Body stays').sid);
      expect(nodes(editor).filter(node => node.stype === 'bSummary')).toHaveLength(1);
    } else {
      const a = findText(editor, 'AB'), b = findText(editor, 'CD');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(letters(editor, a.parentId!).filter(letter => letter.bold).map(letter => letter.value)).toEqual(['B']);
      expect(letters(editor, b.parentId!).filter(letter => letter.bold).map(letter => letter.value)).toEqual(['C']);
      expect(await editor.undo()).toBe(true);
      expect(editor.exportDocument()).toEqual(before);
      expect(await editor.redo()).toBe(true);
      expect(words(editor)).toBe(beforeWords);
      expectValid(editor);
    }
  });
});

it.each(['', 'Title'])('Enter at the end of callout title %j moves into its existing body', async title => {
  const editor = setup('callout-title', [text(title)]);
  const run = findText(editor, title);
  const before = editor.exportDocument();
  select(editor, run, title.length);
  expect(await editor.executeCommand('insertParagraph')).toBe(true);
  expect(editor.exportDocument()).toEqual(before);
  expect(editor.selection?.startNodeId).toBe(findText(editor, 'Body stays').sid);
  expect(editor.selection?.startOffset).toBe(0);
  expectUsableCaret(editor);
  expectValid(editor);
});

it.each(['🙂', '👩‍💻', 'e\u0301'])('Backspace deletes a whole grapheme %j without corrupting its Unicode text', async grapheme => {
  const value = `A${grapheme}B`;
  const editor = setup('paragraph', [text(value)]);
  const run = findText(editor, value);
  const before = editor.exportDocument();
  select(editor, run, 1 + grapheme.length);
  expect(await editor.executeCommand('backspace')).toBe(true);
  expect(words(editor, run.parentId!)).toBe('AB');
  expectUsableCaret(editor);
  expect(editor.selection?.startOffset).toBe(1);
  expect(await editor.undo()).toBe(true);
  expect(editor.exportDocument()).toEqual(before);
});

it.each(['summary', 'callout-title'] as const)('deleting from %s into its body retains both required editable roles', async shape => {
  const editor = setup(shape, [text('TITLE')]);
  const summary = findText(editor, 'TITLE'), body = findText(editor, 'Body stays');
  const before = editor.exportDocument();
  select(editor, summary, 2, body, 2);
  expect(await editor.executeCommand('backspace')).toBe(true);
  expect(words(editor)).toBe('Before staysTIdy staysAfter stays');
  expectValid(editor);
  expectUsableCaret(editor);
  expect(await editor.undo()).toBe(true);
  expect(editor.exportDocument()).toEqual(before);
});

it('Backspace at a callout title start moves to preceding prose without merging the callout', async () => {
  const editor = setup('callout-title', [text('Title')]);
  const before = editor.exportDocument();
  select(editor, findText(editor, 'Title'), 0);
  expect(await editor.executeCommand('backspace')).toBe(true);
  expect(editor.exportDocument()).toEqual(before);
  expect(editor.selection?.startNodeId).toBe(findText(editor, 'Before stays').sid);
  expect(editor.selection?.startOffset).toBe('Before stays'.length);
  expectUsableCaret(editor);
});

it.each(['Title', ''])('Backspace at the first callout body start moves into title %j without deleting either role', async title => {
  const editor = setup('callout-title', [text(title)]);
  const before = editor.exportDocument();
  select(editor, findText(editor, 'Body stays'), 0);
  expect(await editor.executeCommand('backspace')).toBe(true);
  expect(editor.exportDocument()).toEqual(before);
  expect(editor.selection?.startNodeId).toBe(findText(editor, title).sid);
  expect(editor.selection?.startOffset).toBe(title.length);
  expectUsableCaret(editor);
});

it('Backspace from a second callout body paragraph joins prose and preserves the title', async () => {
  const editor = setup('callout-title', [text('Title')]);
  select(editor, findText(editor, 'Body stays'), 'Body stays'.length);
  expect(await editor.executeCommand('insertParagraph')).toBe(true);
  expect(await editor.executeCommand('replaceText', { range: editor.selection, text: 'Second' })).toBe(true);
  editor.historyManager.closeGroup();
  const before = editor.exportDocument();
  select(editor, findText(editor, 'Second'), 0);
  expect(await editor.executeCommand('backspace')).toBe(true);
  const title = findText(editor, 'Title');
  const calloutId = editor.dataStore.getNode(title.parentId!)!.parentId!;
  expect(words(editor, calloutId)).toBe('TitleBody staysSecond');
  expect(nodes(editor, calloutId).filter(node => node.stype === 'paragraph')).toHaveLength(1);
  expectValid(editor);
  expectUsableCaret(editor);
  expect(await editor.undo()).toBe(true);
  expect(editor.exportDocument()).toEqual(before);
});
