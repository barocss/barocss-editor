import { expect, it, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { Schema, validateTree } from '@barocss/schema';
import { getNoteSchemaDefinition, NOTE_BLOCKS } from '../src/note-schema';
import { getNoteDatabase, getNoteDatabaseItemId, getNoteDatabaseItemBody, getNoteDatabaseNodeDefinitions, noteDatabaseRows, registerNoteDatabaseCommands } from '../src/database';

function setup(tree: any = { stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Before' }] }] }) {
  const definition = getNoteSchemaDefinition();
  const nodes = { ...definition.nodes, ...getNoteDatabaseNodeDefinitions() };
  nodes.note = { ...nodes.note, content: `(${[...new Set([...NOTE_BLOCKS, 'noteDatabase'])].join('|')})+ resources?` };
  const schema = new Schema('note-database-test', { ...definition, nodes });
  const editor = new Editor({ schema, dataStore: new DataStore(undefined, schema), editable: true, extensions: [] });
  registerNoteDatabaseCommands(editor);
  editor.loadDocument(tree, 'db-test');
  const sid = () => String(editor.dataStore.getNode(editor.getRootId()!)?.content?.find(id => typeof id === 'string' && editor.dataStore.getNode(id)?.stype === 'noteDatabase'));
  const db = () => getNoteDatabase(editor, sid())!;
  return { editor, sid, db, schema };
}

it('creates a source resource and reference atom together, with undo/redo and save/reopen', async () => {
  const { editor, sid, db, schema } = setup();
  const before = editor.exportDocument();
  expect(await editor.executeCommand('insertNoteDatabase')).toBe(true);
  expect(db()).toMatchObject({ source: 'database-1', view: 'table', fields: [{ name: '이름', kind: 'text' }, { name: '상태', kind: 'choice' }] });
  expect(validateTree(schema, editor.exportDocument())).toEqual([]);
  const saved = editor.exportDocument();
  expect(setup(saved).db().records).toEqual(db().records);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(getNoteDatabase(editor, sid())?.records).toEqual([{'이름':'', '상태':''}]);
});

it('edits fields and preserves values on type change, rename and undo', async () => {
  const { editor, sid, db } = setup();
  await editor.executeCommand('insertNoteDatabase', { fields: [{ name: 'Price', kind: 'text' }, { name: 'Status', kind: 'choice' }], records: [{ Price: 'not a number', Status: 'Open' }] });
  expect(await editor.executeCommand('setNoteDatabaseField', { nodeId: sid(), field: 'Price', kind: 'number' })).toBe(true);
  expect(db().records[0].Price).toBe('not a number');
  await editor.executeCommand('setNoteDatabaseView', { nodeId: sid(), where: 'Price', equals: 'not a number', sortBy: 'Price', groupBy: 'Price' });
  expect(await editor.executeCommand('setNoteDatabaseField', { nodeId: sid(), field: 'Price', name: 'Cost' })).toBe(true);
  expect(db()).toMatchObject({ where: 'Cost', sortBy: 'Cost', groupBy: 'Cost', records: [{ Cost: 'not a number' }] });
  expect(await editor.undo()).toBe(true); expect(db().fields[0].name).toBe('Price'); expect(db().where).toBe('Price');
  expect(await editor.executeCommand('setNoteDatabaseField', { nodeId: sid(), field: 'Active', kind: 'boolean' })).toBe(true);
  expect(db().records[0].Active).toBe(false);
  expect(await editor.executeCommand('setNoteDatabaseField', { nodeId: sid(), field: 'Price', remove: true })).toBe(true);
  expect(db().where).toBe(''); expect(db().records[0]).not.toHaveProperty('Price');
  expect(await editor.undo()).toBe(true); expect(db().records[0].Price).toBe('not a number');
});

it('persists table/board/filter/sort settings and edits the original sorted row', async () => {
  const { editor, sid, db } = setup();
  await editor.executeCommand('insertNoteDatabase', { fields: [{ name: 'Price', kind: 'number' }, { name: 'Status', kind: 'choice' }], records: [{ Price: 10, Status: 'Open' }, { Price: 2, Status: 'Open' }, { Price: 1, Status: 'Done' }] });
  expect(await editor.executeCommand('setNoteDatabaseView', { nodeId: sid(), view: 'board', where: 'Status', equals: 'Open', sortBy: 'Price', sortDir: 'asc', groupBy: 'Status' })).toBe(true);
  expect(noteDatabaseRows(db()).map(row => row.index)).toEqual([1, 0]);
  expect(await editor.executeCommand('setNoteDatabaseCell', { nodeId: sid(), row: noteDatabaseRows(db())[0].index, field: 'Price', value: '20' })).toBe(true);
  expect(db().records.map(row => row.Price)).toEqual([10, 20, 1]);
  expect(await editor.undo()).toBe(true); expect(db().records[1].Price).toBe(2);
  const reloaded = setup(editor.exportDocument()).db();
  expect(reloaded.view).toBe('board'); expect(noteDatabaseRows(reloaded).map(row => row.index)).toEqual([1, 0]);
});

it('inserts and removes typed rows with undo and permits an empty table', async () => {
  const { editor, sid, db } = setup();
  await editor.executeCommand('insertNoteDatabase', { fields: [{ name: 'N', kind: 'number' }], records: [] });
  expect(await editor.executeCommand('insertNoteDatabaseRow', { nodeId: sid(), values: { N: '12' } })).toBe(true);
  expect(db().records).toEqual([{ N: 12 }]);
  expect(await editor.executeCommand('removeNoteDatabaseRow', { nodeId: sid(), row: 0 })).toBe(true);
  expect(db().records).toEqual([]);
  expect(await editor.undo()).toBe(true); expect(db().records).toEqual([{ N: 12 }]);
});

it('refuses duplicate names, invalid references, destructive collisions and invalid cells without changes', async () => {
  const { editor, sid, db } = setup();
  await editor.executeCommand('insertNoteDatabase', { name: 'data', fields: ['A'], records: [{ A: 'keep', Hidden: 'also keep' }] });
  const saved = editor.exportDocument();
  for (const [command, payload] of [
    ['insertNoteDatabase', { name: 'data' }], ['setNoteDatabaseField', { nodeId: sid(), field: 'A', name: 'Hidden' }],
    ['setNoteDatabaseField', { nodeId: sid(), field: 'A', remove: true }], ['setNoteDatabaseView', { nodeId: sid(), groupBy: 'absent' }],
    ['setNoteDatabaseCell', { nodeId: sid(), row: 100, field: 'A', value: 'lost' }], ['setNoteDatabaseCell', { nodeId: sid(), row: 0, field: 'A', value: { blob: true } }],
    ['insertNoteDatabaseRow', { nodeId: sid(), values: { A: Infinity } }]
  ] as const) expect(await editor.executeCommand(command, payload)).toBe(false);
  expect(editor.exportDocument()).toEqual(saved); expect(db().records[0].A).toBe('keep');
});

it('refuses all database writes in a read-only editor', async () => {
  const { editor, sid } = setup();
  await editor.executeCommand('insertNoteDatabase');
  const before = editor.exportDocument();
  editor.setEditable(false);
  for (const [command, payload] of [
    ['insertNoteDatabase', {}], ['insertNoteDatabaseRow', { nodeId: sid() }],
    ['setNoteDatabaseCell', { nodeId: sid(), row: 0, field: '이름', value: 'changed' }],
    ['setNoteDatabaseField', { nodeId: sid(), field: '새 필드' }],
    ['removeNoteDatabaseRow', { nodeId: sid(), row: 0 }],
    ['setNoteDatabaseView', { nodeId: sid(), label: 'Changed', view: 'board' }]
  ] as const) {
    expect(editor.canExecuteCommand(command, payload)).toBe(false);
    expect(await editor.executeCommand(command, payload)).toBe(false);
  }
  expect(editor.exportDocument()).toEqual(before);
});

it('keeps prose insertions and end-position moves before database resources', async () => {
  const { createNoteElementCommands } = await import('../src/element-commands');
  const { editor, schema } = setup();
  createNoteElementCommands().onCreate?.(editor);
  await editor.executeCommand('insertNoteDatabase');
  editor.selectionManager.setSelection(null);
  expect(await editor.executeCommand('insertBodyText')).toBe(true);
  const root = editor.dataStore.getNode(editor.getRootId()!)!;
  const first = String(root.content![0]);
  expect(await editor.executeCommand('moveNoteBlockTo', { nodeId: first, at: 2 })).toBe(true);
  expect(editor.dataStore.getNode(String(root.content!.at(-1)))?.stype).toBe('resources');
  expect(validateTree(schema, editor.exportDocument())).toEqual([]);
});

it('duplicating a database owns a separate resource and undo removes both copies together', async () => {
  const { createNoteElementCommands } = await import('../src/element-commands');
  const { editor, sid, db } = setup();
  createNoteElementCommands().onCreate?.(editor);
  await editor.executeCommand('insertNoteDatabase', { fields: ['Name'], records: [{ Name: 'Original' }] });
  const original = sid(), before = editor.exportDocument();
  expect(await editor.executeCommand('duplicateNoteBlock', { nodeId: original })).toBe(true);
  const copiedId = editor.dataStore.getNode(editor.getRootId()!)!.content!.find(id => typeof id === 'string' && id !== original && editor.dataStore.getNode(id)?.stype === 'noteDatabase') as string;
  const copied = getNoteDatabase(editor, copiedId)!;
  expect(copied.source).not.toBe(db().source);
  expect(copied.records).toEqual(db().records);
  expect(await editor.executeCommand('setNoteDatabaseCell', { nodeId: copiedId, row: 0, field: 'Name', value: 'Copy only' })).toBe(true);
  expect(db().records).toEqual([{ Name: 'Original' }]);
  expect(await editor.undo()).toBe(true);
  expect(await editor.undo()).toBe(true);
  expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true);
  expect(getNoteDatabase(editor, copiedId)?.source).toBe(copied.source);
  expect(await editor.redo()).toBe(true);
  expect(getNoteDatabase(editor, copiedId)?.records).toEqual([{ Name: 'Copy only' }]);
  expect(db().records).toEqual([{ Name: 'Original' }]);
});


it('persists item prose by stable identity through row shifts, deletion, undo and reopen', async () => {
  const { editor, sid, db, schema } = setup();
  await editor.executeCommand('insertNoteDatabase', { fields: ['Name'], records: [{ Name: 'A' }, { Name: 'B' }] });
  const id = getNoteDatabaseItemId(editor, sid(), 1)!;
  const blocks = [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'B body', marks: [{ stype: 'bold', attrs: {}, range: [0, 6] }] }] }];
  expect(await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: sid(), itemId: id, blocks })).toBe(true);
  expect(getNoteDatabaseItemBody(editor, sid(), 1)).toEqual(blocks);
  await editor.executeCommand('insertNoteDatabaseRow', { nodeId: sid(), at: 0 });
  expect(getNoteDatabaseItemId(editor, sid(), 2)).toBe(id);
  expect(getNoteDatabaseItemBody(editor, sid(), 2)).toEqual(blocks);
  const saved = editor.exportDocument(), reopened = setup(saved);
  expect(getNoteDatabaseItemBody(reopened.editor, reopened.sid(), 2)).toEqual(blocks);
  expect(validateTree(schema, saved)).toEqual([]);
  await editor.executeCommand('removeNoteDatabaseRow', { nodeId: sid(), row: 2 });
  expect(db().rowIds).not.toContain(id);
  const deleted = editor.exportDocument();
  expect(await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: sid(), itemId: id, row: 0, blocks })).toBe(false);
  expect(editor.exportDocument()).toEqual(deleted);
  expect(await editor.undo()).toBe(true);
  expect(getNoteDatabaseItemId(editor, sid(), 2)).toBe(id);
  expect(getNoteDatabaseItemBody(editor, sid(), 2)).toEqual(blocks);
  expect(await editor.redo()).toBe(true);
  expect(db().rowIds).not.toContain(id);
});

