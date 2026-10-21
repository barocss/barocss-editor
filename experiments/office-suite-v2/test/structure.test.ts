import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCellKey } from '../src/contracts.ts';
import type { WorkbookCommand, WorkbookEvent, CellInput, WorkbookProjection } from '../src/contracts.ts';
import { createWorkbookContext, createEvent, projectWorkbook, diffWorkbook } from '../src/workbook.ts';

const context = createWorkbookContext({ documentId: 'doc', workbookId: 'book', generation: 'g1' });
const key = { sheetId: 'sheet', rowId: 'row', columnId: 'col' };
const value = (n: number): CellInput => ({ kind: 'literal', value: n });
const ref: CellInput = { kind: 'formula', version: 1, context: key, ast: { kind: 'reference', reference: { ...key, absRow: true, absColumn: true, sheetQualified: true } } };
function event(eventId: string, command: WorkbookCommand, dependencies: readonly string[], sessionId = 'A'): WorkbookEvent {
  return createEvent(context, { eventId, actorId: 'actor-' + sessionId, sessionId }, dependencies, command);
}
function bootstrap(): WorkbookEvent[] {
  return [
    event('b0', { kind: 'sheet.insert', sheetId: 'sheet', name: 'Sheet', afterSheetId: null }, []),
    event('b1', { kind: 'axis.insert', sheetId: 'sheet', axis: 'column', id: 'col', afterId: null }, ['b0']),
    event('b2', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'row', afterId: null }, ['b1']),
    event('b3', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'last', afterId: 'row' }, ['b2']),
  ];
}
function permutations(items: WorkbookEvent[]): WorkbookEvent[][] {
  if (items.length < 2) return [items];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [item, ...rest]));
}
function liveRows(p: WorkbookProjection): string[] {
  return p.sheets[0]?.rows.filter(row => !row.deleted).map(row => row.id) ?? [];
}

