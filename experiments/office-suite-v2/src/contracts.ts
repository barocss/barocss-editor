/** Native M0 contract v1. These are domain types, independent of a CRDT provider. */
export const CONTRACT_VERSION = 1;
export const CORE_LIMITS = Object.freeze({
  idLength: 128, textLength: 32768, eventBytes: 1048576,
  dependencies: 100000, events: 100000, batchCells: 10000,
  astDepth: 64, astNodes: 10000,
});

export type EventId = string;
export type SheetId = string;
export type RowId = string;
export type ColumnId = string;
export type ActorId = string;
export type SessionId = string;

export interface WorkbookContext {
  readonly documentId: string;
  readonly workbookId: string;
  readonly generation: string;
  readonly contractVersion: 1;
  readonly engineVersion: 1;
  readonly schemaVersion: 1;
  readonly adapterVersion: 1;
}
export interface EventIdentity {
  readonly eventId: EventId;
  readonly actorId: ActorId;
  readonly sessionId: SessionId;
}
export interface CellKey {
  readonly sheetId: SheetId;
  readonly rowId: RowId;
  readonly columnId: ColumnId;
}
/** JSON tuple encoding avoids delimiter collisions and prototype-property keys. */
export function encodeCellKey(key: CellKey): string {
  return JSON.stringify([key.sheetId, key.rowId, key.columnId]);
}
export function decodeCellKey(encoded: string): CellKey {
  const parts: unknown = JSON.parse(encoded);
  if (!Array.isArray(parts) || parts.length !== 3 ||
      !Array.from(parts).every(part => typeof part === 'string' && part.length > 0 && part.length <= CORE_LIMITS.idLength)) {
    throw new TypeError('Invalid cell key');
  }
  return { sheetId: parts[0], rowId: parts[1], columnId: parts[2] };
}

export interface CellReference extends CellKey {
  readonly absRow: boolean;
  readonly absColumn: boolean;
  /** false: copy uses destination sheet; true: copy retains the named sheet. */
  readonly sheetQualified: boolean;
}
export interface RangeReference {
  readonly start: CellReference;
  readonly end: CellReference;
  readonly policy: 'live-interval';
}
export type FormulaErrorCode = '#REF!' | '#DIV/0!' | '#VALUE!' | '#NAME?' | '#CYCLE!' | '#LIMIT!' | '#UNSUPPORTED!';
export type BinaryOperator = '+' | '-' | '*' | '/' | '^' | '=' | '<>' | '<' | '<=' | '>' | '>=';
export type FormulaNode =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'unary'; readonly operator: '+' | '-'; readonly operand: FormulaNode }
  | { readonly kind: 'binary'; readonly operator: BinaryOperator; readonly left: FormulaNode; readonly right: FormulaNode }
  | { readonly kind: 'call'; readonly name: 'SUM' | 'IF'; readonly arguments: readonly FormulaNode[] }
  | { readonly kind: 'reference'; readonly reference: CellReference }
  | { readonly kind: 'range'; readonly reference: RangeReference }
  | { readonly kind: 'error'; readonly code: FormulaErrorCode }
  | { readonly kind: 'unsupported'; readonly source: string; readonly reason: string };
export type CellInput =
  | { readonly kind: 'literal'; readonly value: number | string | boolean | null }
  | { readonly kind: 'formula'; readonly version: 1; readonly ast: FormulaNode; readonly context: CellKey }
  | { readonly kind: 'invalid'; readonly source: string; readonly reason: string };
export interface CellChange { readonly key: CellKey; readonly input: CellInput }
export type Axis = 'row' | 'column';
export type WorkbookCommand =
  | { readonly kind: 'sheet.insert'; readonly sheetId: SheetId; readonly name: string; readonly afterSheetId: SheetId | null }
  | { readonly kind: 'axis.insert'; readonly sheetId: SheetId; readonly axis: Axis; readonly id: string; readonly afterId: string | null }
  | { readonly kind: 'axis.delete'; readonly sheetId: SheetId; readonly axis: Axis; readonly id: string }
  | { readonly kind: 'cell.commit'; readonly key: CellKey; readonly input: CellInput }
  | { readonly kind: 'cells.commit'; readonly changes: readonly CellChange[] }
  | { readonly kind: 'undo'; readonly targetEventId: EventId }
  | { readonly kind: 'unsupported'; readonly operation: 'row.move' | 'column.move' | 'merge' };
