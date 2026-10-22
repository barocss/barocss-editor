import test from 'node:test';
import assert from 'node:assert/strict';
import { SheetController, inputFromText } from './controller.ts';
import { createPreviewReplica, PREVIEW_SHEETS, PREVIEW_SIZE } from './fixture.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { CalculationEngine } from '../../src/calculation.ts';
import type { CellKey } from '../../src/contracts.ts';
import { encodeCellKey } from '../../src/contracts.ts';
import { diffWorkbook } from '../../src/workbook.ts';

function fixture(canEdit?: () => boolean) {
  const replica = createPreviewReplica('00000000-0000-4000-8000-000000000533');
  const controller = new SheetController(replica, undefined, 'local', canEdit);
  const key = (sheetId: string, row: number, column: number): CellKey => {
    const result = controller.index.keyAt(sheetId, row - 1, column - 1);
    assert.ok(result, `${sheetId}: row ${row}, column ${column} exists`);
    return result;
  };
  const value = (cell: CellKey) => {
    const result = controller.read(cell);
    assert.equal(result.status, 'fresh');
    assert.ok(result.status === 'fresh');
    assert.equal(result.token.revision, controller.projection.revision);
    return result.value;
  };
  const edit = (cell: CellKey, text: string): void => {
    assert.equal(controller.select(cell), true);
    assert.equal(controller.startEdit(text), true);
    assert.equal(controller.commit(), true, controller.message);
  };
  return { replica, controller, key, value, edit };
}

test('native fixture exposes two bounded sheets, cross-sheet values, SUM and IF', () => {
  const f = fixture();
  try {
    assert.deepEqual(f.controller.projection.sheets.filter(sheet => !sheet.deleted).map(sheet => [sheet.id, sheet.name]),
      PREVIEW_SHEETS.map(sheet => [sheet.id, sheet.name]));
    for (const sheet of PREVIEW_SHEETS) {
      assert.ok(f.controller.index.keyAt(sheet.id, PREVIEW_SIZE.rows - 1, PREVIEW_SIZE.columns - 1));
      assert.equal(f.controller.index.keyAt(sheet.id, PREVIEW_SIZE.rows, 0), undefined);
    }
    assert.equal(f.value(f.key('sheet-budget', 2, 3)), 12);
    assert.equal(f.value(f.key('sheet-budget', 2, 4)), 36);
    assert.equal(f.value(f.key('sheet-budget', 4, 4)), 44);
    assert.equal(f.value(f.key('sheet-budget', 5, 4)), 'Review');
    assert.equal(f.controller.source(f.key('sheet-budget', 2, 3)), "='Rates'!B2");
  } finally { f.controller.destroy(); }
});

test('session edits recalculate native cross-sheet dependents; Undo excludes bootstrap', () => {
  const f = fixture();
  try {
    const initial = f.controller.projection;
    assert.equal(f.controller.canUndo, false);
    assert.equal(f.controller.undo(), false);
    assert.deepEqual(f.controller.projection, initial);
    f.edit(f.key('sheet-rates', 2, 2), '10');
    assert.equal(f.value(f.key('sheet-budget', 2, 3)), 10);
    assert.equal(f.value(f.key('sheet-budget', 4, 4)), 38);
    assert.equal(f.value(f.key('sheet-budget', 5, 4)), 'Within budget');
    assert.equal(f.controller.canUndo, true);
    assert.equal(f.controller.undo(), true);
    assert.equal(f.value(f.key('sheet-rates', 2, 2)), 12);
    assert.equal(f.value(f.key('sheet-budget', 4, 4)), 44);
    assert.equal(f.value(f.key('sheet-budget', 5, 4)), 'Review');
    assert.equal(f.controller.canUndo, false);
    const afterUndo = f.controller.projection;
    assert.equal(f.controller.undo(), false);
    assert.deepEqual(f.controller.projection, afterUndo);
  } finally { f.controller.destroy(); }
});

test('cancel and invalid formula preserve the prior native projection', () => {
  const f = fixture();
  try {
    const cell = f.key('sheet-budget', 2, 2);
    f.controller.select(cell);
    const before = f.controller.projection;
    f.controller.startEdit('999');
    assert.equal(f.controller.undo(), false);
    assert.equal(f.controller.cancel(), true);
    assert.equal(f.controller.draft, null);
    assert.deepEqual(f.controller.projection, before);
    f.controller.startEdit('=1+');
    const invalid = f.controller.draft;
    assert.equal(f.controller.commit(), false);
    assert.match(f.controller.message, /Input refused/);
    assert.deepEqual(f.controller.draft, invalid);
    assert.deepEqual(f.controller.projection, before);
    assert.equal(f.value(cell), 3);
    assert.equal(f.controller.canUndo, false);
  } finally { f.controller.destroy(); }
});

