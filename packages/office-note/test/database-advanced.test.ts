import { expect, it } from 'vitest';
import { openNoteTree } from '../src/session';
import { getNoteDatabase, getNoteDatabaseSources, getNoteDatabaseCommandError, noteDatabaseRows, copyNoteDatabaseResources } from '../src/database';
import { transaction } from '@barocss/model';
import { validateTree } from '@barocss/schema';

function setup() {
  const held = openNoteTree({ stype: 'note', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Report' }] },
    { stype: 'noteDatabase', attributes: { source: 'tasks' } },
    { stype: 'noteDatabase', attributes: { source: 'projects' } },
    { stype: 'resources', content: [
      { stype: 'dataset', attributes: { name: 'tasks', fields: [{ name: 'Name', kind: 'text' }, { name: 'Cost', kind: 'number' }], records: [{ Name: 'Task A', Cost: 3 }, { Name: 'Task B', Cost: 5 }], rowIds: ['task-a', 'task-b'] } },
      { stype: 'dataset', attributes: { name: 'projects', fields: ['Name'], records: [{ Name: 'Project A' }] } }
    ] }
  ] });
  const editor = held.editor;
  const id = (source: string) => [...editor.dataStore.getNodes().values()].find(node => node.stype === 'noteDatabase' && node.attributes?.source === source)!.sid!;
  const db = (source: string) => getNoteDatabase(editor, id(source))!;
  const run = (command: string, source: string, payload: Record<string, unknown>) => editor.executeCommand(command, { nodeId: id(source), ...payload });
  return { held, editor, id, db, run };
}

it('configures stable relations, derives formulas and rollups without storing computed cells, and reloads them', async () => {
  const { held, editor, id, db, run } = setup();
  expect(await run('setNoteDatabaseField', 'tasks', { field: 'Project', kind: 'relation', relation: { source: 'projects', multiple: false } })).toBe(true);
  const projectId = db('projects').rowIds[0]; expect(projectId).toBeTruthy();
  expect(await run('setNoteDatabaseCell', 'tasks', { row: 0, field: 'Project', value: [projectId] })).toBe(true);
  expect(await run('setNoteDatabaseField', 'tasks', { field: 'Double', kind: 'formula', formula: { expression: 'prop("Cost") * 2' } })).toBe(true);
  expect(await run('setNoteDatabaseField', 'projects', { field: 'Tasks', kind: 'relation', relation: { source: 'tasks', multiple: true } })).toBe(true);
  expect(await run('setNoteDatabaseCell', 'projects', { row: 0, field: 'Tasks', value: ['task-a', 'task-b'] })).toBe(true);
  expect(await run('setNoteDatabaseField', 'projects', { field: 'Total', kind: 'rollup', rollup: { relationField: 'Tasks', field: 'Double', operation: 'sum' } })).toBe(true);
  expect(db('projects').computedRecords[0]).toMatchObject({ Tasks: ['Task A', 'Task B'], Total: 16 });
  expect(db('tasks').computedRecords[0]).toMatchObject({ Project: ['Project A'], Double: 6 });
  expect(db('projects').records[0]).not.toHaveProperty('Total');
  expect(db('tasks').records[0]).not.toHaveProperty('Double');
  await run('setNoteDatabaseView', 'tasks', { sortBy: 'Double', sortDir: 'desc' });
  expect(noteDatabaseRows(db('tasks')).map(row => row.index)).toEqual([1, 0]);
  const saved = editor.exportDocument();
  const reopened = openNoteTree(saved);
  expect(getNoteDatabaseSources(reopened.editor)).toEqual(getNoteDatabaseSources(editor));
  const restored = [...reopened.editor.dataStore.getNodes().values()].find(node => node.stype === 'noteDatabase' && node.attributes?.source === 'projects')!;
  expect(getNoteDatabase(reopened.editor, restored.sid!)!.computedRecords[0].Total).toBe(16);
  expect(validateTree(editor.dataStore.getActiveSchema()!, saved)).toEqual([]);
  expect(await run('setNoteDatabaseCell', 'projects', { row: 0, field: 'Total', value: 900 })).toBe(false);
  expect(await run('setNoteDatabaseCell', 'tasks', { row: 0, field: 'Project', value: ['missing'] })).toBe(false);
  expect(getNoteDatabaseCommandError(editor, 'setNoteDatabaseCell', { nodeId: id('projects'), row: 0, field: 'Total', value: 900 })).toContain('계산');
  reopened.close(); held.close();
});

