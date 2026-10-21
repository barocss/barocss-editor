import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbookContext, createEvent, projectWorkbook, diffWorkbook } from '../src/workbook.ts';
import type { CellChange, CellInput, CellKey, WorkbookCommand, WorkbookEvent } from '../src/contracts.ts';
import { parseFormula } from '../src/formula.ts';
import { ReferenceIndex } from '../src/references.ts';
import { CalculationEngine } from '../src/calculation.ts';

function fixture(rows = 8, columns = 8) {
  const context = createWorkbookContext({ documentId: 'calculation', workbookId: 'book', generation: '1' });
  const events: WorkbookEvent[] = [];
  const add = (command: WorkbookCommand): WorkbookEvent => {
    const n = events.length;
    const event = createEvent(context, { eventId: `e${String(n).padStart(6, '0')}`, actorId: 'a', sessionId: 's' }, n ? [events[n - 1]!.eventId] : [], command);
    events.push(event); return event;
  };
  add({ kind: 'sheet.insert', sheetId: 's1', name: 'Main', afterSheetId: null });
  for (const axis of ['row', 'column'] as const) for (let i = 1; i <= (axis === 'row' ? rows : columns); i++) add({ kind: 'axis.insert', sheetId: 's1', axis, id: `${axis}${i}`, afterId: i === 1 ? null : `${axis}${i - 1}` });
  const project = () => projectWorkbook(context, events);
  const key = (row = 1, column = 1): CellKey => ({ sheetId: 's1', rowId: `row${row}`, columnId: `column${column}` });
  const put = (key: CellKey, value: number | string | boolean | null): void => {
    const input: CellInput = typeof value === 'string' && value.startsWith('=') ? parseFormula(value, key, new ReferenceIndex(project())) : { kind: 'literal', value };
    add({ kind: 'cell.commit', key, input });
  };
  return { add, project, key, put };
}
function value(engine: CalculationEngine, key: CellKey) {
  const result = engine.read(key); assert.equal(result.status, 'fresh');
  return result.status === 'fresh' ? result.value : undefined;
}

test('SUM distinguishes range/reference values from direct scalar coercion, propagates errors', () => {
  const f = fixture();
  f.put(f.key(), 3); f.put(f.key(2), true); f.put(f.key(3), 'text'); f.put(f.key(4), null); f.put(f.key(1, 2), '=SUM(A1:A4,TRUE,2)');
  let engine = new CalculationEngine(f.project()); engine.recalculate(); assert.equal(value(engine, f.key(1, 2)), 6);
  f.put(f.key(3), '=1/0'); engine = new CalculationEngine(f.project()); engine.recalculate();
  assert.deepEqual(value(engine, f.key(1, 2)), { kind: 'error', code: '#DIV/0!' });
});

test('dirty closure recalculates dependents only; changed formula detaches old edges', () => {
  const f = fixture(); f.put(f.key(), 2); f.put(f.key(1, 2), '=A1+1'); f.put(f.key(1, 3), '=B1*2'); f.put(f.key(1, 4), '=7+8');
  let before = f.project(); const engine = new CalculationEngine(before); engine.recalculate();
  assert.equal(engine.stats.initialCellVisits, 4); assert.equal(engine.stats.evaluatedFormulas, 3);
  const oldToken = engine.token;
  assert.equal(engine.accepts(JSON.parse(JSON.stringify(oldToken)) as typeof oldToken), true);
  f.put(f.key(), 4); let after = f.project(); engine.update(after, diffWorkbook(before, after), oldToken);
  assert.equal(engine.read(f.key(1, 2)).status, 'uncalculated'); assert.equal(engine.read(f.key(1, 4)).status, 'fresh');
  assert.equal(engine.read(f.key(1, 3), oldToken).status, 'stale'); assert.equal(engine.accepts(oldToken), false);
  assert.throws(() => engine.recalculate(oldToken), /Stale/);
  engine.recalculate(); assert.equal(value(engine, f.key(1, 3)), 10); assert.equal(engine.stats.evaluatedFormulas, 5);
  assert.equal(engine.stats.changedCellVisits, 1);
  before = after; f.put(f.key(1, 2), '=9'); after = f.project(); engine.update(after, diffWorkbook(before, after), engine.token); engine.recalculate();
  const count = engine.stats.evaluatedFormulas;
  before = after; f.put(f.key(), 100); after = f.project(); engine.update(after, diffWorkbook(before, after), engine.token); engine.recalculate();
  assert.equal(engine.stats.evaluatedFormulas, count); assert.equal(value(engine, f.key(1, 3)), 18);
  assert.throws(() => engine.update(after, diffWorkbook(before, after), oldToken), /Stale/);
});