test('concurrent insert/delete ordering converges for every independent-event permutation', () => {
  const a = event('insert-a', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'new-a', afterId: 'row' }, ['b3']);
  const z = event('insert-z', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'new-z', afterId: 'row' }, ['b3'], 'B');
  const child = event('child', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'child', afterId: 'new-a' }, ['insert-a']);
  const del = event('delete', { kind: 'axis.delete', sheetId: 'sheet', axis: 'row', id: 'row' }, ['b3'], 'B');
  const expected = projectWorkbook(context, [...bootstrap(), a, z, child, del]);
  for (const independent of permutations([a, z, child, del])) {
    const p = projectWorkbook(context, [...independent, ...bootstrap().reverse()]);
    assert.deepEqual(p, expected);
    assert.equal(new Set(p.sheets[0]?.rows.map(row => row.id)).size, p.sheets[0]?.rows.length);
  }
  assert.deepEqual(liveRows(expected), ['new-a', 'child', 'new-z', 'last']);
  assert.equal(expected.sheets[0]?.rows[0]?.deleted, true);
});
test('causally later interior insertion precedes observed sibling subtree', () => {
  const third = event('b4', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'third', afterId: 'last' }, ['b3']);
  const insert = event('z-new', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'interior', afterId: 'row' }, ['b4']);
  assert.deepEqual(liveRows(projectWorkbook(context, [...bootstrap(), third, insert])), ['row', 'interior', 'last', 'third']);
  const another = event('a-newer', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'newest', afterId: 'row' }, ['z-new']);
  assert.deepEqual(liveRows(projectWorkbook(context, [...bootstrap(), third, insert, another])), ['row', 'newest', 'interior', 'last', 'third']);
});
test('reverse-causal DAG avoids non-transitive mixed-comparator ordering', () => {
  const a = event('a', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'A', afterId: 'row' }, ['b3']);
  const b = event('z', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'B', afterId: 'row' }, ['a']);
  const c = event('m', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'C', afterId: 'row' }, ['b3'], 'B');
  for (const inputs of permutations([a, b, c])) {
    assert.deepEqual(liveRows(projectWorkbook(context, [...inputs, ...bootstrap().reverse()])), ['row', 'C', 'B', 'A', 'last']);
  }
});
test('column insert/delete is independent and deterministic', () => {
  const a = event('a', { kind: 'axis.insert', sheetId: 'sheet', axis: 'column', id: 'c-a', afterId: 'col' }, ['b3']);
  const b = event('b', { kind: 'axis.insert', sheetId: 'sheet', axis: 'column', id: 'c-b', afterId: 'col' }, ['b3'], 'B');
  const d = event('d', { kind: 'axis.delete', sheetId: 'sheet', axis: 'column', id: 'col' }, ['b3']);
  assert.deepEqual(projectWorkbook(context, [...bootstrap(), a, b, d]), projectWorkbook(context, [d, b, a, ...bootstrap()]));
  assert.deepEqual(projectWorkbook(context, [...bootstrap(), a, b, d]).sheets[0]?.columns.map(col => [col.id, col.deleted]), [['col', true], ['c-a', false], ['c-b', false]]);
});
test('deleted IDs never reuse, and undeclared causal targets refuse', () => {
  const del = event('del', { kind: 'axis.delete', sheetId: 'sheet', axis: 'row', id: 'row' }, ['b3']);
  const reuse = event('reuse', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'row', afterId: null }, ['del']);
  const blind = event('blind', { kind: 'cell.commit', key, input: value(1) }, []);
  const p = projectWorkbook(context, [...bootstrap(), del, reuse, blind]);
  assert.deepEqual(p.outcomes.reuse, { status: 'refused', code: 'DUPLICATE_ID', recoverable: false });
  assert.deepEqual(p.outcomes.blind, { status: 'refused', code: 'CAUSAL_TARGET', recoverable: false });
});
test('concurrent delete versus formula retains atomic input under tombstone', () => {
  const formula = event('formula', { kind: 'cell.commit', key, input: ref }, ['b3'], 'B');
  const del = event('del', { kind: 'axis.delete', sheetId: 'sheet', axis: 'row', id: 'row' }, ['b3']);
  const before = projectWorkbook(context, [...bootstrap(), formula]);
  const after = projectWorkbook(context, [...bootstrap(), formula, del]);
  assert.equal(after.cells[encodeCellKey(key)]?.deleted, true);
  assert.deepEqual(after.cells[encodeCellKey(key)]?.winner?.input, ref);
  assert.deepEqual(diffWorkbook(before, after).changedCellKeys, [key]);
  assert.deepEqual(diffWorkbook(before, after).changedStructureSheetIds, ['sheet']);
});
test('known deleted target refuses edit and anchor insert; concurrent edit survives restoration', () => {
  const del = event('del', { kind: 'axis.delete', sheetId: 'sheet', axis: 'row', id: 'row' }, ['b3']);
  const remote = event('remote', { kind: 'cell.commit', key, input: value(9) }, ['b3'], 'B');
  const late = event('late', { kind: 'cell.commit', key, input: value(8) }, ['del'], 'B');
  const anchor = event('anchor', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'new', afterId: 'row' }, ['del']);
  const restore = event('restore', { kind: 'undo', targetEventId: 'del' }, ['del', 'remote', 'late', 'anchor']);
  const p = projectWorkbook(context, [...bootstrap(), del, remote, late, anchor, restore]);
  assert.equal(p.cells[encodeCellKey(key)]?.deleted, false);
  assert.deepEqual(p.cells[encodeCellKey(key)]?.winner?.input, value(9));
  assert.deepEqual(p.outcomes.late, { status: 'refused', code: 'DELETED_TARGET', recoverable: true });
  assert.deepEqual(p.outcomes.anchor, { status: 'refused', code: 'DELETED_TARGET', recoverable: true });
});
test('independent deletion markers require both own-session undos for same-ID restore', () => {
  const a = event('da', { kind: 'axis.delete', sheetId: 'sheet', axis: 'row', id: 'row' }, ['b3']);
  const b = event('db', { kind: 'axis.delete', sheetId: 'sheet', axis: 'row', id: 'row' }, ['b3'], 'B');
  const ua = event('ua', { kind: 'undo', targetEventId: 'da' }, ['da', 'db']);
  const ub = event('ub', { kind: 'undo', targetEventId: 'db' }, ['ua'], 'B');
  const middle = projectWorkbook(context, [...bootstrap(), a, b, ua]);
  const restored = projectWorkbook(context, [...bootstrap(), a, b, ua, ub]);
  assert.deepEqual(middle.sheets[0]?.rows[0]?.deletedBy, ['db']);
  assert.equal(restored.sheets[0]?.rows[0]?.id, 'row');
  assert.equal(restored.sheets[0]?.rows[0]?.deleted, false);
  assert.deepEqual(diffWorkbook(middle, restored).changedStructureSheetIds, ['sheet']);
});
test('A inserts row, B edits, A undo safely refuses and preserves remote data', () => {
  const insert = event('insert', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'new', afterId: 'row' }, ['b3']);
  const newKey = { ...key, rowId: 'new' };
  const remote = event('remote', { kind: 'cell.commit', key: newKey, input: value(42) }, ['insert'], 'B');
  const undo = event('undo', { kind: 'undo', targetEventId: 'insert' }, ['remote']);
  const p = projectWorkbook(context, [...bootstrap(), insert, remote, undo]);
  assert.deepEqual(p.outcomes.undo, { status: 'refused', code: 'UNDO_CONFLICT', recoverable: true });
  assert.equal(p.cells[encodeCellKey(newKey)]?.deleted, false);
  assert.deepEqual(p.cells[encodeCellKey(newKey)]?.winner?.input, value(42));
});
test('concurrent remote edit blocks insertion undo independent of lexical scheduling', () => {
  const insert = event('insert', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'new', afterId: 'row' }, ['b3']);
  const undo = event('a-undo', { kind: 'undo', targetEventId: 'insert' }, ['insert']);
  const remote = event('z-remote', { kind: 'cell.commit', key: { ...key, rowId: 'new' }, input: value(42) }, ['insert'], 'B');
  const p = projectWorkbook(context, [...bootstrap(), insert, undo, remote]);
  assert.deepEqual(p.outcomes['a-undo'], { status: 'refused', code: 'UNDO_CONFLICT', recoverable: true });
  assert.equal(p.outcomes['z-remote']?.status, 'applied');
  assert.deepEqual(p, projectWorkbook(context, [remote, undo, insert, ...bootstrap().reverse()]));
});
test('edit causally after successful insertion undo refuses without reviving row', () => {
  const insert = event('insert', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'new', afterId: 'row' }, ['b3']);
  const undo = event('undo', { kind: 'undo', targetEventId: 'insert' }, ['insert']);
  const remote = event('remote', { kind: 'cell.commit', key: { ...key, rowId: 'new' }, input: value(99) }, ['undo'], 'B');
  const p = projectWorkbook(context, [...bootstrap(), insert, undo, remote]);
  assert.equal(p.outcomes.undo?.status, 'applied');
  assert.deepEqual(p.outcomes.remote, { status: 'refused', code: 'DELETED_TARGET', recoverable: true });
  assert.equal(p.sheets[0]?.rows.find(row => row.id === 'new')?.deleted, true);
  assert.equal(Object.keys(p.cells).length, 0);
});
test('refused or pending foreign payload cannot block insertion undo', () => {
  const insert = event('insert', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'new', afterId: 'row' }, ['b3']);
  const undo = event('a-undo', { kind: 'undo', targetEventId: 'insert' }, ['insert']);
  const bad = event('z-bad', { kind: 'cells.commit', changes: [{ key: { ...key, rowId: 'new' }, input: value(1) }, { key: { ...key, rowId: 'missing' }, input: value(2) }] }, ['insert'], 'B');
  const pending = event('pending', { kind: 'cell.commit', key: { ...key, rowId: 'new' }, input: value(3) }, ['missing-dependency'], 'B');
  const p = projectWorkbook(context, [...bootstrap(), insert, undo, bad, pending]);
  assert.equal(p.outcomes['a-undo']?.status, 'applied');
  assert.equal(p.outcomes['z-bad']?.status, 'refused');
  assert.equal(p.outcomes.pending?.status, 'pending');
  assert.equal(p.sheets[0]?.rows.find(row => row.id === 'new')?.deleted, true);
});
test('foreign formula reference or anchored structural contribution protects identity', () => {
  const remoteFormula = event('formula', { kind: 'cell.commit', key: { ...key, rowId: 'last' }, input: ref }, ['b3'], 'B');
  const undo = event('undo', { kind: 'undo', targetEventId: 'b2' }, ['formula']);
  const p = projectWorkbook(context, [...bootstrap(), remoteFormula, undo]);
  assert.deepEqual(p.outcomes.undo, { status: 'refused', code: 'UNDO_CONFLICT', recoverable: true });
  const child = event('child', { kind: 'axis.insert', sheetId: 'sheet', axis: 'row', id: 'child', afterId: 'row' }, ['b3'], 'B');
  const u2 = event('undo', { kind: 'undo', targetEventId: 'b2' }, ['child']);
  assert.equal(projectWorkbook(context, [...bootstrap(), child, u2]).outcomes.undo?.status, 'refused');
});
test('general moves/merges explicitly refuse; undo is not redo or snapshot restore', () => {
  const unsupported = ['row.move', 'column.move', 'merge'] as const;
  for (const operation of unsupported) {
    const move = event('move', { kind: 'unsupported', operation }, ['b3']);
    const u = event('u', { kind: 'undo', targetEventId: 'move' }, ['move']);
    const p = projectWorkbook(context, [...bootstrap(), move, u]);
    assert.deepEqual(p.outcomes.move, { status: 'refused', code: 'UNSUPPORTED', recoverable: false });
    assert.equal(p.outcomes.u?.status, 'refused');
    assert.deepEqual(liveRows(p), ['row', 'last']);
  }
});
