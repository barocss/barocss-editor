import { afterEach, expect, it } from 'vitest';
import { openNoteTree, type NoteSession } from '../src/session';
import { selectedLink } from '../../office-editor-ui/src/selection-link';
const sessions: NoteSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.close(); });
function setup() {
  const session = openNoteTree({ stype: 'note', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Alpha' }, { stype: 'inline-text', text: 'Beta' }] }
  ] });
  sessions.push(session);
  const editor = session.editor;
  const runs = [...editor.dataStore.getNodes().values()].filter(node => typeof node.text === 'string');
  editor.setRange({ type: 'range', startNodeId: runs[0].sid!, startOffset: 1, endNodeId: runs[1].sid!, endOffset: 2, collapsed: false });
  return { editor, runs };
}
it('updates an existing link and applying the same URL retains it across multiple runs', async () => {
  const { editor, runs } = setup();
  await editor.executeCommand('toggleLink', { href: 'https://example.com', replace: true });
  expect(selectedLink(editor, editor.selection!)).toBe('https://example.com');
  await editor.executeCommand('toggleLink', { href: 'https://example.com', replace: true });
  for (const run of runs) expect(editor.dataStore.getNode(run.sid!)?.marks?.[0]?.attrs?.href).toBe('https://example.com');
  await editor.executeCommand('toggleLink', { href: 'https://example.com/updated', replace: true });
  expect(selectedLink(editor, editor.selection!)).toBe('https://example.com/updated');
  await editor.undo();
  expect(selectedLink(editor, editor.selection!)).toBe('https://example.com');
});
it('removes links from the whole selected range, retains unselected portions, and undoes together', async () => {
  const { editor, runs } = setup();
  await editor.executeCommand('toggleLink', { href: 'https://example.com', replace: true });
  const before = editor.exportDocument();
  expect(await editor.executeCommand('removeLink')).toBe(true);
  for (const run of runs) expect(editor.dataStore.getNode(run.sid!)?.marks?.filter(mark => mark.stype === 'link')).toEqual([]);
  expect(selectedLink(editor, editor.selection!)).toBe('');
  await editor.undo();
  expect(editor.exportDocument()).toEqual(before);
});
