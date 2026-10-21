import { decodeCellKey, encodeCellKey } from './contracts.ts';
import type { CellInput, CellKey, FormulaErrorCode, FormulaNode, WorkbookDiff, WorkbookProjection } from './contracts.ts';
import { ReferenceIndex, REFERENCE_LIMITS } from './references.ts';

export const CALCULATION_VERSION = 1;
export const CALCULATION_LIMITS = Object.freeze({ dependencyEdges: 1000000, rangeCells: REFERENCE_LIMITS.rangeCells, cellRequestsPerRun: 5000000 });
export type ErrorValue = { readonly kind: 'error'; readonly code: FormulaErrorCode };
export type FormulaValue = number | string | boolean | null | ErrorValue;
export interface CalculationToken { readonly identity: string; readonly revision: string; readonly calculationVersion: 1 }
export interface CalculationStats {
  readonly initialCellVisits: number;
  readonly changedCellVisits: number;
  readonly evaluatedFormulas: number;
  readonly dependencyEdges: number;
  readonly rangeCellsVisited: number;
}
export type CalculationRead = { readonly status: 'fresh'; readonly value: FormulaValue; readonly token: CalculationToken } | { readonly status: 'stale' | 'uncalculated' };
export const errorValue = (code: FormulaErrorCode): ErrorValue => Object.freeze({ kind: 'error', code });
export const isErrorValue = (value: FormulaValue): value is ErrorValue => typeof value === 'object' && value !== null;
const finite = (number: number): FormulaValue => Number.isFinite(number) ? number : errorValue('#VALUE!');
const numeric = (value: FormulaValue): number | ErrorValue => isErrorValue(value) ? value : typeof value === 'string' ? errorValue('#VALUE!') : value === null ? 0 : Number(value);

function binary(operator: string, left: FormulaValue, right: FormulaValue): FormulaValue {
  if (isErrorValue(left)) return left;
  if (isErrorValue(right)) return right;
  if (['=', '<>', '<', '<=', '>', '>='].includes(operator)) {
    let a: number | string;
    let b: number | string;
    if (typeof left === 'string' && typeof right === 'string') { a = left; b = right; }
    else {
      const x = numeric(left); const y = numeric(right);
      if (typeof x !== 'number' || typeof y !== 'number') return errorValue('#VALUE!');
      a = x; b = y;
    }
    switch (operator) {
      case '=': return a === b;
      case '<>': return a !== b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      default: return a >= b;
    }
  }
  const a = numeric(left); const b = numeric(right);
  if (typeof a !== 'number') return a;
  if (typeof b !== 'number') return b;
  switch (operator) {
    case '+': return finite(a + b);
    case '-': return finite(a - b);
    case '*': return finite(a * b);
    case '/': return b === 0 ? errorValue('#DIV/0!') : finite(a / b);
    case '^': return finite(a ** b);
    default: return errorValue('#UNSUPPORTED!');
  }
}

