import { afterEach, expect, it } from 'vitest';
import { openNoteTree, type NoteSession } from '../src/session';
import { getNoteDatabase } from '../src/database';
const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(s => s.close()));
async function setup() {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] }); sessions.push(session);
  const editor = session.editor;
  await editor.executeCommand('insertNoteDatabase', { fields: [{ name: '이름', kind: 'text' }, { name: '상태', kind: 'text' }], records: [{ 이름: 'A', 상태: '' }, { 이름: 'B', 상태: '' }, { 이름: 'C', 상태: '' }] });
  const nodeId = [...editor.dataStore.getNodes().values()].find(n => n.stype === 'noteDatabase')!.sid!;
  return { editor, nodeId, db: () => getNoteDatabase(editor, nodeId)! };
}
it('bulk updates stable row IDs and undoes in one step', async () => {
  const { editor, nodeId, db } = await setup(), rowIds = [db().rowIds[0], db().rowIds[2]], before = editor.exportDocument();
  expect(await editor.executeCommand('batchNoteDatabaseRows:set', { nodeId, rowIds, field: '상태', value: '완료' })).toBe(true);
  expect(db().records.map(row => row.상태)).toEqual(['완료', '', '완료']);
  await editor.undo(); expect(editor.exportDocument()).toEqual(before);
  await editor.redo(); expect(db().records[2].상태).toBe('완료');
});
it('bulk deletion preserves unselected identities, removes item bodies and restores with undo', async () => {
  const { editor, nodeId, db } = await setup();
  await editor.executeCommand('setNoteDatabaseItemBody', { nodeId, row: 0, blocks: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'body' }] }] });
  const before = editor.exportDocument(), rowIds = [db().rowIds[0], db().rowIds[2]], kept = db().rowIds[1];
  expect(await editor.executeCommand('batchNoteDatabaseRows:remove', { nodeId, rowIds })).toBe(true);
  expect(db().rowIds).toEqual([kept]); expect(JSON.stringify(editor.exportDocument())).not.toContain('"text":"body"');
  await editor.undo(); expect(editor.exportDocument()).toEqual(before);
});
it('stale selections and readonly documents never partially change rows', async () => {
  const { editor, nodeId, db } = await setup(), before = editor.exportDocument();
  expect(await editor.executeCommand('batchNoteDatabaseRows:remove', { nodeId, rowIds: [db().rowIds[0], 'missing'] })).toBe(false);
  editor.setEditable(false);
  expect(await editor.executeCommand('batchNoteDatabaseRows:set', { nodeId, rowIds: db().rowIds, field: '상태', value: 'x' })).toBe(false);
  expect(editor.exportDocument()).toEqual(before);
});
it('advanced batch collections add/remove without replacing other choices and recalculate formulas/rollups', async () => {
  const { editor, nodeId, db } = await setup();
  await editor.executeCommand('setNoteDatabaseField', { nodeId, field: '태그', kind: 'choices', options: ['기존', '추가'] });
  await editor.executeCommand('setNoteDatabaseField', { nodeId, field: '수', kind: 'number' });
  await editor.executeCommand('setNoteDatabaseField', { nodeId, field: '계산', kind: 'formula', formula: { expression: 'prop("수") * 2' } });
  await editor.executeCommand('setNoteDatabaseField', { nodeId, field: '연결', kind: 'relation', relation: { source: db().source, multiple: true } });
  await editor.executeCommand('setNoteDatabaseField', { nodeId, field: '합계', kind: 'rollup', rollup: { relationField: '연결', field: '계산', operation: 'sum' } });
  const ids = db().rowIds;
  await editor.executeCommand('setNoteDatabaseCell', { nodeId, row: 0, field: '태그', value: ['기존'] });
  expect(await editor.executeCommand('batchNoteDatabaseRows:set', { nodeId, rowIds: ids, field: '태그', value: ['추가'], mode: 'add' })).toBe(true);
  expect(db().records[0].태그).toEqual(['기존', '추가']);
  await editor.executeCommand('batchNoteDatabaseRows:set', { nodeId, rowIds: ids, field: '태그', value: ['추가'], mode: 'remove' });
  expect(db().records[0].태그).toEqual(['기존']); expect(db().records[1].태그).toEqual([]);
  await editor.executeCommand('batchNoteDatabaseRows:set', { nodeId, rowIds: ids, field: '수', value: 3 });
  expect(await editor.executeCommand('batchNoteDatabaseRows:set', { nodeId, rowIds: [ids[0]], field: '연결', value: [ids[1], ids[2]], mode: 'add' })).toBe(true);
  expect(db().computedRecords[0].합계).toBe(12);
  await editor.executeCommand('batchNoteDatabaseRows:set', { nodeId, rowIds: [ids[1]], field: '수', value: 5 });
  expect(db().computedRecords[0].합계).toBe(16);
  await editor.undo(); expect(db().computedRecords[0].합계).toBe(12);
  expect(await editor.executeCommand('batchNoteDatabaseRows:set', { nodeId, rowIds: ids, field: '계산', value: 999 })).toBe(false);
  expect(await editor.executeCommand('batchNoteDatabaseRows:set', { nodeId, rowIds: ids, field: '연결', value: ['missing'] })).toBe(false);
});
