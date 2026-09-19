import { afterEach, expect, it } from 'vitest';
import { openNoteTree, type NoteSession } from '../src/session';
import { getNoteDatabase } from '../src/database';
import { readNoteDelimited } from '../src/note-exchange';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(s => s.close()));
async function setup() {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] }); sessions.push(session);
  const editor = session.editor;
  await editor.executeCommand('insertNoteDatabase', { fields: [{ name: '이름', kind: 'text' }, { name: '수', kind: 'number' }], records: [{ 이름: 'A', 수: 1 }, { 이름: 'B', 수: 2 }, { 이름: 'C', 수: 3 }] });
  const nodeId = [...editor.dataStore.getNodes().values()].find(n => n.stype === 'noteDatabase')!.sid!;
  return { editor, nodeId, db: () => getNoteDatabase(editor, nodeId)! };
}
it('preserves quoted tabs, line breaks, trailing empty cells and whitespace', () => {
  expect(readNoteDelimited('"a\tb"\t"line\nnext"\r\n  c  \t\r\n', '\t')).toEqual([['a\tb', 'line\nnext'], ['  c  ', '']]);
});
it('pastes in visible order by stable identity and restores everything in one undo', async () => {
  const { editor, nodeId, db } = await setup(), before = editor.exportDocument();
  expect(await editor.executeCommand('pasteNoteDatabaseRange', { nodeId, rowIds: [db().rowIds[2], db().rowIds[0]], fieldNames: ['이름', '수'], text: '  first  \t10\nsecond\t20' })).toBe(true);
  expect(db().records).toEqual([{ 이름: 'second', 수: 20 }, { 이름: 'B', 수: 2 }, { 이름: '  first  ', 수: 10 }]);
  await editor.undo(); expect(editor.exportDocument()).toEqual(before);
  await editor.redo(); expect(db().records[2].수).toBe(10);
});
it('rejects invalid values, overflow, computed fields, stale rows and readonly without partial writes', async () => {
  const { editor, nodeId, db } = await setup();
  await editor.executeCommand('setNoteDatabaseField', { nodeId, field: '계산', kind: 'formula', formula: { expression: 'prop("수") * 2' } });
  const before = editor.exportDocument(), base = { nodeId, rowIds: db().rowIds, fieldNames: ['이름', '수'] };
  for (const patch of [{ text: 'ok\t10\nbad\tinvalid' }, { text: 'a\tb\tc' }, { text: '1\n2\n3\n4' }, { text: 'x', rowIds: ['missing'] }, { text: '10', fieldNames: ['계산'] }]) {
    expect(await editor.executeCommand('pasteNoteDatabaseRange', { ...base, ...patch })).toBe(false);
    expect(editor.exportDocument()).toEqual(before);
  }
  editor.setEditable(false);
  expect(await editor.executeCommand('pasteNoteDatabaseRange', { ...base, text: 'x\t4' })).toBe(false);
  expect(editor.exportDocument()).toEqual(before);
});
