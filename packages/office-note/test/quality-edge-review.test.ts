import { afterEach, expect, it } from 'vitest';
import { openNoteTree, type NoteSession } from '../src/session';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.close()));

it('promoting the only body row retains the caret on its existing text', async () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'bTable', content: [
    { stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [{ stype: 'bTableCell', content: [{ stype: 'inline-text', text: 'Existing text' }] }] }] }
  ] }] });
  sessions.push(session);
  const editor = session.editor;
  const nodes = [...editor.dataStore.getNodes().values()];
  const text = nodes.find(node => node.text === 'Existing text')!;
  const table = nodes.find(node => node.stype === 'bTable')!;
  editor.setRange({ type: 'range', startNodeId: text.sid!, endNodeId: text.sid!, startOffset: 5, endOffset: 5, collapsed: true });
  expect(await editor.executeCommand('setTableHeader', { tableId: table.sid, enabled: true })).toBe(true);
  expect(editor.selection).toMatchObject({ startNodeId: text.sid, startOffset: 5 });
  expect(editor.dataStore.getNode(text.sid!)?.text).toBe('Existing text');
});

it('toggles a link onto unlinked selected text even if another part of the run has the same link', async () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [
    { stype: 'inline-text', text: 'ABCD', marks: [{ stype: 'link', attrs: { href: 'https://example.com' }, range: [0, 2] }] }
  ] }] });
  sessions.push(session);
  const editor = session.editor;
  const text = [...editor.dataStore.getNodes().values()].find(node => node.text === 'ABCD')!;
  editor.setRange({ type: 'range', startNodeId: text.sid!, endNodeId: text.sid!, startOffset: 2, endOffset: 4, collapsed: false });
  expect(await editor.executeCommand('toggleLink', { href: 'https://example.com' })).toBe(true);
  const links = editor.dataStore.getNode(text.sid!)?.marks?.filter(mark => mark.stype === 'link') ?? [];
  expect(links.some(mark => mark.range && mark.range[0] <= 2 && mark.range[1] >= 4)).toBe(true);
});

it('header promotion and demotion preserve a cross-cell range and restore contents on undo/redo', async () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'bTable', content: [
    { stype: 'bTableBody', content: [{ stype: 'bTableRow', content: ['First', 'Second'].map(text => ({ stype: 'bTableCell', attributes: { backgroundColor: '#ff0000' }, content: [{ stype: 'inline-text', text, marks: [{ stype: 'bold', range: [0, text.length] }] }] })) }] }
  ] }] }); sessions.push(session);
  const editor = session.editor, all = [...editor.dataStore.getNodes().values()];
  const first = all.find(node => node.text === 'First')!, last = all.find(node => node.text === 'Second')!;
  const table = all.find(node => node.stype === 'bTable')!;
  const selected = { type: 'range' as const, startNodeId: first.sid!, startOffset: 2, endNodeId: last.sid!, endOffset: 3, collapsed: false };
  editor.setRange(selected);
  const before = editor.exportDocument();
  expect(await editor.executeCommand('setTableHeader', { tableId: table.sid, enabled: true })).toBe(true);
  expect(editor.selection).toMatchObject(selected);
  const promoted = editor.exportDocument();
  expect(await editor.undo()).toBe(true); expect(editor.selection).toMatchObject(selected); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(editor.selection).toMatchObject(selected); expect(editor.exportDocument()).toEqual(promoted);
  expect(await editor.executeCommand('setTableHeader', { tableId: table.sid, enabled: false })).toBe(true);
  expect(editor.selection).toMatchObject(selected);
  expect(editor.dataStore.getNode(first.sid!)?.marks).toEqual([{ stype: 'bold', range: [0, 5] }]);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(promoted);
});

it('link toggle fills partial multi-run coverage, then removes the selected coverage, with undo/redo', async () => {
  const href = 'https://example.com';
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [
    { stype: 'inline-text', text: 'ABCD', marks: [{ stype: 'link', attrs: { href }, range: [0, 4] }] },
    { stype: 'inline-text', text: 'EFGH', marks: [{ stype: 'link', attrs: { href }, range: [0, 1] }] }
  ] }] }); sessions.push(session);
  const editor = session.editor, runs = [...editor.dataStore.getNodes().values()].filter(node => typeof node.text === 'string');
  const selection = { type: 'range' as const, startNodeId: runs[0].sid!, startOffset: 2, endNodeId: runs[1].sid!, endOffset: 3, collapsed: false };
  editor.setRange(selection);
  const before = editor.exportDocument();
  expect(await editor.executeCommand('toggleLink', { href })).toBe(true);
  expect(editor.dataStore.getNode(runs[1].sid!)?.marks).toEqual([{ stype: 'link', attrs: { href }, range: [0, 3] }]);
  const linked = editor.exportDocument();
  expect(editor.selection).toMatchObject(selection);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(editor.exportDocument()).toEqual(linked);
  expect(await editor.executeCommand('toggleLink', { href })).toBe(true);
  expect(editor.dataStore.getNode(runs[0].sid!)?.marks).toEqual([{ stype: 'link', attrs: { href }, range: [0, 2] }]);
  expect(editor.dataStore.getNode(runs[1].sid!)?.marks).toEqual([]);
  expect(editor.selection).toMatchObject(selection);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(linked);
});

it('removeLink cuts the selected interval without removing unselected link tails', async () => {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [
    { stype: 'inline-text', text: 'ABCDEF', marks: [{ stype: 'link', attrs: { href: 'https://example.com' }, range: [0, 6] }] }
  ] }] }); sessions.push(session);
  const editor = session.editor;
  const text = [...editor.dataStore.getNodes().values()].find(node => node.text === 'ABCDEF')!;
  editor.setRange({ type: 'range', startNodeId: text.sid!, endNodeId: text.sid!, startOffset: 2, endOffset: 4, collapsed: false });
  const before = editor.exportDocument();
  expect(await editor.executeCommand('removeLink')).toBe(true);
  expect(editor.dataStore.getNode(text.sid!)?.marks?.map(mark => mark.range)).toEqual([[0, 2], [4, 6]]);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
});