it('copies item bodies independently and validates item writes including legacy and read-only documents', async () => {
  const { createNoteElementCommands } = await import('../src/element-commands');
  const { editor, sid } = setup({ stype: 'note', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] },
    { stype: 'noteDatabase', attributes: { source: 'legacy' } },
    { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'legacy', fields: ['Name'], records: [{ Name: 'A' }] } }] }
  ] });
  createNoteElementCommands().onCreate?.(editor);
  expect(getNoteDatabaseItemId(editor, sid(), 0)).toBeUndefined();
  expect(getNoteDatabaseItemBody(editor, sid(), 0)[0].stype).toBe('paragraph');
  expect(await editor.executeCommand('ensureNoteDatabaseItem', { nodeId: sid(), row: 0 })).toBe(true);
  const id = getNoteDatabaseItemId(editor, sid(), 0)!;
  const blocks = [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original body' }] }];
  await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: sid(), itemId: id, blocks });
  const before = editor.exportDocument(), original = sid();
  expect(await editor.executeCommand('duplicateNoteBlock', { nodeId: original })).toBe(true);
  const copied = editor.dataStore.getNode(editor.getRootId()!)!.content!.find(value => typeof value === 'string' && value !== original && editor.dataStore.getNode(value)?.stype === 'noteDatabase') as string;
  expect(getNoteDatabaseItemId(editor, copied, 0)).not.toBe(id);
  expect(getNoteDatabaseItemBody(editor, copied, 0)).toEqual(blocks);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true);
  expect(await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: copied, row: 0, blocks: [] })).toBe(true);
  expect(getNoteDatabaseItemBody(editor, original, 0)).toEqual(blocks);
  const current = editor.exportDocument();
  expect(await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: copied, row: 0, blocks: [{ stype: 'form' }] })).toBe(false);
  editor.setEditable(false);
  expect(await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: copied, row: 0, blocks })).toBe(false);
  expect(editor.exportDocument()).toEqual(current);
});


