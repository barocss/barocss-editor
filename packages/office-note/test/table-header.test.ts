import { afterEach, expect, it } from 'vitest';
import { validateTree } from '@barocss/schema';
import { openNoteTree, type NoteSession } from '../src/session';
const sessions: NoteSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.close(); });
function setup(rows = 2, span = 1) {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'bTable', content: [{ stype: 'bTableBody', content: Array.from({ length: rows }, (_, i) => ({ stype: 'bTableRow', content: [
    { stype: 'bTableCell', attributes: { rowspan: span, shadingFill: 'FEF3C7' }, content: [{ stype: 'inline-text', text: `Row ${i}`, marks: [{ stype: 'bold', range: [0, 3] }] }] }
  ] })) }] }] });
  sessions.push(session);
  const editor = session.editor;
  const tableId = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'bTable')!.sid!;
  return { editor, tableId };
}
it('promotes and demotes the first row, retaining content, ids, marks, colors and undo', async () => {
  const { editor, tableId } = setup();
  const before = editor.exportDocument();
  const text = [...editor.dataStore.getNodes().values()].find(node => node.text === 'Row 0')!;
  expect(await editor.executeCommand('setTableHeader', { tableId, enabled: true })).toBe(true);
  expect(editor.dataStore.getNode(text.parentId!)?.stype).toBe('bTableHeaderCell');
  expect(editor.dataStore.getNode(text.sid!)?.marks).toEqual(text.marks);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  expect(await editor.undo()).toBe(true);
  expect(editor.exportDocument()).toEqual(before);
  await editor.redo();
  expect(await editor.executeCommand('setTableHeader', { tableId, enabled: false })).toBe(true);
  expect(editor.dataStore.getNode(text.parentId!)?.stype).toBe('bTableCell');
  expect(editor.dataStore.getNode(text.parentId!)?.attributes?.shadingFill).toBe('FEF3C7');
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
});
it('keeps an editable body when promoting the only row and restores exactly on undo', async () => {
  const { editor, tableId } = setup(1);
  const before = editor.exportDocument();
  expect(await editor.executeCommand('setTableHeader', { tableId, enabled: true })).toBe(true);
  expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  expect([...editor.dataStore.getNodes().values()].some(node => node.stype === 'bTableCell')).toBe(true);
  await editor.undo();
  expect(editor.exportDocument()).toEqual(before);
});
it('rejects row spans crossing a header boundary without changing the document', async () => {
  const { editor, tableId } = setup(2, 2);
  const before = editor.exportDocument();
  expect(editor.canExecuteCommand('setTableHeader', { tableId, enabled: true })).toBe(false);
  expect(await editor.executeCommand('setTableHeader', { tableId, enabled: true })).toBe(false);
  expect(editor.exportDocument()).toEqual(before);
});