type Evaluation = Generator<string, FormulaValue, FormulaValue>;
function* evaluateNode(node: FormulaNode, index: ReferenceIndex, countRange: (count: number) => void): Evaluation {
  switch (node.kind) {
    case 'number': return finite(node.value);
    case 'string': case 'boolean': return node.value;
    case 'error': return errorValue(node.code);
    case 'unsupported': return errorValue('#UNSUPPORTED!');
    case 'reference': return index.position(node.reference) ? yield encodeCellKey(node.reference) : errorValue('#REF!');
    case 'range': return errorValue('#VALUE!');
    case 'unary': {
      const value = numeric(yield* evaluateNode(node.operand, index, countRange));
      return typeof value !== 'number' ? value : finite(node.operator === '-' ? -value : value);
    }
    case 'binary': {
      const left = yield* evaluateNode(node.left, index, countRange);
      if (isErrorValue(left)) return left;
      return binary(node.operator, left, yield* evaluateNode(node.right, index, countRange));
    }
    case 'call': {
      if (node.name === 'IF') {
        if (node.arguments.length !== 3) return errorValue('#VALUE!');
        const condition = numeric(yield* evaluateNode(node.arguments[0]!, index, countRange));
        return typeof condition === 'number' ? yield* evaluateNode(node.arguments[condition === 0 ? 2 : 1]!, index, countRange) : condition;
      }
      let total = 0;
      for (const argument of node.arguments) {
        if (argument.kind === 'range') {
          const keys = index.rangeKeys(argument.reference);
          if (!Array.isArray(keys)) return errorValue((keys as { kind: 'error'; code: FormulaErrorCode }).code);
          countRange(keys.length);
          for (const key of keys) {
            const value = yield encodeCellKey(key);
            if (isErrorValue(value)) return value;
            if (typeof value === 'number') total += value;
          }
        } else {
          const value = yield* evaluateNode(argument, index, countRange);
          if (isErrorValue(value)) return value;
          if (argument.kind === 'reference' && typeof value !== 'number') continue;
          const number = numeric(value);
          if (typeof number !== 'number') return number;
          total += number;
        }
        if (!Number.isFinite(total)) return errorValue('#VALUE!');
      }
      return finite(total);
    }
  }
}

const identity = (projection: WorkbookProjection): string => JSON.stringify([
  projection.context.documentId, projection.context.workbookId, projection.context.generation,
  projection.context.contractVersion, projection.context.engineVersion, projection.context.schemaVersion, projection.context.adapterVersion,
]);

/** Worker-compatible deterministic session; no Worker is created by this module. */
export class CalculationEngine {
  private projection: WorkbookProjection;
  private index: ReferenceIndex;
  private currentToken: CalculationToken;
  private readonly formulas = new Map<string, Extract<CellInput, { kind: 'formula' }>>();
  private readonly dependencies = new Map<string, Set<string>>();
  private readonly dependents = new Map<string, Set<string>>();
  private readonly sheetsUsed = new Map<string, Set<string>>();
  private readonly formulaSheets = new Map<string, Set<string>>();
  private readonly cache = new Map<string, FormulaValue>();
  private readonly dirty = new Set<string>();
  private initialVisits = 0;
  private changedVisits = 0;
  private evaluated = 0;
  private rangeVisits = 0;
  private edgeCount = 0;
  private requests = 0;
  private failed = false;

