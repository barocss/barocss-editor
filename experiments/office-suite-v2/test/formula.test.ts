import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbookContext, createEvent, projectWorkbook } from '../src/workbook.ts';
import type { CellKey, WorkbookCommand, WorkbookEvent } from '../src/contracts.ts';
import { parseFormula, displayFormula } from '../src/formula.ts';
import { ReferenceIndex } from '../src/references.ts';
import { CalculationEngine, dateToSerial, serialToDate } from '../src/calculation.ts';

function fixture() {
  const context = createWorkbookContext({ documentId: 'formula', workbookId: 'book', generation: '1' });
  const events: WorkbookEvent[] = [];
  const add = (command: WorkbookCommand): void => {
    const n = events.length;
    events.push(createEvent(context, { eventId: `e${String(n).padStart(4, '0')}`, actorId: 'a', sessionId: 's' }, n ? [events[n - 1]!.eventId] : [], command));
  };
  for (const sheetId of ['s1', 's2']) {
    add({ kind: 'sheet.insert', sheetId, name: sheetId === 's1' ? 'Main' : "Other's Data", afterSheetId: sheetId === 's1' ? null : 's1' });
    for (const axis of ['row', 'column'] as const) for (let i = 1; i <= 6; i++) add({ kind: 'axis.insert', sheetId, axis, id: `${axis}${i}`, afterId: i === 1 ? null : `${axis}${i - 1}` });
  }
  const key: CellKey = { sheetId: 's1', rowId: 'row1', columnId: 'column6' };
  const project = () => projectWorkbook(context, events);
  const calculate = (source: string) => {
    add({ kind: 'cell.commit', key, input: parseFormula(source, key, new ReferenceIndex(project())) });
    const engine = new CalculationEngine(project()); engine.recalculate();
    const result = engine.read(key); assert.equal(result.status, 'fresh');
    return result.status === 'fresh' ? result.value : undefined;
  };
  return { key, project, calculate };
}

test('safe grammar, precedence, comparison, text and booleans', () => {
  const f = fixture();
  for (const [source, result] of [
    ['=1+2*3', 7], ['=(1+2)*3', 9],
    ['=1<2', true], ['=2<>2', false], ['=TRUE+1', 2], ['="a"="a"', true], ['=SUM()', 0],
    ['=IF(FALSE,1/0,7)', 7], ['=IF(TRUE,7,F1)', 7], ['=IF(0,1,2)', 2], ['=SUM(TRUE,2)', 3],
  ] as const) assert.deepEqual(f.calculate(source), result, source);
});

test('Excel unary negation binds before exponentiation', () => {
  const f = fixture();
  for (const [source, result] of [['=-2^2', 4], ['=-3^2', 9], ['=2^-2', 0.25], ['=-2^-2', 0.25], ['=3*-2^2', 12], ['=--2^2', 4]] as const) assert.deepEqual(f.calculate(source), result, source);
});

test('Excel equal-precedence exponents associate left to right', () => {
  const f = fixture();
  for (const [source, result] of [['=2^3^2', 64], ['=3^2^3', 729], ['=2^3^-2', 0.015625], ['=+2^3^2', 64], ['=SUM(-2^2,2^3^2)', 68]] as const) assert.deepEqual(f.calculate(source), result, source);
});

test('explicit parentheses override unary and exponent defaults and preserve AST display round trips', () => {
  const f = fixture(); const index = new ReferenceIndex(f.project());
  for (const [source, result] of [['=-(2^2)', -4], ['=2^(3^2)', 512], ['=(-2)^2', 4], ['=(2^3)^2', 64], ['=-(2^3)^2', 64]] as const) {
    assert.deepEqual(f.calculate(source), result, source);
    const input = parseFormula(source, f.key, index); assert.equal(input.kind, 'formula');
    if (input.kind === 'formula') assert.deepEqual(parseFormula(displayFormula(input.ast, index), f.key, index), input);
  }
});

test('explicit errors, unsupported inputs, invalid syntax and resource limits', () => {
  const f = fixture(); const index = new ReferenceIndex(f.project());
  for (const source of ['=1+', '=IF(TRUE,1)', '=SUM(1,,2)', 'A1', '=1e999', `=${'('.repeat(70)}1${')'.repeat(70)}`, `=${Array(100).fill('1').join('+')}`]) {
    assert.equal(parseFormula(source, f.key, index).kind, 'invalid', source);
  }
  for (const source of ['=AVERAGE(A1)', '=globalThis.process.exit()', '=1;2', '=[other]Main!A1', '=A:A', '=1%']) assert.deepEqual(f.calculate(source), { kind: 'error', code: '#UNSUPPORTED!' }, source);
  for (const [source, code] of [['=1/0', '#DIV/0!'], ['=1e308*1e308', '#VALUE!'], ['="2"+1', '#VALUE!'], ['=IF("x",1,2)', '#VALUE!'], ['=Z99', '#REF!'], ['=A3:A1', '#REF!'], ['=Main!A1:Main!B2+1', '#VALUE!']] as const) assert.deepEqual(f.calculate(source), { kind: 'error', code }, source);
});

test('canonical text derives from typed AST, with quoted sheet names and escaped strings', () => {
  const f = fixture(); const index = new ReferenceIndex(f.project());
  for (const source of ["='Other''s Data'!$A1+Main!B$2", '=IF(TRUE,"say ""yes""",SUM(A1:B3))']) {
    const input = parseFormula(source, f.key, index); assert.equal(input.kind, 'formula');
    if (input.kind !== 'formula') return;
    const reopened = parseFormula(displayFormula(input.ast, index), f.key, index);
    assert.deepEqual(reopened, input);
  }
  assert.deepEqual(f.calculate("='Other''s Data'!A1:Main!A2"), { kind: 'error', code: '#REF!' });
});

test('bounded civil 1900/1904 dates, no fake leap day or locale inference', () => {
  assert.equal(dateToSerial(1900, 1, 1, '1900'), 1);
  assert.equal(dateToSerial(1900, 2, 28, '1900'), 59);
  assert.equal(dateToSerial(1900, 3, 1, '1900'), 61);
  assert.equal(serialToDate(61, '1900'), '1900-03-01');
  assert.deepEqual(serialToDate(60, '1900'), { kind: 'error', code: '#UNSUPPORTED!' });
  assert.deepEqual(dateToSerial(1900, 2, 29, '1900'), { kind: 'error', code: '#VALUE!' });
  assert.equal(dateToSerial(1904, 1, 1, '1904'), 0);
  assert.equal(serialToDate(0, '1904'), '1904-01-01');
  assert.equal(dateToSerial(2024, 2, 29, '1900'), 45351);
  assert.equal(dateToSerial(2024, 2, 29, '1904'), 43889);
  assert.deepEqual(serialToDate(0.5, '1904'), { kind: 'error', code: '#VALUE!' });
  assert.deepEqual(serialToDate(Infinity, '1900'), { kind: 'error', code: '#VALUE!' });
  assert.deepEqual(dateToSerial(2024, 2, 30, '1900'), { kind: 'error', code: '#VALUE!' });
  assert.deepEqual(serialToDate(999999999, '1904'), { kind: 'error', code: '#VALUE!' });
});
