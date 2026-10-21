import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbookContext, createEvent, projectWorkbook } from '../src/workbook.ts';
import { encodeCellKey } from '../src/contracts.ts';
import type { CellInput, CellKey, WorkbookCommand, WorkbookEvent } from '../src/contracts.ts';
import { parseFormula, displayFormula } from '../src/formula.ts';
import { ReferenceIndex, transformCells } from '../src/references.ts';
import { CalculationEngine } from '../src/calculation.ts';

function fixture() {
  const context = createWorkbookContext({ documentId: 'reference', workbookId: 'book', generation: '1' });
  const events: WorkbookEvent[] = [];
  const add = (command: WorkbookCommand): WorkbookEvent => {
    const n = events.length;
    const event = createEvent(context, { eventId: `e${String(n).padStart(4, '0')}`, actorId: 'a', sessionId: 's' }, n ? [events[n - 1]!.eventId] : [], command);
    events.push(event); return event;
  };
  for (const sheetId of ['s1', 's2']) {
    add({ kind: 'sheet.insert', sheetId, name: sheetId, afterSheetId: sheetId === 's1' ? null : 's1' });
    for (const axis of ['row', 'column'] as const) for (let i = 1; i <= 6; i++) add({ kind: 'axis.insert', sheetId, axis, id: `${axis}${i}`, afterId: i === 1 ? null : `${axis}${i - 1}` });
  }
  const project = () => projectWorkbook(context, events);
  const key = (row = 1, column = 1, sheetId = 's1'): CellKey => ({ sheetId, rowId: `row${row}`, columnId: `column${column}` });
  const put = (key: CellKey, value: string | number | boolean | null): void => {
    const input: CellInput = typeof value === 'string' && value.startsWith('=') ? parseFormula(value, key, new ReferenceIndex(project())) : { kind: 'literal', value };
    add({ kind: 'cell.commit', key, input });
  };
  const text = (key: CellKey): string => {
    const p = project(); const input = p.cells[encodeCellKey(key)]?.winner?.input;
    assert.equal(input?.kind, 'formula');
    return input?.kind === 'formula' ? displayFormula(input.ast, new ReferenceIndex(p)) : '';
  };
  const value = (key: CellKey) => {
    const engine = new CalculationEngine(project()); engine.recalculate();
    const result = engine.read(key); return result.status === 'fresh' ? result.value : result.status;
  };
  return { add, project, key, put, text, value };
}

test('copy/fill displaces only relative axes and distinguishes qualified cross-sheet refs', () => {
  const f = fixture(); const from = f.key(2, 2); const to = f.key(3, 3);
  f.put(from, '=A1+$A$1+A$1+$A1');
  f.add({ kind: 'cells.commit', changes: transformCells({ kind: 'copy', snapshot: f.project(), mapping: [{ from, to }] }) });
  assert.equal(f.text(to), '=(((B2+$A$1)+B$1)+$A2)');
  f.put(from, '=A1+s1!$A$1');
  const other = f.key(3, 3, 's2');
  f.add({ kind: 'cells.commit', changes: transformCells({ kind: 'copy', snapshot: f.project(), mapping: [{ from, to: other }] }) });
  assert.equal(f.text(other), "=(B2+'s1'!$A$1)");
  f.put(f.key(), 5); f.put(f.key(1, 1, 's2'), 9);
  assert.equal(f.value(from), 10);
  assert.equal(f.value(other), 5); // B2 on s2 is blank, qualified target remains s1 A1.
});

test('stable reference follows insertion; deletion/explicit same-ID undo differs from fresh ID', () => {
  const f = fixture(); const formula = f.key(1, 6);
  f.put(f.key(2), 12); f.put(formula, '=$A$2');
  f.add({ kind: 'axis.insert', sheetId: 's1', axis: 'row', id: 'newRow', afterId: 'row1' });
  assert.equal(f.text(formula), '=$A$3'); assert.equal(f.value(formula), 12);
  const deletion = f.add({ kind: 'axis.delete', sheetId: 's1', axis: 'row', id: 'row2' });
  assert.equal(f.text(formula), '=#REF!'); assert.deepEqual(f.value(formula), { kind: 'error', code: '#REF!' });
  f.add({ kind: 'axis.insert', sheetId: 's1', axis: 'row', id: 'replacement', afterId: 'row1' });
  assert.deepEqual(f.value(formula), { kind: 'error', code: '#REF!' });
  f.add({ kind: 'undo', targetEventId: deletion.eventId });
  assert.equal(f.value(formula), 12);
});

