import type { DataField } from './dataset-fields';

export interface DatasetEvaluationSource {
  name: string;
  fields: DataField[];
  records: Record<string, unknown>[];
  rowIds: string[];
}
export interface FormulaInspection { valid: boolean; references: string[]; error?: string }
type Token = { value: string; kind: 'number' | 'string' | 'name' | 'symbol'; start: number; end: number };
type Expr = { type: 'literal'; value: unknown } | { type: 'prop'; name: string; token: Token }
  | { type: 'unary'; op: string; value: Expr } | { type: 'binary'; op: string; left: Expr; right: Expr }
  | { type: 'call'; name: string; args: Expr[] };
const arities: Record<string, [number, number]> = { if: [3, 3], empty: [1, 1], concat: [1, 32], round: [1, 2], abs: [1, 1], min: [1, 32], max: [1, 32], toNumber: [1, 1] };
const precedence: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
class EvaluationError extends Error {
  constructor(readonly code: '#REF!' | '#CYCLE!' | '#ERROR!', message: string) { super(message); }
}
function fail(message: string): never { throw new EvaluationError('#ERROR!', message); }
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** No property access, assignment, arbitrary calls or JavaScript evaluation is accepted. */
function parse(expression: string): { tree: Expr; references: string[]; properties: Token[] } {
  if (typeof expression !== 'string' || expression.length > 4096) fail('수식은 4096자 이하여야 합니다.');
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    if (/\s/.test(expression[i])) { i++; continue; }
    const start = i, char = expression[i];
    if (char === '"' || char === "'") {
      const quote = char; let value = ''; i++;
      while (i < expression.length && expression[i] !== quote) {
        const current = expression[i++];
        if (current === '\\') {
          const escaped = expression[i++];
          const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', '"': '"', "'": "'", '/': '/' };
          if (escaped === 'u') {
            const hex = expression.slice(i, i + 4);
            if (!/^[0-9a-f]{4}$/i.test(hex)) fail('잘못된 문자열 이스케이프입니다.');
            value += String.fromCharCode(parseInt(hex, 16)); i += 4;
          } else if (own(escapes, escaped)) value += escapes[escaped];
          else fail('잘못된 문자열 이스케이프입니다.');
        } else { if (current.charCodeAt(0) < 32) fail('문자열의 줄바꿈은 이스케이프하세요.'); value += current; }
      }
      if (expression[i++] !== quote) fail('문자열의 닫는 따옴표가 필요합니다.');
      tokens.push({ kind: 'string', value, start, end: i });
    } else {
      const number = expression.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      const name = expression.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);
      const symbol = expression.slice(i).match(/^(?:==|!=|>=|<=|&&|\|\||[+*/%(),!<>-])/);
      const match = number ?? name ?? symbol;
      if (!match) fail(`허용되지 않는 문자입니다: ${expression[i]}`);
      i += match[0].length;
      tokens.push({ kind: number ? 'number' : name ? 'name' : 'symbol', value: match[0], start, end: i });
    }
    if (tokens.length > 512) fail('수식이 너무 복잡합니다.');
  }
  let cursor = 0;
  const properties: Token[] = [];
  const take = (value: string) => tokens[cursor]?.value === value && tokens[cursor]?.kind === 'symbol' ? (cursor++, true) : false;
  const expect = (value: string) => { if (!take(value)) fail(`${value} 기호가 필요합니다.`); };
  const read = (minimum = 0, depth = 0): Expr => {
    if (depth > 64) fail('수식 중첩이 너무 깊습니다.');
    let left: Expr;
    const token = tokens[cursor++];
    if (!token) fail('수식 값이 필요합니다.');
    if (token.kind === 'number') {
      const value = Number(token.value); if (!Number.isFinite(value)) fail('유한한 숫자를 입력하세요.');
      left = { type: 'literal', value };
    } else if (token.kind === 'string') left = { type: 'literal', value: token.value };
    else if (token.kind === 'symbol' && ['-', '+', '!'].includes(token.value)) left = { type: 'unary', op: token.value, value: read(7, depth + 1) };
    else if (token.kind === 'symbol' && token.value === '(') { left = read(0, depth + 1); expect(')'); }
    else if (token.kind === 'name' && ['true', 'false', 'null'].includes(token.value)) left = { type: 'literal', value: token.value === 'null' ? null : token.value === 'true' };
    else if (token.kind === 'name') {
      expect('(');
      if (token.value === 'prop') {
        const property = tokens[cursor++];
        if (property?.kind !== 'string') fail('prop에는 따옴표로 감싼 필드 이름이 필요합니다.');
        expect(')'); properties.push(property); left = { type: 'prop', name: property.value, token: property };
      } else {
        if (!own(arities, token.value)) fail(`지원하지 않는 함수입니다: ${token.value}`);
        const args: Expr[] = [];
        if (!take(')')) { do { args.push(read(0, depth + 1)); } while (take(',')); expect(')'); }
        const [min, max] = arities[token.value];
        if (args.length < min || args.length > max) fail(`${token.value} 함수의 인수 개수가 맞지 않습니다.`);
        left = { type: 'call', name: token.value, args };
      }
    } else return fail('수식 값이 필요합니다.');
    while (tokens[cursor]?.kind === 'symbol' && own(precedence, tokens[cursor].value) && precedence[tokens[cursor].value] >= minimum) {
      const op = tokens[cursor++].value;
      left = { type: 'binary', op, left, right: read(precedence[op] + 1, depth + 1) };
    }
    return left;
  };
  const tree = read();
  if (cursor !== tokens.length) fail('수식 뒤에 해석할 수 없는 내용이 있습니다.');
  return { tree, references: [...new Set(properties.map(token => token.value))], properties };
}