it('duplicates a row with independent nested prose resources and an atomic undo', async () => {
  const { editor, sid, db, schema } = setup();
  await editor.executeCommand('insertNoteDatabase', { fields: ['Name'], records: [{ Name: 'A' }] });
  const blocks = [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Body' }] },
    { stype: 'noteDatabase', attributes: { source: 'nested', view: 'table' } },
    { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'nested', fields: ['Inner'], records: [{ Inner: 'preserved' }] } }] }
  ];
  expect(await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: sid(), row: 0, blocks })).toBe(true);
  const before = editor.exportDocument();
  expect(await editor.executeCommand('duplicateNoteDatabaseRow', { nodeId: sid(), row: 0 })).toBe(true);
  expect(db().rowIds[0]).not.toBe(db().rowIds[1]);
  expect(getNoteDatabaseItemBody(editor, sid(), 1)).toEqual(blocks);
  expect(validateTree(schema, editor.exportDocument())).toEqual([]);
  expect(await editor.undo()).toBe(true); expect(editor.exportDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true);
  expect(await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: sid(), row: 1, blocks: [] })).toBe(true);
  expect(getNoteDatabaseItemBody(editor, sid(), 0)).toEqual(blocks);
});


it('saving and duplicating item prose keeps the parent selection and never applies it to the view', async () => {
  const { editor, sid } = setup();
  await editor.executeCommand('insertNoteDatabase');
  const text = [...editor.dataStore.getNodes().values()].find(node => node.text === 'Before')!;
  editor.setRange({ type: 'range', startNodeId: text.sid!, endNodeId: text.sid!, startOffset: 1, endOffset: 4, collapsed: false });
  const selection = structuredClone(editor.selection);
  const apply = vi.spyOn(editor, 'updateSelection');
  const blocks = [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hidden item body' }] }];
  expect(await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: sid(), row: 0, blocks })).toBe(true);
  expect(editor.selection).toEqual(selection); expect(apply).not.toHaveBeenCalled();
  expect(await editor.undo()).toBe(true); expect(editor.selection).toEqual(selection);
  expect(await editor.redo()).toBe(true); expect(editor.selection).toEqual(selection);
  apply.mockClear();
  expect(await editor.executeCommand('setNoteDatabaseItemBody', { nodeId: sid(), row: 0, blocks: [] })).toBe(true);
  expect(editor.selection).toEqual(selection); expect(apply).not.toHaveBeenCalled();
  expect(await editor.executeCommand('duplicateNoteDatabaseRow', { nodeId: sid(), row: 0 })).toBe(true);
  expect(editor.selection).toEqual(selection); expect(apply).not.toHaveBeenCalled();
  expect(await editor.undo()).toBe(true); expect(editor.selection).toEqual(selection);
  expect(await editor.undo()).toBe(true); expect(editor.selection).toEqual(selection);
  expect(getNoteDatabaseItemBody(editor, sid(), 0)).toEqual(blocks);
  apply.mockRestore();
});
