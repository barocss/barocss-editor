import { afterEach, expect, it } from 'vitest';
import { openNoteTree, type NoteSession } from '../src/session';
import { getNoteDatabase } from '../src/database';
import { databaseCSVRows, databaseCSVText } from '../src/database-csv';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.close()));
async function setup() {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] }); sessions.push(session);
  const editor = session.editor;
  await editor.executeCommand('insertNoteDatabase', { fields: [{ name: '이름', kind: 'text' }, { name: '수', kind: 'number' }, { name: '완료', kind: 'boolean' }], records: [{ 이름: '기존', 수: 1, 완료: false }] });
  const nodeId = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'noteDatabase')!.sid!;
  return { editor, nodeId, db: () => getNoteDatabase(editor, nodeId)! };
}
it('appends all rows atomically, preserves spaces/newlines and row identities, and restores with undo', async () => {
  const { editor, nodeId, db } = await setup(), before = editor.exportDocument(), oldId = db().rowIds[0];
  const csv = '이름,수,완료\r\n"  한글\n이름  ",12,true\r\n빈 값,,';
  expect(await editor.executeCommand('importNoteDatabaseCSV', { nodeId, csv })).toBe(true);
  expect(db().records).toEqual([{ 이름: '기존', 수: 1, 완료: false }, { 이름: '  한글\n이름  ', 수: 12, 완료: true }, { 이름: '빈 값', 수: '', 완료: '' }]);
  expect(db().rowIds[0]).toBe(oldId); expect(new Set(db().rowIds).size).toBe(3);
  expect(databaseCSVRows(databaseCSVText(db()), db())).toEqual(db().records);
  await editor.undo(); expect(editor.exportDocument()).toEqual(before);
  await editor.redo(); expect(db().records).toHaveLength(3);
});
it('rejects invalid numeric, unknown or duplicate fields before any mutation', async () => {
  const { editor, nodeId, db } = await setup(), before = editor.exportDocument();
  for (const csv of ['이름,수\n좋음,1\n실패,abc', '없는 필드\n내용', '이름,이름\na,b', '__proto__\nx']) {
    expect(() => databaseCSVRows(csv, db())).toThrow();
    expect(await editor.executeCommand('importNoteDatabaseCSV', { nodeId, csv })).toBe(false);
    expect(editor.exportDocument()).toEqual(before);
  }
});
