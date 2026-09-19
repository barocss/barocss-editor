import { describe, expect, it } from 'vitest';
import { fieldsFrom } from '../src/dataset-fields';
import { evaluateDatasetRecords, inspectFormula, renameFormulaProperty, type DatasetEvaluationSource } from '../src/dataset-evaluation';
const formula = (name: string, expression: string) => ({ name, kind: 'formula' as const, formula: { expression } });
const source = (fields: DatasetEvaluationSource['fields'], records: DatasetEvaluationSource['records'] = [{}]): DatasetEvaluationSource => ({ name: 'work', fields, records, rowIds: records.map((_, index) => `r${index}`) });
const result = (expression: string, fields: DatasetEvaluationSource['fields'] = [], record = {}) => evaluateDatasetRecords(source([...fields, formula('result', expression)], [record]));

describe('computed field metadata', () => {
  it('roundtrips relation, formula, rollup and multi-select settings without losing their meaning', () => {
    const fields = [
      { name: 'client', kind: 'relation', label: '고객', relation: { source: 'clients', multiple: false } },
      { name: 'total', kind: 'formula', formula: { expression: 'prop("값") * 2' } },
      { name: 'sum', kind: 'rollup', rollup: { relationField: 'client', field: 'amount', operation: 'sum' } },
      { name: 'tags', kind: 'choices', options: ['a', 'b'] }
    ];
    const normalized = fieldsFrom(fields);
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(fields);
    expect(normalized[0].relation).not.toBe(fields[0].relation);
    expect(normalized[3].options).not.toBe(fields[3].options);
    expect(fieldsFrom([{ name: 'bad', kind: 'relation', relation: { source: 1 } }])[0].relation).toBeUndefined();
  });
});

describe('safe formula language', () => {
  it('calculates precedence, dependencies, Korean properties and explicit conversions', () => {
    const dataset = source([{ name: '수량', kind: 'number' }, { name: '단가', kind: 'number' }, formula('subtotal', 'prop("수량") * prop("단가")'), formula('result', 'round(prop("subtotal") / 3, 2) + toNumber("2")')], [{ 수량: 3, 단가: 12.5 }]);
    expect(evaluateDatasetRecords(dataset).records[0]).toMatchObject({ subtotal: 37.5, result: 14.5 });
    expect(result('1 + 2 * 3 - -2').records[0].result).toBe(9);
    expect(result('1e2 / 4 % 7').records[0].result).toBe(4);
  });
  it('supports lazy conditional functions and typed comparisons without evaluating unused errors', () => {
    expect(result('if(2 > 1 && !false, concat("고객 ", "A"), 1 / 0)').records[0].result).toBe('고객 A');
    expect(result('if(empty(null), min(abs(-3), max(1, 2)), 1 / 0)').records[0].result).toBe(2);
    expect(result('true || prop("missing")').records[0].result).toBe(true);
    expect(result('empty(0)').records[0].result).toBe(false);
    expect(result('"10" == 10').records[0].result).toBe(false);
  });
  it.each(['1 / 0', '1 % 0', '"2" + 3', 'round(1, 20)', 'toNumber("oops")', 'toNumber("")', '2 < "3"'])('shows a typed error for %s', expression => {
    const evaluated = result(expression);
    expect(evaluated.records[0].result).toBe('#ERROR!');
    expect(evaluated.errors[0].result).toBeTruthy();
  });
  it('reports missing properties and propagates dependency cycles visibly', () => {
    expect(result('prop("missing")').records[0].result).toBe('#REF!');
    const evaluated = evaluateDatasetRecords(source([formula('a', 'prop("b") + 1'), formula('b', 'prop("a")'), formula('dependent', 'prop("a")')]));
    expect(evaluated.records[0]).toEqual({ a: '#CYCLE!', b: '#CYCLE!', dependent: '#CYCLE!' });
    expect(Object.keys(evaluated.errors[0])).toHaveLength(3);
  });
  it.each(['globalThis.alert(1)', 'constructor("return process")()', 'prop("x").constructor', 'prop("x")[0]', 'x = 1', '1; 2', '(()=>1)()', 'unknown(1)', 'prop(1)', 'if(true, 1)', '"unterminated', '1e999', '"\\q"'])('rejects executable or malformed syntax: %s', expression => {
    expect(inspectFormula(expression).valid).toBe(false);
    expect(result(expression).records[0].result).toBe('#ERROR!');
  });
  it('bounds parser complexity and output size', () => {
    expect(inspectFormula('1'.repeat(4097)).valid).toBe(false);
    expect(inspectFormula('('.repeat(70) + '1' + ')'.repeat(70)).valid).toBe(false);
    expect(inspectFormula(Array(300).fill('1').join('+')).valid).toBe(false);
    const evaluated = result('concat(prop("long"), prop("long"))', [{ name: 'long', kind: 'text' }], { long: 'a'.repeat(40_000) });
    expect(evaluated.records[0].result).toBe('#ERROR!');
  });
  it('bounds dependency depth and cyclic input arrays without hanging', () => {
    const chain = Array.from({ length: 140 }, (_, index) => formula(`f${index}`, index === 139 ? '1' : `prop("f${index + 1}")`));
    expect(evaluateDatasetRecords(source(chain)).records[0].f0).toBe('#ERROR!');
    const loop: unknown[] = []; loop.push(loop);
    expect(result('concat(prop("value"))', [{ name: 'value', kind: 'choices' }], { value: loop }).records[0].result).toBe('#ERROR!');
  });

  it('stops excessive evaluation work with a visible error instead of returning partial arithmetic', () => {
    const expression = Array(200).fill('1').join('+');
    const evaluated = evaluateDatasetRecords(source(Array.from({ length: 300 }, (_, index) => formula(`f${index}`, expression))));
    expect(evaluated.records[0].f0).toBe(200);
    expect(evaluated.records[0].f299).toBe('#ERROR!');
    expect(evaluated.errors[0].f299).toContain('한도');
  });

  it('never reads inherited properties or invokes their methods', () => {
    const raw = Object.create({ inherited: 99 });
    const evaluated = result('prop("inherited")', [{ name: 'inherited', kind: 'number' }], raw);
    expect(evaluated.records[0].result).toBeNull();
    const unusual = evaluateDatasetRecords(source([formula('__proto__', '42')]));
    expect(Object.getPrototypeOf(unusual.records[0])).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(unusual.records[0], '__proto__')?.value).toBe(42);
  });
  it('inspects and renames only parsed property arguments, preserving text literals and escaped names', () => {
    const expression = `concat("prop(\\"old\\")", prop('old'), prop("한\\uAE00"), prop("old"))`;
    expect(inspectFormula(expression)).toEqual({ valid: true, references: ['old', '한글'] });
    const renamed = renameFormulaProperty(expression, 'old', 'new"name');
    expect(renamed).toBe(`concat("prop(\\"old\\")", prop("new\\"name"), prop("한\\uAE00"), prop("new\\"name"))`);
    expect(inspectFormula(renamed).references).toEqual(['new"name', '한글']);
    expect(renameFormulaProperty('prop("old") +', 'old', 'new')).toBe('prop("old") +');
  });
});