export interface WorkbookEvent extends EventIdentity {
  readonly context: WorkbookContext;
  readonly dependencies: readonly EventId[];
  readonly command: WorkbookCommand;
}
export type ValidationCode = 'INVALID_JSON' | 'LIMIT' | 'INVALID_CONTEXT' | 'INVALID_EVENT' | 'UNKNOWN_COMMAND';
export type ValidationResult =
  | { readonly ok: true; readonly event: WorkbookEvent }
  | { readonly ok: false; readonly code: ValidationCode; readonly message: string };
export type RefusalCode = 'DUPLICATE_ID' | 'MISSING_TARGET' | 'DELETED_TARGET' | 'UNSUPPORTED' |
  'UNDO_SESSION' | 'UNDO_CONFLICT' | 'UNDO_TARGET' | 'ALREADY_UNDONE' | 'CAUSAL_TARGET';
export type EventOutcome =
  | { readonly status: 'applied' }
  | { readonly status: 'pending'; readonly missing: readonly EventId[] }
  | { readonly status: 'refused'; readonly code: RefusalCode; readonly recoverable: boolean };
export interface OrderedIdentity {
  readonly id: string;
  readonly createdBy: EventId;
  readonly afterId: string | null;
  readonly deleted: boolean;
  readonly deletedBy: readonly EventId[];
}
export interface SheetProjection extends OrderedIdentity {
  readonly name: string;
  /** Arrays include tombstones; filter !deleted for displayed order. */
  readonly rows: readonly OrderedIdentity[];
  readonly columns: readonly OrderedIdentity[];
}
export interface CellAlternative {
  readonly eventId: EventId;
  readonly actorId: ActorId;
  readonly sessionId: SessionId;
  readonly input: CellInput;
  readonly state: 'winner' | 'alternative' | 'superseded' | 'undone';
}
export interface CellRecord {
  readonly key: CellKey;
  readonly deleted: boolean;
  readonly winner: CellAlternative | null;
  /** Includes overwritten/undone inputs, even on tombstoned rows/columns. */
  readonly alternatives: readonly CellAlternative[];
}
export interface WorkbookProjection {
  readonly context: WorkbookContext;
  /** Exact canonical context/event encoding; opaque and not a durable receipt. */
  readonly revision: string;
  readonly sheets: readonly SheetProjection[];
  /** Object keys use encodeCellKey; own-property lookup is O(1). */
  readonly cells: Readonly<Record<string, CellRecord>>;
  readonly outcomes: Readonly<Record<EventId, EventOutcome>>;
  readonly eventIds: readonly EventId[];
}
export interface WorkbookDiff {
  readonly changedCellKeys: readonly CellKey[];
  readonly changedStructureSheetIds: readonly SheetId[];
  readonly revision: string;
}
export interface FormulaTransform {
  readonly kind: 'copy' | 'cut';
  readonly mapping: readonly { readonly from: CellKey; readonly to: CellKey }[];
  readonly snapshot: WorkbookProjection;
}
/** Formula owns this pure solver. Submit its complete changes as one cells.commit. */
export type FormulaTransformHook = (request: FormulaTransform) => readonly CellChange[];

/** Frozen runtime API signatures. Implemented by Core in workbook.ts after C. */
export type CreateWorkbookContext = (identity: Pick<WorkbookContext, 'documentId' | 'workbookId' | 'generation'>) => WorkbookContext;
export type ValidateEvent = (value: unknown, context: WorkbookContext) => ValidationResult;
export type CreateEvent = (context: WorkbookContext, identity: EventIdentity, dependencies: readonly EventId[], command: WorkbookCommand) => WorkbookEvent;
export type RequestUndo = (context: WorkbookContext, identity: EventIdentity, dependencies: readonly EventId[], targetEventId: EventId) => WorkbookEvent;
export type ProjectWorkbook = (context: WorkbookContext, events: readonly WorkbookEvent[]) => WorkbookProjection;
export type DiffWorkbook = (before: WorkbookProjection, after: WorkbookProjection) => WorkbookDiff;