  constructor(projection: WorkbookProjection) {
    this.projection = projection;
    this.index = new ReferenceIndex(projection);
    this.currentToken = this.makeToken();
    for (const [key, record] of Object.entries(projection.cells)) {
      this.initialVisits++;
      if (!record.deleted && record.winner?.input.kind === 'formula') this.register(key, record.winner.input);
    }
  }
  get token(): CalculationToken { return this.currentToken; }
  get stats(): CalculationStats {
    return { initialCellVisits: this.initialVisits, changedCellVisits: this.changedVisits, evaluatedFormulas: this.evaluated, dependencyEdges: this.edgeCount, rangeCellsVisited: this.rangeVisits };
  }
  private makeToken(): CalculationToken { return Object.freeze({ identity: identity(this.projection), revision: this.projection.revision, calculationVersion: CALCULATION_VERSION }); }
  private matches(token: CalculationToken): boolean {
    return !this.failed && token.identity === this.currentToken.identity && token.revision === this.currentToken.revision && token.calculationVersion === CALCULATION_VERSION;
  }
  private unregister(key: string): void {
    this.edgeCount -= this.dependencies.get(key)?.size ?? 0;
    for (const dependency of this.dependencies.get(key) ?? []) {
      const users = this.dependents.get(dependency);
      users?.delete(key);
      if (users?.size === 0) this.dependents.delete(dependency);
    }
    for (const sheet of this.formulaSheets.get(key) ?? []) {
      const users = this.sheetsUsed.get(sheet);
      users?.delete(key);
      if (users?.size === 0) this.sheetsUsed.delete(sheet);
    }
    this.formulaSheets.delete(key); this.dependencies.delete(key); this.formulas.delete(key);
  }
  private register(key: string, input: Extract<CellInput, { kind: 'formula' }>): void {
    this.unregister(key);
    this.formulas.set(key, input); this.dirty.add(key); this.cache.delete(key);
    const dependencies = new Set<string>();
    const addDependency = (dependency: string): void => {
      if (!dependencies.has(dependency) && this.edgeCount + dependencies.size >= CALCULATION_LIMITS.dependencyEdges) throw new RangeError('Dependency graph limit; calculation session refused');
      dependencies.add(dependency);
    };
    const sheets = new Set<string>();
    const stack = [input.ast];
    while (stack.length) {
      const node = stack.pop()!;
      switch (node.kind) {
        case 'reference': addDependency(encodeCellKey(node.reference)); sheets.add(node.reference.sheetId); break;
        case 'range': {
          sheets.add(node.reference.start.sheetId); sheets.add(node.reference.end.sheetId);
          const keys = this.index.rangeKeys(node.reference);
          if (Array.isArray(keys)) for (const dependency of keys) addDependency(encodeCellKey(dependency));
          break;
        }
        case 'unary': stack.push(node.operand); break;
        case 'binary': stack.push(node.left, node.right); break;
        case 'call': stack.push(...node.arguments); break;
      }
    }
    this.dependencies.set(key, dependencies); this.formulaSheets.set(key, sheets);
    this.edgeCount += dependencies.size;
    for (const dependency of dependencies) {
      const users = this.dependents.get(dependency) ?? new Set<string>();
      users.add(key); this.dependents.set(dependency, users);
    }
    for (const sheet of sheets) {
      const users = this.sheetsUsed.get(sheet) ?? new Set<string>();
      users.add(key); this.sheetsUsed.set(sheet, users);
    }
  }
  private invalidate(seeds: Iterable<string>): void {
    const queue = [...seeds]; const seen = new Set(queue);
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i]!;
      this.cache.delete(key);
      if (this.formulas.has(key)) this.dirty.add(key);
      for (const user of this.dependents.get(key) ?? []) if (!seen.has(user)) { seen.add(user); queue.push(user); }
    }
  }
  /** diff must be Core's exact before→after diff. expected binds its source session. */
  update(projection: WorkbookProjection, diff: WorkbookDiff, expected: CalculationToken): void {
    if (!this.matches(expected) || identity(projection) !== expected.identity || diff.revision !== projection.revision) throw new TypeError('Stale or incompatible calculation update');
    // A resource refusal must never expose a partly rebuilt graph as fresh.
    this.failed = true;
    const seeds = new Set(diff.changedCellKeys.map(encodeCellKey));
    const structural = new Set<string>();
    for (const sheet of diff.changedStructureSheetIds) for (const key of this.sheetsUsed.get(sheet) ?? []) structural.add(key);
    for (const key of structural) seeds.add(key);
    this.invalidate(seeds); // Preserve closure through old edges before replacing them.
    this.projection = projection;
    if (diff.changedStructureSheetIds.length) this.index = new ReferenceIndex(projection);
    for (const key of seeds) {
      this.changedVisits++;
      this.unregister(key);
      const record = projection.cells[key];
      if (record && !record.deleted && record.winner?.input.kind === 'formula') this.register(key, record.winner.input);
    }
    this.invalidate(seeds);
    this.currentToken = this.makeToken();
    this.failed = false;
  }
  private literal(key: string): FormulaValue {
    const nativeKey = decodeCellKey(key);
    if (!this.index.position(nativeKey)) return errorValue('#REF!');
    const input = this.projection.cells[key]?.winner?.input;
    if (!input) return null;
    if (input.kind === 'invalid') return errorValue('#VALUE!');
    if (input.kind === 'literal') return typeof input.value === 'number' ? finite(input.value) : input.value;
    return errorValue('#VALUE!');
  }
  private evaluate(root: string): void {
    type Frame = { key: string; iterator: Evaluation; next: FormulaValue };
    const frames: Frame[] = [];
    const active = new Set<string>();
    const push = (key: string): void => {
      const formula = this.formulas.get(key)!;
      frames.push({ key, iterator: evaluateNode(formula.ast, this.index, count => { this.rangeVisits += count; }), next: null });
      active.add(key); this.evaluated++;
    };
    push(root);
    while (frames.length) {
      const frame = frames[frames.length - 1]!;
      const step = frame.iterator.next(frame.next);
      frame.next = null;
      if (step.done) {
        this.cache.set(frame.key, step.value); this.dirty.delete(frame.key); active.delete(frame.key); frames.pop();
        if (frames.length) frames[frames.length - 1]!.next = step.value;
      } else {
        if (++this.requests > CALCULATION_LIMITS.cellRequestsPerRun) throw new RangeError('Calculation request limit; remaining cells stay uncalculated');
        const dependency = step.value;
        if (active.has(dependency)) frame.next = errorValue('#CYCLE!');
        else if (this.cache.has(dependency)) frame.next = this.cache.get(dependency)!;
        else if (!this.formulas.has(dependency)) frame.next = this.literal(dependency);
        else push(dependency);
      }
    }
  }
  recalculate(expected: CalculationToken = this.currentToken): CalculationStats {
    if (!this.matches(expected)) throw new TypeError('Stale calculation request');
    this.requests = 0;
    for (const key of this.dirty) {
      if (this.formulas.has(key)) this.evaluate(key);
      else this.dirty.delete(key);
    }
    return this.stats;
  }
  read(key: CellKey, expected: CalculationToken = this.currentToken): CalculationRead {
    if (!this.matches(expected)) return { status: 'stale' };
    const encoded = encodeCellKey(key);
    if (this.dirty.has(encoded)) return { status: 'uncalculated' };
    return { status: 'fresh', token: this.currentToken, value: this.cache.has(encoded) ? this.cache.get(encoded)! : this.literal(encoded) };
  }
  /** Admission check for a detached worker result; this module never installs it as input. */
  accepts(token: CalculationToken): boolean { return this.matches(token); }
}

