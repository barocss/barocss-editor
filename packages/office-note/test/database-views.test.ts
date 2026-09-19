import { expect, it, vi } from 'vitest';
import { setAttrs, transaction } from '@barocss/model';
import { readDatasetViews } from '@barocss/schema';
import { openNoteTree } from '../src/session';
import { getNoteDatabase, noteDatabaseRows } from '../src/database';
import { getNoteDatabaseViews } from '../src/database-views';

async function fixture() {
  const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [] }] });
  const editor = session.editor;
  await editor.executeCommand('insertNoteDatabase', { fields: [{ name: 'Name', kind: 'text' }, { name: 'Status', kind: 'choice', options: ['Open', 'Done'] }, { name: 'Cost', kind: 'number' }], records: [
    { Name: 'Build', Status: 'Open', Cost: 20 }, { Name: 'Review', Status: 'Done', Cost: 5 }
  ] });
  const nodeId = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'noteDatabase')!.sid!;
  const run = (command: string, payload: Record<string, unknown> = {}) => editor.executeCommand(command, { nodeId, ...payload });
  return { session, editor, nodeId, run, views: () => getNoteDatabaseViews(editor, nodeId), db: () => getNoteDatabase(editor, nodeId)! };
}

it('opens legacy scalar views without writing, and keeps named views independent through reload', async () => {
  const f = await fixture();
  try {
    const before = f.editor.exportDocument();
    expect(f.views()).toMatchObject({ activeId: 'default', views: [{ name: '테이블', view: 'table' }] });
    expect(f.editor.exportDocument()).toEqual(before);
    expect(await f.run('createNoteDatabaseView', { name: 'In progress', view: 'board' })).toBe(true);
    const board = f.views().activeId;
    await f.run('setNoteDatabaseView', { where: 'Status', equals: 'Open', sortBy: 'Cost', sortDir: 'desc', hiddenFields: ['Cost'] });
    expect(noteDatabaseRows(f.db()).map(row => row.record.Name)).toEqual(['Build']);
    await f.run('selectNoteDatabaseView', { viewId: 'default' });
    expect(f.db().view).toBe('table'); expect(noteDatabaseRows(f.db())).toHaveLength(2);
    expect(f.views().views.find(view => view.id === board)).toMatchObject({ where: 'Status', hiddenFields: ['Cost'] });
    const reloaded = openNoteTree(f.editor.exportDocument());
    try {
      const nodeId = [...reloaded.editor.dataStore.getNodes().values()].find(node => node.stype === 'noteDatabase')!.sid!;
      expect(getNoteDatabaseViews(reloaded.editor, nodeId)).toEqual(f.views());
      await reloaded.editor.executeCommand('selectNoteDatabaseView', { nodeId, viewId: board });
      expect(noteDatabaseRows(getNoteDatabase(reloaded.editor, nodeId)!).map(row => row.record.Name)).toEqual(['Build']);
    } finally { reloaded.close(); }
  } finally { f.session.close(); }
});

it('duplicates view preferences without copying records and removes/restores a view in one undo', async () => {
  const f = await fixture();
  try {
    const records = f.db().records;
    await f.run('setNoteDatabaseView', { where: 'Status', equals: 'Open' });
    await f.run('createNoteDatabaseView', { duplicateId: 'default' });
    const copyId = f.views().activeId;
    await f.run('renameNoteDatabaseView', { viewId: copyId, name: 'Completed' });
    await f.run('setNoteDatabaseView', { equals: 'Done' });
    expect(f.views().views[0].equals).toBe('Open');
    expect(f.db().records).toEqual(records);
    const previous = f.views();
    await f.run('removeNoteDatabaseView', { viewId: copyId });
    expect(f.views().activeId).toBe('default'); expect(f.views().views).toHaveLength(1);
    expect(await f.run('removeNoteDatabaseView', { viewId: 'default' })).toBe(false);
    await f.editor.undo(); expect(f.views()).toEqual(previous); expect(f.db().records).toEqual(records);
  } finally { f.session.close(); }
});

it('field rename and removal repair every saved view without losing its other preferences', async () => {
  const f = await fixture();
  try {
    await f.run('setNoteDatabaseView', { sortBy: 'Cost', hiddenFields: ['Cost'] });
    await f.run('createNoteDatabaseView', { duplicateId: 'default' });
    await f.run('setNoteDatabaseField', { field: 'Cost', name: 'Estimate' });
    expect(f.views().views.every(view => view.sortBy === 'Estimate' && view.hiddenFields.includes('Estimate'))).toBe(true);
    await f.run('setNoteDatabaseField', { field: 'Estimate', remove: true });
    expect(f.views().views.every(view => view.sortBy === '' && view.hiddenFields.length === 0)).toBe(true);
    await f.editor.undo();
    expect(f.views().views.every(view => view.sortBy === 'Estimate')).toBe(true);
  } finally { f.session.close(); }
});

