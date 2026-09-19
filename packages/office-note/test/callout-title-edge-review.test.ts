import { afterEach, expect, it } from 'vitest';
import { validateTree } from '@barocss/schema';
import { openNoteTree, type NoteSession } from '../src/session';

const sessions: NoteSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.close(); });
const text = (value: string) => ({ stype: 'inline-text', text: value });
const semantic = (node: any): unknown => ({
  ...node, marks: node.marks ?? [],
  ...(node.content ? { content: node.content.map(semantic) } : {})
});
const emoji = { stype: 'emoji', attributes: { unicode: '🙂' } };
function setup(title: unknown[]) {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'callout', attributes: { type: 'info' }, content: [
    { stype: 'calloutTitle', content: title }, { stype: 'paragraph', content: [text('BODY')] }
  ] }] });
  sessions.push(session);
  const editor = session.editor;
  const find = (value: string) => [...editor.dataStore.getNodes().values()].find(node => node.text === value)!;
  const select = (start: string, from: number, end = start, to = from) => {
    const a = find(start), b = find(end);
    editor.setRange({ type: 'range', startNodeId: a.sid, endNodeId: b.sid,
      startOffset: from, endOffset: to, collapsed: a.sid === b.sid && from === to });
  };
  return { editor, select };
}

it('Enter replacing a range from title into body preserves unselected text and structural roles', async () => {
  const { editor, select } = setup([text('TITLE')]);
  const before = semantic(editor.exportDocument());
  select('TITLE', 2, 'BODY', 2);
  expect(await editor.executeCommand('insertParagraph')).toBe(true);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  const saved = JSON.stringify(editor.exportDocument());
  expect(saved).toContain('TI');
  expect(saved).toContain('DY');
  expect(editor.selection).toMatchObject({ startOffset: 0, endOffset: 0, collapsed: true });
  expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.text).toBe('DY');
  const after = semantic(editor.exportDocument());
  expect(await editor.undo()).toBe(true);
  expect(semantic(editor.exportDocument())).toEqual(before);
  expect(await editor.redo()).toBe(true);
  expect(semantic(editor.exportDocument())).toEqual(after);
});

it('Enter before an atom-only title suffix leaves an editable text caret in the new body paragraph', async () => {
  const { editor, select } = setup([text('TITLE'), emoji]);
  const before = semantic(editor.exportDocument());
  select('TITLE', 5);
  expect(await editor.executeCommand('insertParagraph')).toBe(true);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  const at = editor.dataStore.getNode(editor.selection!.startNodeId);
  expect(at?.text).toBeTypeOf('string');
  expect(await editor.undo()).toBe(true);
  expect(semantic(editor.exportDocument())).toEqual(before);
  expect(await editor.redo()).toBe(true);
  expect(await editor.executeCommand('replaceText', { range: editor.selection, text: 'next' })).toBe(true);
  // The emoji survives moving from title to body.
  expect(JSON.stringify(editor.exportDocument())).toContain('🙂');
});

it('deleting a title-to-body selection also removes selected inline atoms and undo restores them', async () => {
  const { editor, select } = setup([text('TITLE'), emoji]);
  const before = semantic(editor.exportDocument());
  select('TITLE', 2, 'BODY', 2);
  expect(await editor.executeCommand('backspace')).toBe(true);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  expect(JSON.stringify(editor.exportDocument())).not.toContain('🙂');
  expect(editor.selection).toMatchObject({ startOffset: 2, endOffset: 2, collapsed: true });
  expect(editor.dataStore.getNode(editor.selection!.startNodeId)?.text).toBe('TI');
  expect(await editor.undo()).toBe(true);
  expect(semantic(editor.exportDocument())).toEqual(before);
});