export type DateSystem = '1900' | '1904';
const DAY = 86400000;
/** Bounded civil dates, UTC, integer days only. No timezone/locale/date parsing. */
export function dateToSerial(year: number, month: number, day: number, system: DateSystem): number | ErrorValue {
  if (system !== '1900' && system !== '1904') return errorValue('#UNSUPPORTED!');
  if (![year, month, day].every(Number.isInteger) || year < (system === '1900' ? 1900 : 1904) || year > 9999) return errorValue('#VALUE!');
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return errorValue('#VALUE!');
  const base = system === '1900' ? Date.UTC(1899, 11, 31) : Date.UTC(1904, 0, 1);
  let serial = (date.getTime() - base) / DAY;
  if (system === '1900' && serial >= 60) serial++;
  return serial;
}
export function serialToDate(serial: number, system: DateSystem): string | ErrorValue {
  if (system !== '1900' && system !== '1904') return errorValue('#UNSUPPORTED!');
  if (!Number.isInteger(serial) || serial < (system === '1900' ? 1 : 0)) return errorValue('#VALUE!');
  if (system === '1900' && serial === 60) return errorValue('#UNSUPPORTED!');
  const days = system === '1900' && serial > 60 ? serial - 1 : serial;
  const date = new Date((system === '1900' ? Date.UTC(1899, 11, 31) : Date.UTC(1904, 0, 1)) + days * DAY);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) return errorValue('#VALUE!');
  return date.toISOString().slice(0, 10);
}