test('native unsupported formulas and arithmetic errors remain explicit values', () => {
  const f = fixture();
  try {
    const cell = f.key('sheet-budget', 7, 2);
    f.edit(cell, '=AVERAGE(B2:B3)');
    assert.deepEqual(f.value(cell), { kind: 'error', code: '#UNSUPPORTED!' });
    assert.equal(f.controller.source(cell), '=AVERAGE(B2:B3)');
    f.edit(cell, '=1/0');
    assert.deepEqual(f.value(cell), { kind: 'error', code: '#DIV/0!' });
    assert.equal(f.controller.source(cell), '=(1/0)');
  } finally { f.controller.destroy(); }
});

test('literal source round trips preserve text, apostrophes, booleans and numbers', () => {
  const f = fixture();
  try {
    const cell = f.key('sheet-budget', 8, 2);
    const cases = [
      ["'0012", '0012'], ["'TRUE", 'TRUE'], ["'=SUM(B2:B3)", '=SUM(B2:B3)'],
      ["''quoted", "'quoted"], ["'", ''], ['FALSE', false], ['true', true], ['-2.5e2', -250], ['', null],
    ] as const;
    for (const [text, expected] of cases) {
      f.edit(cell, text);
      assert.equal(f.value(cell), expected, text);
      const source = f.controller.source(cell);
      assert.deepEqual(inputFromText(source, cell, f.controller.index), { kind: 'literal', value: expected }, source);
      f.controller.startEdit();
      assert.equal(f.controller.draft?.text, source);
      assert.equal(f.controller.commit(), true, source);
      assert.equal(f.value(cell), expected, source);
    }
  } finally { f.controller.destroy(); }
});

test('composition blocks Enter, cancellation and selection without replacing the draft', () => {
  const f = fixture();
  try {
    const cell = f.key('sheet-budget', 2, 1);
    const other = f.key('sheet-budget', 3, 1);
    f.controller.select(cell);
    f.controller.startEdit('한');
    f.controller.setComposing(true);
    const draft = f.controller.draft;
    const before = f.controller.projection;
    assert.equal(draft?.generation, before.context.generation);
    assert.deepEqual(draft?.key, cell);
    assert.equal(f.controller.commit(), false);
    assert.equal(f.controller.commit(true), false);
    assert.equal(f.controller.cancel(), false);
    assert.equal(f.controller.select(other), false);
    assert.equal(f.controller.switchSheet('sheet-rates'), false);
    assert.deepEqual(f.controller.selection, cell);
    assert.deepEqual(f.controller.draft, draft);
    assert.deepEqual(f.controller.projection, before);
    f.controller.setComposing(false);
    assert.equal(f.controller.commit(true), false);
    assert.deepEqual(f.controller.projection, before);
    f.controller.setDraft('한국어');
    assert.equal(f.controller.commit(), true);
    assert.equal(f.value(cell), '한국어');
  } finally { f.controller.destroy(); }
});

test('selection and keyboard movement use native positions and cancel an ordinary draft', () => {
  const f = fixture();
  try {
    const first = f.key('sheet-budget', 1, 1);
    assert.deepEqual(f.controller.selection, first);
    assert.equal(f.controller.move(-1, 0), false);
    f.controller.startEdit('not applied');
    assert.equal(f.controller.move(1, 1), true);
    assert.deepEqual(f.controller.selection, f.key('sheet-budget', 2, 2));
    assert.equal(f.controller.draft, null);
    assert.equal(f.value(first), 'Item');
    assert.equal(f.controller.switchSheet('sheet-rates'), true);
    assert.deepEqual(f.controller.selection, f.key('sheet-rates', 1, 1));
    const before = f.controller.selection;
    assert.equal(f.controller.select({ ...before, rowId: 'missing-row' }), false);
    assert.deepEqual(f.controller.selection, before);
  } finally { f.controller.destroy(); }
});