describe('relations and rollups are projections over stable row identities', () => {
  const clients: DatasetEvaluationSource = { name: 'clients', fields: [{ name: 'name', kind: 'text' }, { name: 'amount', kind: 'number' }], records: [{ name: 'Beta', amount: 20 }, { name: 'Alpha', amount: 10 }], rowIds: ['b', 'a'] };
  const relation = { name: 'clients', kind: 'relation' as const, relation: { source: 'clients', multiple: true } };
  const rollup = (operation: 'count' | 'sum' | 'average' | 'min' | 'max') => ({ name: operation, kind: 'rollup' as const, rollup: { relationField: 'clients', field: 'amount', operation } });
  it('resolves reordered records by ID and evaluates numeric aggregations without mutating raw data', () => {
    const dataset = source([relation, ...(['count', 'sum', 'average', 'min', 'max'] as const).map(rollup), formula('double', 'prop("sum") * 2')], [{ clients: ['a', 'b'], sum: 'stale' }]);
    const original = JSON.stringify(dataset);
    const evaluated = evaluateDatasetRecords(dataset, [clients]);
    expect(evaluated.records[0]).toEqual({ clients: ['Alpha', 'Beta'], count: 2, sum: 30, average: 15, min: 10, max: 20, double: 60 });
    expect(evaluated.errors).toEqual({});
    expect(JSON.stringify(dataset)).toBe(original);
    expect(clients.records[0].amount).toBe(20);
  });
  it('returns count/sum zero and empty extrema null for an empty relation', () => {
    expect(evaluateDatasetRecords(source([relation, ...(['count', 'sum', 'average', 'min', 'max'] as const).map(rollup)]), [clients]).records[0])
      .toEqual({ clients: [], count: 0, sum: 0, average: null, min: null, max: null });
  });
  it('shows missing targets and invalid relation cardinality instead of silently dropping references', () => {
    const dangling = evaluateDatasetRecords(source([relation, rollup('sum')], [{ clients: ['deleted'] }]), [clients]);
    expect(dangling.records[0]).toEqual({ clients: '#REF!', sum: '#REF!' });
    expect(evaluateDatasetRecords(source([relation], [{ clients: ['a'] }])).records[0].clients).toBe('#REF!');
    const single = { ...relation, relation: { source: 'clients', multiple: false } };
    expect(evaluateDatasetRecords(source([single], [{ clients: ['a', 'b'] }]), [clients]).records[0].clients).toBe('#ERROR!');
  });
  it('rejects ambiguous duplicate stable IDs rather than choosing an arbitrary row', () => {
    const duplicate = { ...clients, rowIds: ['a', 'a'] };
    expect(evaluateDatasetRecords(source([relation], [{ clients: ['a'] }]), [duplicate]).records[0].clients).toBe('#REF!');
  });

  it('propagates cross-dataset formula/rollup cycles', () => {
    const a = source([{ name: 'b', kind: 'relation', relation: { source: 'other' } }, { name: 'total', kind: 'rollup', rollup: { relationField: 'b', field: 'total', operation: 'sum' } }], [{ b: ['b'] }]);
    const b: DatasetEvaluationSource = { name: 'other', rowIds: ['b'], records: [{ a: ['r0'] }], fields: [{ name: 'a', kind: 'relation', relation: { source: 'work' } }, { name: 'total', kind: 'rollup', rollup: { relationField: 'a', field: 'total', operation: 'sum' } }] };
    expect(evaluateDatasetRecords(a, [b]).records[0].total).toBe('#CYCLE!');
  });
  it('refuses a nonnumeric rollup target and invalid target field', () => {
    const bad = { ...clients, records: [{ name: 'Beta', amount: '20' }, { name: 'Alpha', amount: 10 }] };
    expect(evaluateDatasetRecords(source([relation, rollup('sum')], [{ clients: ['b'] }]), [bad]).records[0].sum).toBe('#ERROR!');
    const missing = { ...rollup('count'), rollup: { ...rollup('count').rollup, field: 'gone' } };
    expect(evaluateDatasetRecords(source([relation, missing]), [clients]).records[0].count).toBe('#REF!');
  });
});