test('range interior insert joins, outside insert stays outside, deleted endpoint errors', () => {
  const f = fixture(); const formula = f.key(6, 6);
  f.put(f.key(), 1); f.put(f.key(2), 2); f.put(f.key(3), 3); f.put(formula, '=SUM(A1:A3)');
  f.add({ kind: 'axis.insert', sheetId: 's1', axis: 'row', id: 'inside', afterId: 'row1' });
  f.put({ sheetId: 's1', rowId: 'inside', columnId: 'column1' }, 10);
  assert.equal(f.value(formula), 16);
  f.add({ kind: 'axis.insert', sheetId: 's1', axis: 'row', id: 'before', afterId: null });
  f.put({ sheetId: 's1', rowId: 'before', columnId: 'column1' }, 100);
  f.add({ kind: 'axis.insert', sheetId: 's1', axis: 'row', id: 'after', afterId: 'row3' });
  f.put({ sheetId: 's1', rowId: 'after', columnId: 'column1' }, 200);
  assert.equal(f.value(formula), 16);
  f.add({ kind: 'axis.delete', sheetId: 's1', axis: 'row', id: 'row3' });
  assert.deepEqual(f.value(formula), { kind: 'error', code: '#REF!' });
});

test('column identities and range boundaries obey the same structural policy', () => {
  const f = fixture(); const formula = f.key(6, 6);
  f.put(f.key(), 1); f.put(f.key(1, 2), 2); f.put(formula, '=SUM(A1:B1)');
  f.add({ kind: 'axis.insert', sheetId: 's1', axis: 'column', id: 'inside', afterId: 'column1' });
  f.put({ sheetId: 's1', rowId: 'row1', columnId: 'inside' }, 10);
  assert.equal(f.value(formula), 13);
  assert.equal(f.text(formula), '=SUM(A1:C1)');
});

test('overlapping cut reads snapshot, external absolute refs follow moved content', () => {
  const f = fixture(); f.put(f.key(), 10); f.put(f.key(2), 20); f.put(f.key(1, 4), '=$A$1+A2');
  const changes = transformCells({ kind: 'cut', snapshot: f.project(), mapping: [
    { from: f.key(), to: f.key(2) }, { from: f.key(2), to: f.key(3) },
  ] });
  f.add({ kind: 'cells.commit', changes });
  assert.equal(f.value(f.key()), null); assert.equal(f.value(f.key(2)), 10); assert.equal(f.value(f.key(3)), 20);
  assert.equal(f.text(f.key(1, 4)), '=($A$2+A3)'); assert.equal(f.value(f.key(1, 4)), 30);
});

test('cross-sheet cut preserves external targets of moved formula and supports whole range cut', () => {
  const f = fixture(); f.put(f.key(), 8); f.put(f.key(2), '=A1');
  f.add({ kind: 'cells.commit', changes: transformCells({ kind: 'cut', snapshot: f.project(), mapping: [{ from: f.key(2), to: f.key(2, 2, 's2') }] }) });
  assert.equal(f.text(f.key(2, 2, 's2')), "='s1'!A1"); assert.equal(f.value(f.key(2, 2, 's2')), 8);
  f.put(f.key(6, 6), '=SUM(A1:A2)');
  f.add({ kind: 'cells.commit', changes: transformCells({ kind: 'cut', snapshot: f.project(), mapping: [
    { from: f.key(), to: f.key(1, 2) }, { from: f.key(2), to: f.key(2, 2) },
  ] }) });
  assert.equal(f.text(f.key(6, 6)), '=SUM(B1:B2)'); assert.equal(f.value(f.key(6, 6)), 8);
});

test('partial/non-rectangular range cuts refuse before any native mutation', () => {
  const f = fixture(); f.put(f.key(6, 6), '=SUM(A1:A3)'); const snapshot = f.project();
  assert.throws(() => transformCells({ kind: 'cut', snapshot, mapping: [{ from: f.key(2), to: f.key(2, 2) }] }), /Partial range/);
  assert.throws(() => transformCells({ kind: 'cut', snapshot, mapping: [
    { from: f.key(), to: f.key(1, 2) }, { from: f.key(2), to: f.key(2, 3) }, { from: f.key(3), to: f.key(3, 2) },
  ] }), /Non-rectangular/);
  assert.equal(f.project().revision, snapshot.revision);
  assert.throws(() => transformCells({ kind: 'cut', snapshot, mapping: [{ from: f.key(), to: f.key(2) }, { from: f.key(), to: f.key(3) }] }), /unique/);
});

test('overlapping copy preserves source cells and reads original inputs', () => {
  const f = fixture(); f.put(f.key(), 10); f.put(f.key(2), 20);
  f.add({ kind: 'cells.commit', changes: transformCells({ kind: 'copy', snapshot: f.project(), mapping: [
    { from: f.key(), to: f.key(2) }, { from: f.key(2), to: f.key(3) },
  ] }) });
  assert.equal(f.value(f.key()), 10); assert.equal(f.value(f.key(2)), 10); assert.equal(f.value(f.key(3)), 20);
});

test('fill can reuse one source with independent relative displacements', () => {
  const f = fixture(); const from = f.key(1, 2); f.put(from, '=A1');
  f.add({ kind: 'cells.commit', changes: transformCells({ kind: 'copy', snapshot: f.project(), mapping: [
    { from, to: f.key(2, 2) }, { from, to: f.key(3, 2) },
  ] }) });
  assert.equal(f.text(f.key(2, 2)), '=A2'); assert.equal(f.text(f.key(3, 2)), '=A3');
});