test('actual evaluation detects self/mutual/downstream cycles while IF stays lazy', () => {
  const f = fixture(); f.put(f.key(), '=B1'); f.put(f.key(1, 2), '=A1'); f.put(f.key(1, 3), '=A1+2'); f.put(f.key(1, 4), '=IF(FALSE,D1,7)');
  const engine = new CalculationEngine(f.project()); engine.recalculate();
  for (const column of [1, 2, 3]) assert.deepEqual(value(engine, f.key(1, column)), { kind: 'error', code: '#CYCLE!' });
  assert.equal(value(engine, f.key(1, 4)), 7);
});

test('structure changes rebuild range dependencies and deletion/undo clears stale values', () => {
  const f = fixture(); f.put(f.key(), 1); f.put(f.key(2), 2); f.put(f.key(3), 3); f.put(f.key(8, 8), '=SUM(A1:A3)');
  let before = f.project(); const engine = new CalculationEngine(before); engine.recalculate();
  f.add({ kind: 'axis.insert', sheetId: 's1', axis: 'row', id: 'inside', afterId: 'row1' });
  f.put({ sheetId: 's1', rowId: 'inside', columnId: 'column1' }, 10);
  let after = f.project(); engine.update(after, diffWorkbook(before, after), engine.token); engine.recalculate();
  assert.equal(value(engine, f.key(8, 8)), 16);
  before = after; const deletion = f.add({ kind: 'axis.delete', sheetId: 's1', axis: 'row', id: 'row3' }); after = f.project();
  engine.update(after, diffWorkbook(before, after), engine.token); engine.recalculate();
  assert.deepEqual(value(engine, f.key(8, 8)), { kind: 'error', code: '#REF!' });
  before = after; f.add({ kind: 'undo', targetEventId: deletion.eventId }); after = f.project();
  engine.update(after, diffWorkbook(before, after), engine.token); engine.recalculate();
  assert.equal(value(engine, f.key(8, 8)), 16);
});

test('iterative formula scheduling handles a 2000-cell chain and isolates dirty edits', t => {
  const f = fixture(50, 40);
  const keys = Array.from({ length: 2000 }, (_, i) => f.key(Math.floor(i / 40) + 1, i % 40 + 1));
  const changes: CellChange[] = keys.map((key, i) => ({ key, input: i === keys.length - 1 ? { kind: 'literal', value: 1 } : {
    kind: 'formula', version: 1, context: key, ast: { kind: 'binary', operator: '+', left: { kind: 'reference', reference: { ...keys[i + 1]!, absRow: false, absColumn: false, sheetQualified: false } }, right: { kind: 'number', value: 1 } },
  } }));
  for (let i = 0; i < changes.length; i += 500) f.add({ kind: 'cells.commit', changes: changes.slice(i, i + 500) });
  const before = f.project(); const started = performance.now(); const engine = new CalculationEngine(before);
  const registered = performance.now(); engine.recalculate(); const calculated = performance.now();
  assert.equal(value(engine, keys[0]!), 2000); assert.equal(engine.stats.initialCellVisits, 2000);
  assert.equal(engine.stats.evaluatedFormulas, 1999); assert.equal(engine.stats.dependencyEdges, 1999);
  f.put(keys[0]!, 7); const after = f.project();
  const dirtyStarted = performance.now();
  engine.update(after, diffWorkbook(before, after), engine.token); engine.recalculate();
  const dirtyFinished = performance.now();
  assert.equal(value(engine, keys[0]!), 7); assert.equal(engine.stats.changedCellVisits, 1);
  assert.equal(engine.stats.evaluatedFormulas, 1999);
  t.diagnostic(JSON.stringify({ profile: 'controlled-2000-cell-chain', rows: 50, columns: 40, populated: 2000, formulas: 1999,
    initialRegisterMs: registered - started, initialRecalculationMs: calculated - registered,
    dirtyDiffUpdateRecalculationMs: dirtyFinished - dirtyStarted, dirtyEvaluatedFormulas: 0,
    initialCellVisits: engine.stats.initialCellVisits, changedCellVisits: engine.stats.changedCellVisits }));
});