/** Syntax-only inspection; callers can compare references with their dataset fields. */
export function inspectFormula(expression: string): FormulaInspection {
  try { return { valid: true, references: parse(expression).references }; }
  catch (error) { return { valid: false, references: [], error: error instanceof Error ? error.message : '잘못된 수식입니다.' }; }
}
/** Rewrites only literal prop arguments; string contents and escaped names remain intact. */
export function renameFormulaProperty(expression: string, from: string, to: string): string {
  try {
    const tokens = parse(expression).properties.filter(token => token.value === from).reverse();
    for (const token of tokens) expression = expression.slice(0, token.start) + JSON.stringify(to) + expression.slice(token.end);
    return expression;
  } catch { return expression; }
}

const numeric = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : fail('숫자 값이 필요합니다.');
const finite = (value: number): number => Number.isFinite(value) ? value : fail('계산 결과가 유한한 숫자가 아닙니다.');
const stringify = (value: unknown, depth = 0): string => {
  if (depth > 32) return fail('문자열 값의 중첩이 너무 깊습니다.');
  if (value == null) return '';
  if (Array.isArray(value)) {
    if (value.length > 10_000) return fail('문자열 목록이 너무 깁니다.');
    let result = '';
    for (const [index, item] of value.entries()) {
      result += (index ? ', ' : '') + stringify(item, depth + 1);
      if (result.length > 65_536) return fail('문자열 결과가 너무 깁니다.');
    }
    return result;
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    const result = String(value);
    return result.length <= 65_536 ? result : fail('문자열 결과가 너무 깁니다.');
  }
  return fail('문자열로 변환할 수 없는 값입니다.');
};

/**
 * Display/query projection only. Arithmetic is numeric; concat explicitly builds strings.
 * if/&&/|| are lazy. round accepts -10..10 digits. Limits: 4096 chars, 512 tokens,
 * 64 expression levels, 128 field dependencies and 100,000 evaluation steps per call.
 */