it('rejects invalid settings and read-only writes while preserving the title entry point', async () => {
  const f = await fixture();
  try {
    expect(await f.run('setNoteDatabaseView', { hiddenFields: ['Name', 'Cost'] })).toBe(true);
    expect(f.views().views[0].hiddenFields).toEqual(['Cost']);
    for (const [command, payload] of [
      ['setNoteDatabaseView', { sortBy: 'missing' }], ['setNoteDatabaseView', { view: 'broken' }],
      ['setNoteDatabaseView', { hiddenFields: ['missing'] }], ['createNoteDatabaseView', { name: ' ' }],
      ['createNoteDatabaseView', { duplicateId: 'missing' }], ['selectNoteDatabaseView', { viewId: 'missing' }]
    ] as const) expect(await f.run(command, payload)).toBe(false);
    const before = f.editor.exportDocument();
    f.editor.setEditable(false);
    expect(await f.run('createNoteDatabaseView', { name: 'Private' })).toBe(false);
    expect(await f.run('renameNoteDatabaseView', { viewId: 'default', name: 'Changed' })).toBe(false);
    expect(await f.run('setNoteDatabaseView', { where: 'Status' })).toBe(false);
    expect(f.editor.exportDocument()).toEqual(before);
  } finally { f.session.close(); }
});


it('normalizes malformed saved profiles without mutating metadata and preserves a legacy scalar fallback', () => {
  const fields = [{ name: 'Name', kind: 'text' as const }, { name: 'Status', kind: 'choice' as const }];
  const attrs = { view: 'table', activeViewId: 'gone', views: [null, { id: ' ', view: 'board' },
    { id: 'board', name: '  업무  ', view: 'board', where: 'Status', equals: 'Open', sortBy: 'gone', groupBy: 'Status', hiddenFields: ['Name', 'Status', 'Status', 'gone'] },
    { id: 'board', name: 'duplicate', view: 'table' }] };
  const before = structuredClone(attrs);
  expect(readDatasetViews(attrs, fields)).toMatchObject({ activeId: 'board', views: [{ id: 'board', name: '업무', view: 'board', where: 'Status', equals: 'Open', sortBy: '', groupBy: 'Status', hiddenFields: ['Status'] }] });
  expect(readDatasetViews(attrs, fields).views).toHaveLength(1);
  expect(attrs).toEqual(before);
  expect(readDatasetViews({ view: 'board', where: 'Status', equals: 'Open', views: [false] }, fields)).toMatchObject({ activeId: 'default', views: [{ view: 'board', where: 'Status', equals: 'Open' }] });
});

it('uses the active saved profile consistently after import even when legacy scalar settings disagree', async () => {
  const f = await fixture();
  try {
    await transaction(f.editor, [setAttrs(f.nodeId, { view: 'table', where: '', activeViewId: 'gone', views: [{ id: 'board', name: '진행 중', view: 'board', where: 'Status', equals: 'Open', sortBy: 'Cost', sortDir: 'desc', groupBy: 'Status', hiddenFields: ['Cost'] }] } as never)]).commit();
    const before = f.editor.exportDocument();
    expect(f.views().activeId).toBe('board');
    expect(f.db()).toMatchObject({ view: 'board', where: 'Status', equals: 'Open', sortBy: 'Cost', sortDir: 'desc' });
    expect(noteDatabaseRows(f.db()).map(row => row.record.Name)).toEqual(['Build']);
    expect(f.editor.exportDocument()).toEqual(before);
    const reloaded = openNoteTree(before);
    try {
      const nodeId = [...reloaded.editor.dataStore.getNodes().values()].find(node => node.stype === 'noteDatabase')!.sid!;
      expect(getNoteDatabase(reloaded.editor, nodeId)?.view).toBe('board');
      expect(getNoteDatabaseViews(reloaded.editor, nodeId).activeId).toBe('board');
    } finally { reloaded.close(); }
  } finally { f.session.close(); }
});

it('keeps the existing dataset label command and combines label plus view changes in one undo', async () => {
  const f = await fixture();
  try {
    const previous = { label: f.db().label, state: f.views(), records: f.db().records };
    expect(await f.run('setNoteDatabaseView', { label: '출시 작업' })).toBe(true);
    expect(f.db().label).toBe('출시 작업');
    expect(f.views()).toEqual(previous.state);
    await f.editor.undo(); expect(f.db().label).toBe(previous.label);
    expect(await f.run('setNoteDatabaseView', { label: '진행 중 작업', view: 'board', where: 'Status', equals: 'Open' })).toBe(true);
    expect(f.db()).toMatchObject({ label: '진행 중 작업', view: 'board' });
    expect(f.db().records).toEqual(previous.records);
    await f.editor.undo();
    expect(f.db().label).toBe(previous.label); expect(f.views()).toEqual(previous.state);
    await f.editor.redo(); expect(f.db()).toMatchObject({ label: '진행 중 작업', view: 'board' });
    const before = f.editor.exportDocument();
    expect(await f.run('setNoteDatabaseView', { label: 42, view: 'table' })).toBe(false);
    expect(await f.run('setNoteDatabaseView', { label: ' ' })).toBe(false);
    expect(f.editor.exportDocument()).toEqual(before);
  } finally { f.session.close(); }
});

