import { CORE_LIMITS, encodeCellKey } from './contracts.ts';
import type { CellChange, CellInput, CellKey, CellReference, FormulaNode, FormulaTransform, RangeReference, SheetProjection, WorkbookProjection } from './contracts.ts';

type AxisIndex = { ids: string[]; positions: Map<string, number> };
type SheetIndex = { sheet: SheetProjection; rows: AxisIndex; columns: AxisIndex };
export const REFERENCE_LIMITS = Object.freeze({ rangeCells: 100000 });
const fail = (code: '#REF!' | '#LIMIT!'): FormulaNode => ({ kind: 'error', code });

/** Read-only derived address index. Build once per projection, never once per cell. */
export class ReferenceIndex {
  readonly projection: WorkbookProjection;
  private readonly sheets = new Map<string, SheetIndex>();
  private readonly names = new Map<string, string[]>();
  constructor(projection: WorkbookProjection) {
    this.projection = projection;
    for (const sheet of projection.sheets) {
      if (sheet.deleted) continue;
      const axis = (items: SheetProjection['rows']): AxisIndex => {
        const ids = items.filter(item => !item.deleted).map(item => item.id);
        return { ids, positions: new Map(ids.map((id, position) => [id, position])) };
      };
      this.sheets.set(sheet.id, { sheet, rows: axis(sheet.rows), columns: axis(sheet.columns) });
      const name = sheet.name.toUpperCase();
      this.names.set(name, [...(this.names.get(name) ?? []), sheet.id]);
    }
  }
  sheetNamed(name: string): string | undefined {
    const ids = this.names.get(name.toUpperCase());
    return ids?.length === 1 ? ids[0] : undefined;
  }
  sheetName(id: string): string | undefined { return this.sheets.get(id)?.sheet.name; }
  position(key: CellKey): { row: number; column: number } | undefined {
    const sheet = this.sheets.get(key.sheetId);
    const row = sheet?.rows.positions.get(key.rowId);
    const column = sheet?.columns.positions.get(key.columnId);
    return row === undefined || column === undefined ? undefined : { row, column };
  }
  keyAt(sheetId: string, row: number, column: number): CellKey | undefined {
    const sheet = this.sheets.get(sheetId);
    const rowId = sheet?.rows.ids[row];
    const columnId = sheet?.columns.ids[column];
    return rowId === undefined || columnId === undefined ? undefined : { sheetId, rowId, columnId };
  }
  resolve(address: string, sheetId: string, sheetQualified = false): CellReference | undefined {
    const match = /^(\$?)([A-Za-z]+)(\$?)([1-9][0-9]*)$/.exec(address);
    if (!match) return undefined;
    let column = 0;
    for (const char of match[2]!.toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64;
    const row = Number(match[4]) - 1;
    if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column)) return undefined;
    const key = this.keyAt(sheetId, row, column - 1);
    return key ? { ...key, absRow: match[3] === '$', absColumn: match[1] === '$', sheetQualified } : undefined;
  }
  rangeKeys(range: RangeReference, limit = REFERENCE_LIMITS.rangeCells): readonly CellKey[] | FormulaNode {
    const start = this.position(range.start);
    const end = this.position(range.end);
    if (range.policy !== 'live-interval' || range.start.sheetId !== range.end.sheetId || !start || !end || start.row > end.row || start.column > end.column) return fail('#REF!');
    const count = (end.row - start.row + 1) * (end.column - start.column + 1);
    if (!Number.isSafeInteger(limit) || limit < 0 || count > Math.min(limit, REFERENCE_LIMITS.rangeCells)) return fail('#LIMIT!');
    const keys: CellKey[] = [];
    for (let row = start.row; row <= end.row; row++) {
      for (let column = start.column; column <= end.column; column++) keys.push(this.keyAt(range.start.sheetId, row, column)!);
    }
    return keys;
  }
  display(reference: CellReference): string {
    const position = this.position(reference);
    const name = this.sheetName(reference.sheetId);
    if (!position || name === undefined) return '#REF!';
    let n = position.column + 1;
    let column = '';
    while (n > 0) { n--; column = String.fromCharCode(65 + n % 26) + column; n = Math.floor(n / 26); }
    const qualifier = reference.sheetQualified ? `'${name.replaceAll("'", "''")}'!` : '';
    return `${qualifier}${reference.absColumn ? '$' : ''}${column}${reference.absRow ? '$' : ''}${position.row + 1}`;
  }
}

export function mapFormula(node: FormulaNode, scalar: (reference: CellReference) => FormulaNode, range: (reference: RangeReference) => FormulaNode): FormulaNode {
  switch (node.kind) {
    case 'reference': return scalar(node.reference);
    case 'range': return range(node.reference);
    case 'unary': return { ...node, operand: mapFormula(node.operand, scalar, range) };
    case 'binary': return { ...node, left: mapFormula(node.left, scalar, range), right: mapFormula(node.right, scalar, range) };
    case 'call': return { ...node, arguments: node.arguments.map(argument => mapFormula(argument, scalar, range)) };
    default: return node;
  }
}