export function evaluateDatasetRecords(source: DatasetEvaluationSource, sources: readonly DatasetEvaluationSource[] = []): {
  records: Record<string, unknown>[]; errors: Record<number, Record<string, string>>;
} {
  const catalog = new Map(sources.map(item => [item.name, item])); catalog.set(source.name, source);
  const cache = new Map<DatasetEvaluationSource, Map<string, unknown>>();
  const active = new Set<string>();
  const identities = new Map<DatasetEvaluationSource, number>();
  const compiled = new Map<string, ReturnType<typeof parse>>();
  let steps = 0;
  const step = () => { if (++steps > 100_000) fail('계산 한도를 초과했습니다.'); };
  const rowMap = new Map<DatasetEvaluationSource, Map<string, number>>();
  const reference = (message: string): never => { throw new EvaluationError('#REF!', message); };
  const related = (dataset: DatasetEvaluationSource, row: number, field: DataField) => {
    const target = field.relation && catalog.get(field.relation.source);
    if (!target) return reference(`관계 대상 데이터베이스를 찾을 수 없습니다: ${field.relation?.source ?? field.name}`);
    const raw = own(dataset.records[row], field.name) ? dataset.records[row][field.name] : undefined;
    const ids = raw == null || raw === '' ? [] : typeof raw === 'string' ? [raw] : Array.isArray(raw) && raw.every(id => typeof id === 'string') ? raw as string[] : fail('관계 값에는 항목 ID가 필요합니다.');
    if (ids.length > 10_000) fail('한 관계의 항목은 10000개 이하여야 합니다.');
    if (field.relation?.multiple === false && ids.length > 1) fail('이 관계는 항목 하나만 선택할 수 있습니다.');
    let map = rowMap.get(target);
    if (!map) { map = new Map(); target.rowIds.forEach((id, index) => { if (id) map!.set(id, map!.has(id) ? -1 : index); }); rowMap.set(target, map); }
    const rows = [...new Set(ids)].map(id => {
      const index = map!.get(id);
      if (index === undefined || !target.records[index]) return reference(`관계 항목을 찾을 수 없습니다: ${id}`);
      return index;
    });
    return { target, rows };
  };
  const run = (expr: Expr, prop: (name: string) => unknown): unknown => {
    step();
    if (expr.type === 'literal') return expr.value;
    if (expr.type === 'prop') return prop(expr.name);
    if (expr.type === 'unary') { const value = run(expr.value, prop); return expr.op === '!' ? !value : expr.op === '-' ? -numeric(value) : numeric(value); }
    if (expr.type === 'binary') {
      const left = run(expr.left, prop);
      if (expr.op === '&&') return Boolean(left) && Boolean(run(expr.right, prop));
      if (expr.op === '||') return Boolean(left) || Boolean(run(expr.right, prop));
      const right = run(expr.right, prop);
      if (expr.op === '==') return left === right;
      if (expr.op === '!=') return left !== right;
      if (['>', '<', '>=', '<='].includes(expr.op)) {
        if (!((typeof left === 'string' && typeof right === 'string') || (typeof left === 'number' && typeof right === 'number'))) fail('비교할 값의 형식이 같아야 합니다.');
        const a = left as number, b = right as number;
        return expr.op === '>' ? a > b : expr.op === '<' ? a < b : expr.op === '>=' ? a >= b : a <= b;
      }
      const a = numeric(left), b = numeric(right);
      return finite(expr.op === '+' ? a + b : expr.op === '-' ? a - b : expr.op === '*' ? a * b : expr.op === '/' ? a / b : a % b);
    }
    if (expr.name === 'if') return run(expr.args[run(expr.args[0], prop) ? 1 : 2], prop);
    const args = expr.args.map(arg => run(arg, prop));
    switch (expr.name) {
      case 'empty': return args[0] == null || args[0] === '' || (Array.isArray(args[0]) && args[0].length === 0);
      case 'concat': { const text = args.map(value => stringify(value)).join(''); if (text.length > 65_536) fail('문자열 결과가 너무 깁니다.'); return text; }
      case 'toNumber': {
        if (typeof args[0] === 'number') return numeric(args[0]);
        if (typeof args[0] !== 'string' || !args[0].trim()) return fail('숫자로 변환할 수 없습니다.');
        return finite(Number(args[0]));
      }
      case 'abs': return Math.abs(numeric(args[0]));
      case 'min': return Math.min(...args.map(numeric));
      case 'max': return Math.max(...args.map(numeric));
      case 'round': {
        const digits = args.length === 2 ? numeric(args[1]) : 0;
        if (!Number.isInteger(digits) || Math.abs(digits) > 10) fail('반올림 자릿수는 -10부터 10 사이 정수여야 합니다.');
        const scale = 10 ** digits; return finite(Math.round(numeric(args[0]) * scale) / scale);
      }
      default: return fail('지원하지 않는 함수입니다.');
    }
  };
  const cell = (dataset: DatasetEvaluationSource, row: number, name: string, depth = 0): unknown => {
    step();
    if (depth > 128) fail('필드 참조가 너무 깊습니다.');
    const field = dataset.fields.find(field => field.name === name);
    if (!field) return reference(`필드를 찾을 수 없습니다: ${name}`);
    if (!identities.has(dataset)) identities.set(dataset, identities.size);
    const key = JSON.stringify([identities.get(dataset), row, name]);
    let saved = cache.get(dataset); if (!saved) { saved = new Map(); cache.set(dataset, saved); }
    if (saved.has(key)) { const value = saved.get(key); if (value instanceof EvaluationError) throw value; return value; }
    if (active.has(key)) throw new EvaluationError('#CYCLE!', `순환 참조입니다: ${name}`);
    active.add(key);
    try {
      let value: unknown;
      if (field.kind === 'formula') {
        const expression = field.formula?.expression;
        if (!expression) fail('수식을 설정하세요.');
        let formula = compiled.get(expression); if (!formula) { formula = parse(expression); compiled.set(expression, formula); }
        value = run(formula.tree, property => cell(dataset, row, property, depth + 1));
      } else if (field.kind === 'relation') {
        const { target, rows } = related(dataset, row, field);
        const title = target.fields.find(field => field.kind === 'text') ?? target.fields.find(field => field.kind === 'longText');
        value = rows.map(index => title ? stringify(cell(target, index, title.name, depth + 1)) || '제목 없음' : '제목 없음');
      } else if (field.kind === 'rollup') {
        const spec = field.rollup;
        if (!spec) fail('롤업을 설정하세요.');
        const relation = dataset.fields.find(field => field.name === spec.relationField && field.kind === 'relation');
        if (!relation) return reference(`관계 필드를 찾을 수 없습니다: ${spec.relationField}`);
        const { target, rows } = related(dataset, row, relation);
        if (!target.fields.some(field => field.name === spec.field)) return reference(`롤업 대상 필드를 찾을 수 없습니다: ${spec.field}`);
        if (spec.operation === 'count') value = rows.length;
        else {
          const values = rows.map(index => cell(target, index, spec.field, depth + 1)).filter(value => value != null && value !== '').map(numeric);
          const sum = values.reduce((sum, value) => finite(sum + value), 0);
          value = !values.length ? (spec.operation === 'sum' ? 0 : null) : spec.operation === 'sum' ? sum : spec.operation === 'average' ? sum / values.length : spec.operation === 'min' ? Math.min(...values) : Math.max(...values);
        }
      } else value = own(dataset.records[row], name) ? dataset.records[row][name] : null;
      saved.set(key, value); return value;
    } catch (error) {
      const problem = error instanceof EvaluationError ? error : new EvaluationError('#ERROR!', error instanceof Error ? error.message : '계산할 수 없습니다.');
      saved.set(key, problem); throw problem;
    } finally { active.delete(key); }
  };
  const errors: Record<number, Record<string, string>> = {};
  const records = source.records.map((raw, row) => {
    const record = { ...raw };
    for (const field of source.fields) {
      if (!['relation', 'formula', 'rollup'].includes(field.kind)) continue;
      let value: unknown;
      try { value = cell(source, row, field.name); }
      catch (error) {
        const problem = error instanceof EvaluationError ? error : new EvaluationError('#ERROR!', '계산할 수 없습니다.');
        value = problem.code;
        (errors[row] ??= Object.create(null))[field.name] = problem.message;
      }
      Object.defineProperty(record, field.name, { value, enumerable: true, writable: true, configurable: true });
    }
    return record;
  });
  return { records, errors };
}