test('a structure change expires the draft without applying it at a shifted address', () => {
  const f = fixture();
  try {
    const cell = f.key('sheet-budget', 2, 2);
    f.controller.select(cell);
    f.controller.startEdit('999');
    f.replica.commit({ kind: 'axis.insert', sheetId: 'sheet-budget', axis: 'row', id: 'new-first', afterId: null });
    f.controller.synchronize();
    const afterStructure = f.controller.projection;
    assert.notDeepEqual(f.key('sheet-budget', 2, 2), cell);
    assert.equal(f.controller.address(cell), 'B3');
    assert.equal(f.controller.commit(), false);
    assert.match(f.controller.message, /Draft expired/);
    assert.deepEqual(f.controller.projection, afterStructure);
    assert.deepEqual(f.controller.draft?.key, cell);
    assert.equal(f.value(cell), 3);
    assert.notEqual(f.value(f.key('sheet-budget', 2, 2)), 999);
    assert.equal(f.controller.cancel(), true);
    f.edit(cell, '5');
    assert.equal(f.value(cell), 5);
  } finally { f.controller.destroy(); }
});

test('deleting the draft native row refuses the edit and leaves its original event intact', () => {
  const f = fixture();
  try {
    const cell = f.key('sheet-budget', 2, 2);
    const original = f.controller.projection.cells[encodeCellKey(cell)]?.winner;
    f.controller.select(cell);
    f.controller.startEdit('999');
    f.replica.commit({ kind: 'axis.delete', sheetId: cell.sheetId, axis: 'row', id: cell.rowId });
    f.controller.synchronize();
    const afterDeletion = f.controller.projection;
    assert.equal(f.controller.commit(), false);
    assert.deepEqual(f.controller.projection, afterDeletion);
    assert.deepEqual(f.controller.projection.cells[encodeCellKey(cell)]?.winner, original);
    assert.deepEqual(f.value(cell), { kind: 'error', code: '#REF!' });
  } finally { f.controller.destroy(); }
});

test('own Undo preserves a foreign session edit received as native binary events', () => {
  const f = fixture();
  const peer = new SheetReplica(f.replica.context, { actorId: 'other-user', sessionId: 'other-session' }, f.replica.exportUpdate());
  try {
    const rate = f.key('sheet-rates', 2, 2);
    const quantity = f.key('sheet-budget', 3, 2);
    f.edit(rate, '10');
    peer.receive(f.replica.exportUpdate());
    const foreign = peer.commit({ kind: 'cell.commit', key: quantity, input: { kind: 'literal', value: 5 } });
    f.replica.receive(foreign.update);
    f.controller.synchronize();
    assert.equal(f.value(quantity), 5);
    assert.equal(f.value(f.key('sheet-budget', 4, 4)), 50);
    assert.equal(f.controller.undo(), true);
    assert.equal(f.value(rate), 12);
    assert.equal(f.value(quantity), 5);
    assert.equal(f.value(f.key('sheet-budget', 4, 4)), 56);
    assert.equal(f.controller.projection.outcomes[foreign.event.eventId]?.status, 'applied');
    assert.equal(f.controller.canUndo, false);
    assert.equal(f.controller.undo(), false);
    assert.equal(f.value(quantity), 5);
  } finally { peer.destroy(); f.controller.destroy(); }
});

test('fresh controller reads bind the current revision; native old-token results are stale', () => {
  const f = fixture();
  try {
    const before = f.controller.projection;
    const cell = f.key('sheet-budget', 4, 4);
    const old = f.controller.read(cell);
    assert.ok(old.status === 'fresh');
    const native = new CalculationEngine(before);
    native.recalculate();
    const oldToken = native.token;
    f.edit(f.key('sheet-rates', 2, 2), '10');
    native.update(f.controller.projection, diffWorkbook(before, f.controller.projection), oldToken);
    assert.deepEqual(native.read(cell, oldToken), { status: 'stale' });
    assert.equal(native.read(cell).status, 'uncalculated');
    const current = f.controller.read(cell);
    assert.ok(current.status === 'fresh');
    assert.notEqual(current.token.revision, old.token.revision);
    assert.equal(current.token.revision, f.controller.projection.revision);
    assert.equal(current.value, 38);
  } finally { f.controller.destroy(); }
});

test('read-only controller selects and switches native Sheets and reads formulas without authoring events', () => {
  const f = fixture(() => false);
  try {
    const original = f.controller.projection;
    assert.equal(f.controller.editable, false);
    assert.equal(f.controller.select(f.key('sheet-budget', 4, 4)), true);
    assert.equal(f.value(f.controller.selection), 44);
    assert.equal(f.controller.source(), '=SUM(D2:D3)');
    assert.equal(f.controller.move(1, 0), true);
    assert.equal(f.value(f.controller.selection), 'Review');
    assert.equal(f.controller.switchSheet('sheet-rates'), true);
    assert.equal(f.controller.select(f.key('sheet-rates', 2, 2)), true);
    assert.equal(f.value(f.controller.selection), 12);
    assert.equal(f.controller.startEdit('999'), false);
    f.controller.setDraft('999'); f.controller.setComposing(true);
    assert.equal(f.controller.commit(), false);
    assert.equal(f.controller.undo(), false);
    assert.equal(f.controller.canUndo, false);
    assert.equal(f.controller.draft, null);
    assert.equal(f.controller.projection, original);
    assert.match(f.controller.message, /Read-only/);
  } finally { f.controller.destroy(); }
});