it('does not mint IDs or mutate history when inspecting whether a view can be created', async () => {
  const f = await fixture();
  const random = vi.spyOn(crypto, 'randomUUID');
  try {
    const before = f.editor.exportDocument();
    for (let index = 0; index < 4; index++) expect(f.editor.canExecuteCommand('createNoteDatabaseView', { nodeId: f.nodeId, name: '보드' })).toBe(true);
    expect(random).not.toHaveBeenCalled(); expect(f.editor.exportDocument()).toEqual(before);
    expect(await f.run('createNoteDatabaseView', { name: '보드' })).toBe(true);
    expect(random).toHaveBeenCalledOnce();
  } finally { random.mockRestore(); f.session.close(); }
});

it('serializes pending view changes so concurrent creations cannot overwrite one another', async () => {
  const f = await fixture();
  try {
    expect(await Promise.all([f.run('createNoteDatabaseView', { name: 'A' }), f.run('createNoteDatabaseView', { name: 'B' })])).toEqual([true, true]);
    expect(f.views().views.map(view => view.name)).toEqual(['테이블', 'A', 'B']);
    await f.editor.undo(); expect(f.views().views.map(view => view.name)).toEqual(['테이블', 'A']);
    await f.editor.redo(); expect(f.views().views.map(view => view.name)).toEqual(['테이블', 'A', 'B']);
  } finally { f.session.close(); }
});

it('persists gallery/calendar and compound queries, repairs renamed fields and restores undo', async () => {
  const f = await fixture();
  try {
    const records = structuredClone(f.db().records);
    expect(await f.run('createNoteDatabaseView', { view: 'gallery', name: 'Cards' })).toBe(true);
    expect(await f.run('setNoteDatabaseView', { cardSize: 'large', cardPreview: 'none', filters: { mode: 'and', rules: [{ id: 'cost', field: 'Cost', operator: 'gte', value: 10 }] }, sorts: [{ field: 'Cost', direction: 'desc' }, { field: 'Name', direction: 'asc' }] })).toBe(true);
    expect(f.db()).toMatchObject({ view: 'gallery', cardSize: 'large', cardPreview: 'none' });
    expect(noteDatabaseRows(f.db()).map(row => row.index)).toEqual([0]);
    expect(await f.run('setNoteDatabaseField', { field: 'Cost', name: 'Price' })).toBe(true);
    expect(f.db().filters?.rules[0]).toMatchObject({ field: 'Price' });
    expect(f.db().sorts?.[0].field).toBe('Price');
    expect(await f.editor.undo()).toBe(true);
    expect(f.db().filters?.rules[0]).toMatchObject({ field: 'Cost' });
    expect(f.db().records).toEqual(records);
    const beforeRemoval = f.editor.exportDocument();
    expect(await f.run('setNoteDatabaseField', { field: 'Cost', remove: true })).toBe(true);
    expect(f.db().filters?.rules).toEqual([]);
    expect(f.db().sorts).toEqual([{ field: 'Name', direction: 'asc' }]);
    expect(await f.editor.undo()).toBe(true);
    expect(f.editor.exportDocument()).toEqual(beforeRemoval);
    expect(await f.run('setNoteDatabaseView', { filters: { mode: 'and', rules: [] }, sorts: [] })).toBe(true);
    expect(noteDatabaseRows(f.db()).map(row => row.index)).toEqual([0, 1]);
    expect(await f.run('createNoteDatabaseView', { view: 'calendar' })).toBe(true);
    expect(f.db().view).toBe('calendar');
    const saved = f.editor.exportDocument(), loaded = openNoteTree(saved);
    try { expect(getNoteDatabase(loaded.editor, f.nodeId)?.view).toBe('calendar'); } finally { loaded.close(); }
    expect(await f.run('setNoteDatabaseView', { sorts: [{ field: 'missing', direction: 'asc' }] })).toBe(false);
    expect(await f.run('setNoteDatabaseView', { filters: { mode: 'and', rules: [{ id: 'bad', field: 'Cost', operator: 'gt', value: 'bad' }] } })).toBe(false);
  } finally { f.session.close(); }
});