export function relocateFormula(ast: FormulaNode, from: CellKey, to: CellKey, index: ReferenceIndex): FormulaNode {
  const source = index.position(from);
  const target = index.position(to);
  if (!source || !target) return fail('#REF!');
  const move = (reference: CellReference): FormulaNode => {
    const position = index.position(reference);
    if (!position) return fail('#REF!');
    const key = index.keyAt(reference.sheetQualified ? reference.sheetId : to.sheetId,
      position.row + (reference.absRow ? 0 : target.row - source.row),
      position.column + (reference.absColumn ? 0 : target.column - source.column));
    return key ? { kind: 'reference', reference: { ...reference, ...key } } : fail('#REF!');
  };
  return mapFormula(ast, move, reference => {
    const start = move(reference.start);
    const end = move(reference.end);
    if (start.kind !== 'reference' || end.kind !== 'reference') return fail('#REF!');
    const relocated: RangeReference = { ...reference, start: start.reference, end: end.reference };
    return Array.isArray(index.rangeKeys(relocated)) ? { kind: 'range', reference: relocated } : fail('#REF!');
  });
}

/** Atomic input changes read exclusively from the complete pre-mutation snapshot. */
export function transformCells(request: FormulaTransform): readonly CellChange[] {
  if (request.kind !== 'copy' && request.kind !== 'cut') throw new TypeError('Unsupported transform kind');
  if (request.mapping.length > CORE_LIMITS.batchCells) throw new RangeError('Transform exceeds mapping limit');
  const index = new ReferenceIndex(request.snapshot);
  const sources = new Map<string, CellKey>();
  const targets = new Set<string>();
  for (const { from, to } of request.mapping) {
    const source = encodeCellKey(from);
    const target = encodeCellKey(to);
    if (!index.position(from) || !index.position(to) || (request.kind === 'cut' && sources.has(source)) || targets.has(target)) throw new TypeError('Transform requires live keys, unique destinations and unique cut sources');
    sources.set(source, to); targets.add(target);
  }
  const changes = new Map<string, CellChange>();
  const put = (key: CellKey, input: CellInput): void => { changes.set(encodeCellKey(key), { key, input }); };
  const read = (key: CellKey): CellInput => request.snapshot.cells[encodeCellKey(key)]?.winner?.input ?? { kind: 'literal', value: null };
  const cutAst = (ast: FormulaNode, location: CellKey): FormulaNode => {
    const move = (reference: CellReference): FormulaNode => {
      const to = sources.get(encodeCellKey(reference));
      const ref = to ? { ...reference, ...to } : reference;
      return { kind: 'reference', reference: { ...ref, sheetQualified: ref.sheetQualified || ref.sheetId !== location.sheetId } };
    };
    return mapFormula(ast, move, reference => {
      const keys = index.rangeKeys(reference);
      if (!Array.isArray(keys)) {
        if ((keys as { kind: 'error'; code: string }).code === '#LIMIT!') throw new RangeError('Range cut exceeds solver limit');
        return { kind: 'range', reference };
      }
      const moved = keys.filter(key => sources.has(encodeCellKey(key)));
      if (moved.length === 0) {
        const start = move(reference.start);
        const end = move(reference.end);
        return start.kind === 'reference' && end.kind === 'reference' ? { kind: 'range', reference: { ...reference, start: start.reference, end: end.reference } } : fail('#REF!');
      }
      if (moved.length !== keys.length) throw new TypeError('Partial range cut is unsupported; preserve inputs');
      const deltas = moved.map(key => {
        const to = sources.get(encodeCellKey(key))!;
        const a = index.position(key)!;
        const b = index.position(to)!;
        return JSON.stringify([to.sheetId, b.row - a.row, b.column - a.column]);
      });
      if (new Set(deltas).size !== 1) throw new TypeError('Non-rectangular range cut is unsupported');
      const start = move(reference.start);
      const end = move(reference.end);
      return start.kind === 'reference' && end.kind === 'reference' ? { kind: 'range', reference: { ...reference, start: start.reference, end: end.reference } } : fail('#REF!');
    });
  };
  if (request.kind === 'cut') {
    // Clear first, then destinations win on overlap. External formulas follow content.
    for (const { from } of request.mapping) put(from, { kind: 'literal', value: null });
    for (const record of Object.values(request.snapshot.cells)) {
      const input = record.winner?.input;
      if (!record.deleted && input?.kind === 'formula' && !sources.has(encodeCellKey(record.key)) && !targets.has(encodeCellKey(record.key))) {
        const ast = cutAst(input.ast, record.key);
        if (JSON.stringify(ast) !== JSON.stringify(input.ast)) put(record.key, { ...input, ast });
      }
    }
  }
  for (const { from, to } of request.mapping) {
    const input = read(from);
    put(to, input.kind !== 'formula' ? input : { ...input, context: to,
      ast: request.kind === 'copy' ? relocateFormula(input.ast, from, to, index) : cutAst(input.ast, to) });
  }
  if (changes.size > CORE_LIMITS.batchCells) throw new RangeError('Transform exceeds atomic Core batch limit');
  return [...changes.values()];
}