test('write access dropping during a draft retains its text, metadata and own Undo history', () => {
  let writable = true;
  const f = fixture(() => writable);
  try {
    const edited = f.key('sheet-rates', 2, 2);
    f.edit(edited, '10');
    const draftCell = f.key('sheet-budget', 2, 2);
    f.controller.select(draftCell); f.controller.startEdit('=5+1');
    const draft = f.controller.draft, original = f.controller.projection;
    writable = false;
    assert.equal(f.controller.startEdit('replacement'), false);
    f.controller.setDraft('replacement'); f.controller.setComposing(true);
    assert.equal(f.controller.commit(), false);
    assert.equal(f.controller.undo(), false);
    assert.equal(f.controller.canUndo, false);
    assert.deepEqual(f.controller.draft, draft);
    assert.equal(f.controller.select(f.key('sheet-budget', 4, 4)), true);
    assert.equal(f.controller.switchSheet('sheet-rates'), true);
    assert.deepEqual(f.controller.draft, draft);
    assert.equal(f.controller.projection, original);
    assert.equal(f.value(edited), 10);
    assert.equal(f.value(f.key('sheet-budget', 4, 4)), 38);
    writable = true;
    assert.equal(f.controller.cancel(), true);
    assert.equal(f.controller.canUndo, true);
    assert.equal(f.controller.undo(), true);
    assert.equal(f.value(edited), 12);
    assert.equal(f.value(f.key('sheet-budget', 4, 4)), 44);
  } finally { f.controller.destroy(); }
});

test('read-only navigation retains a composing draft and a late composition end cannot replace its text', () => {
  let writable = true;
  const f = fixture(() => writable);
  try {
    f.controller.startEdit('한'); f.controller.setComposing(true);
    const draft = f.controller.draft, original = f.controller.projection;
    writable = false;
    assert.equal(f.controller.switchSheet('sheet-rates'), true);
    assert.deepEqual(f.controller.draft, draft);
    f.controller.setDraft('late composition text');
    f.controller.setComposing(false);
    assert.deepEqual(f.controller.draft, { ...draft, composing: false });
    assert.equal(f.controller.projection, original);
    writable = true;
    assert.equal(f.controller.cancel(), true);
  } finally { f.controller.destroy(); }
});

test('permission failure and loss at the final commit check leave native history and draft unchanged', () => {
  let checks = 0, drop = false, throwing = false;
  const f = fixture(() => { if (throwing) throw new Error('authority unavailable'); return !drop || ++checks === 1; });
  try {
    f.controller.select(f.key('sheet-budget', 2, 2)); f.controller.startEdit('=5+1');
    const draft = f.controller.draft, original = f.controller.projection;
    drop = true; checks = 0;
    assert.equal(f.controller.commit(), false);
    assert.equal(checks, 2);
    assert.deepEqual(f.controller.draft, draft);
    assert.equal(f.controller.projection, original);
    throwing = true;
    assert.equal(f.controller.editable, false);
    assert.equal(f.controller.startEdit('replacement'), false);
    assert.equal(f.controller.commit(), false);
    assert.equal(f.controller.undo(), false);
    assert.equal(f.controller.switchSheet('sheet-rates'), true);
    assert.deepEqual(f.controller.draft, draft);
    assert.equal(f.controller.projection, original);
  } finally { f.controller.destroy(); }
});

test('loss at the final Undo check does not consume own history or emit a native Undo', () => {
  let checks = 0, drop = false;
  const f = fixture(() => !drop || ++checks === 1);
  try {
    const edited = f.key('sheet-rates', 2, 2);
    f.edit(edited, '10');
    const original = f.controller.projection;
    drop = true; checks = 0;
    assert.equal(f.controller.undo(), false);
    assert.equal(checks, 2);
    assert.equal(f.controller.projection, original);
    assert.equal(f.value(edited), 10);
    drop = false;
    assert.equal(f.controller.canUndo, true);
    assert.equal(f.controller.undo(), true);
    assert.equal(f.value(edited), 12);
  } finally { f.controller.destroy(); }
});
