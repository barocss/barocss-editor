import { afterEach, describe, expect, it } from 'vitest';
import { validateTree } from '@barocss/schema';
import { openNoteTree, type NoteSession } from '../src/session';
import { editCodeText } from '../src/code-block-editor';
import { holdsWriting } from '../src/selection';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.close()));
function setup(value = 'abcDEF') {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'codeBlock', attributes: { language: 'text' }, content: [{ stype: 'inline-text', text: value, marks: [] }] }] });
  sessions.push(session);
  const editor = session.editor;
  const run = editor.dataStore.getAllNodes().find(node => node.text === value)!;
  editor.selectionManager.setSelection({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 3, endOffset: 3, collapsed: true });
  return { editor, run };
}
describe('code writing uses durable prose editing', () => {
  it.each([['newline', '\n'], ['indent', '\t']] as const)('%s stays inside one code block and has a reversible caret', async (action, inserted) => {
    const { editor, run } = setup(), before = editor.exportDocument();
    expect(holdsWriting('codeBlock')).toBe(true);
    expect(await editCodeText(editor, editor.selection!, action)).toBe(true);
    expect(editor.dataStore.getNode(run.sid!)?.text).toBe(`abc${inserted}DEF`);
    expect(editor.dataStore.getAllNodes().filter(node => node.stype === 'codeBlock')).toHaveLength(1);
    expect(editor.selection?.startOffset).toBe(4);
    expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
    expect(await editor.redo()).toBe(true); expect(editor.dataStore.getNode(run.sid!)?.text).toBe(`abc${inserted}DEF`);
  });
  it('pastes literal multiline code instead of parsing Markdown and persists language and text', async () => {
    const { editor, run } = setup();
    const literal = '# title\n\n\t**value**\n';
    expect(await editor.executeCommand('paste', { clipboardText: literal, clipboardHtml: '<h1>title</h1>' })).toBe(true);
    expect(editor.dataStore.getNode(run.sid!)?.text).toBe(`abc${literal}DEF`);
    expect(await editor.executeCommand('setNoteAttrs', { nodeId: run.parentId, attrs: { language: 'python' } })).toBe(true);
    const saved = editor.exportDocument();
    const reopened = openNoteTree(saved); sessions.push(reopened);
    expect(reopened.editor.dataStore.getAllNodes().find(node => node.stype === 'codeBlock')?.attributes?.language).toBe('python');
    expect(reopened.editor.dataStore.getAllNodes().some(node => node.text === `abc${literal}DEF`)).toBe(true);
    expect(validateTree(editor.dataStore.getActiveSchema()!, saved)).toEqual([]);
  });
  it('indents only selected lines, outdents them and restores both operations', async () => {
    const { editor, run } = setup('a\nb\nc');
    editor.selectionManager.setSelection({ ...editor.selection!, startOffset: 0, endOffset: 4, collapsed: false });
    const before = editor.exportDocument();
    expect(await editCodeText(editor, editor.selection!, 'indent')).toBe(true);
    expect(editor.dataStore.getNode(run.sid!)?.text).toBe('\ta\n\tb\nc');
    expect(editor.selection).toMatchObject({ startOffset: 1, endOffset: 6, collapsed: false });
    editor.historyManager.closeGroup();
    expect(await editCodeText(editor, editor.selection!, 'outdent')).toBe(true);
    expect(editor.dataStore.getNode(run.sid!)?.text).toBe('a\nb\nc');
    expect(await editor.undo()).toBe(true); expect(editor.dataStore.getNode(run.sid!)?.text).toBe('\ta\n\tb\nc');
    expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  });
  it('outdents a caret line without removing code characters', async () => {
    const { editor, run } = setup('    abc');
    editor.selectionManager.setSelection({ ...editor.selection!, startOffset: 2, endOffset: 2 });
    expect(await editCodeText(editor, editor.selection!, 'outdent')).toBe(true);
    expect(editor.dataStore.getNode(run.sid!)?.text).toBe('abc');
    expect(editor.selection).toMatchObject({ startOffset: 0, endOffset: 0, collapsed: true });
  });
});