it('renames formula and cross-dataset rollup references atomically, rejects depended-on deletion, and exposes deleted relation targets', async () => {
  const { held, editor, id, db, run } = setup();
  await run('setNoteDatabaseField', 'tasks', { field: 'Double', kind: 'formula', formula: { expression: 'prop("Cost") * 2' } });
  await run('setNoteDatabaseField', 'projects', { field: 'Tasks', kind: 'relation', relation: { source: 'tasks' } });
  await run('setNoteDatabaseCell', 'projects', { row: 0, field: 'Tasks', value: ['task-a'] });
  await run('setNoteDatabaseField', 'projects', { field: 'Total', kind: 'rollup', rollup: { relationField: 'Tasks', field: 'Cost', operation: 'sum' } });
  const before = editor.exportDocument();
  expect(await run('setNoteDatabaseField', 'tasks', { field: 'Cost', name: 'Price' })).toBe(true);
  expect(db('tasks').fields.find(field => field.name === 'Double')?.formula?.expression).toBe('prop("Price") * 2');
  expect(db('projects').fields.find(field => field.name === 'Total')?.rollup?.field).toBe('Price');
  expect(db('projects').computedRecords[0].Total).toBe(3);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true);
  expect(await run('setNoteDatabaseField', 'tasks', { field: 'Price', remove: true })).toBe(false);
  expect(getNoteDatabaseCommandError(editor, 'setNoteDatabaseField', { nodeId: id('tasks'), field: 'Price', remove: true })).toContain('사용');
  expect(await run('setNoteDatabaseField', 'projects', { field: 'Tasks', kind: 'text' })).toBe(false);
  await run('removeNoteDatabaseRow', 'tasks', { row: 0 });
  expect(db('projects').records[0].Tasks).toEqual(['task-a']);
  expect(db('projects').errors[0]?.Tasks).toBeTruthy();
  await editor.undo(); expect(db('projects').computedRecords[0].Total).toBe(3);
  held.close();
});

it('clones related datasets in two passes, remapping only copied targets and preserving undo', async () => {
  const { held, editor, db, run } = setup();
  await run('setNoteDatabaseField', 'tasks', { field: 'Project', kind: 'relation', relation: { source: 'projects' } });
  await run('setNoteDatabaseField', 'projects', { field: 'Tasks', kind: 'relation', relation: { source: 'tasks' } });
  await run('setNoteDatabaseCell', 'tasks', { row: 0, field: 'Project', value: [db('projects').rowIds[0]] });
  await run('setNoteDatabaseCell', 'projects', { row: 0, field: 'Tasks', value: ['task-a'] });
  const before = editor.exportDocument(), copied = copyNoteDatabaseResources(editor, ['tasks', 'projects'])!;
  expect((await transaction(editor, copied.operations as never, { applySelectionToView: false }).commit()).success).toBe(true);
  const sources = getNoteDatabaseSources(editor), task = sources.find(source => source.name === copied.names.get('tasks'))!, project = sources.find(source => source.name === copied.names.get('projects'))!;
  expect(task.fields.find(field => field.name === 'Project')?.relation?.source).toBe(project.name);
  expect(task.records[0].Project).toEqual([project.rowIds[0]]);
  expect(project.records[0].Tasks).toEqual([task.rowIds[0]]);
  expect(task.rowIds[0]).not.toBe('task-a');
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  const one = copyNoteDatabaseResources(editor, ['tasks'])!;
  await transaction(editor, one.operations as never, { applySelectionToView: false }).commit();
  const single = getNoteDatabaseSources(editor).find(source => source.name === one.names.get('tasks'))!;
  expect(single.fields.find(field => field.name === 'Project')?.relation?.source).toBe('projects');
  expect(single.records[0].Project).toEqual([db('projects').rowIds[0]]);
  held.close();
});
