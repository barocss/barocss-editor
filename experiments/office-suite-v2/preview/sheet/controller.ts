import { CORE_LIMITS, encodeCellKey } from '../../src/contracts.ts';
import type { CellInput, CellKey, EventOutcome, WorkbookProjection } from '../../src/contracts.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { CalculationEngine } from '../../src/calculation.ts';
import type { CalculationRead } from '../../src/calculation.ts';
import { diffWorkbook } from '../../src/workbook.ts';
import { ReferenceIndex } from '../../src/references.ts';
import { parseFormula, displayFormula } from '../../src/formula.ts';

export interface Draft {
  readonly key: CellKey;
  readonly generation: string;
  readonly structureEpoch: number;
  readonly text: string;
  readonly composing: boolean;
}
const sameKey = (a: CellKey, b: CellKey): boolean => encodeCellKey(a) === encodeCellKey(b);
const numberText = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Text-to-native input binding only. All formula syntax and evaluation stay native. */
export function inputFromText(text: string, key: CellKey, index: ReferenceIndex): CellInput {
  if (text.length > CORE_LIMITS.textLength) return { kind: 'invalid', source: text, reason: 'Cell input exceeds the native text limit' };
  if (text.startsWith('=')) return parseFormula(text, key, index);
  if (text.startsWith("'")) return { kind: 'literal', value: text.slice(1) };
  if (text === '') return { kind: 'literal', value: null };
  if (/^(true|false)$/i.test(text)) return { kind: 'literal', value: text.toLowerCase() === 'true' };
  if (numberText.test(text) && Number.isFinite(Number(text))) return { kind: 'literal', value: Number(text) };
  return { kind: 'literal', value: text };
}

/** Session controller. Projection/AST are the only document authority. */
export class SheetController {
  private readonly replica: SheetReplica;
  private current: WorkbookProjection;
  private references: ReferenceIndex;
  private readonly calculation: CalculationEngine;
  private calculationReady = true;
  private selectedKey: CellKey;
  private currentDraft: Draft | null = null;
  private structureEpoch = 0;
  private readonly ownEdits: string[] = [];
  message = 'Session only. Reload starts a new example.';

  constructor(replica: SheetReplica) {
    this.replica = replica;
    this.current = replica.projection;
    this.references = new ReferenceIndex(this.current);
    const firstSheet = this.current.sheets.find(sheet => !sheet.deleted);
    const firstKey = firstSheet && this.references.keyAt(firstSheet.id, 0, 0);
    if (!firstKey) throw new Error('Preview requires a native sheet with cells');
    this.selectedKey = firstKey;
    this.calculation = new CalculationEngine(this.current);
    this.recalculate();
  }
  get projection(): WorkbookProjection { return this.current; }
  get index(): ReferenceIndex { return this.references; }
  get selection(): CellKey { return { ...this.selectedKey }; }
  get draft(): Draft | null { return this.currentDraft ? { ...this.currentDraft, key: { ...this.currentDraft.key } } : null; }
  get canUndo(): boolean { return this.ownEdits.length > 0 && !this.currentDraft; }

  private recalculate(): void {
    try { this.calculation.recalculate(); this.calculationReady = true; }
    catch (error) { this.calculationReady = false; this.message = `Calculation refused: ${errorText(error)}`; }
  }
  /** Rebind only from an actual replica projection and Core's exact diff. */
  synchronize(): void {
    const next = this.replica.projection;
    if (next.revision === this.current.revision) return;
    const diff = diffWorkbook(this.current, next);
    if (diff.changedStructureSheetIds.length) this.structureEpoch++;
    this.current = next;
    this.references = new ReferenceIndex(next);
    try {
      this.calculation.update(next, diff, this.calculation.token);
      this.recalculate();
    } catch (error) { this.calculationReady = false; this.message = `Calculation refused: ${errorText(error)}`; }
  }
  read(key: CellKey): CalculationRead {
    return this.calculationReady ? this.calculation.read(key) : { status: 'stale' };
  }
  source(key: CellKey = this.selectedKey): string {
    const input = this.current.cells[encodeCellKey(key)]?.winner?.input;
    if (!input) return '';
    if (input.kind === 'formula') return displayFormula(input.ast, this.references);
    if (input.kind === 'invalid') return input.source;
    if (input.value === null) return '';
    if (typeof input.value === 'boolean') return input.value ? 'TRUE' : 'FALSE';
    if (typeof input.value === 'string' && (input.value === '' || input.value.startsWith('=') || input.value.startsWith("'") || numberText.test(input.value) || /^(true|false)$/i.test(input.value))) return `'${input.value}`;
    return String(input.value);
  }
  address(key: CellKey = this.selectedKey): string {
    return this.references.display({ ...key, absRow: false, absColumn: false, sheetQualified: false });
  }
  select(key: CellKey): boolean {
    if (this.currentDraft?.composing) { this.message = 'Finish text composition before changing cells.'; return false; }
    if (!this.references.position(key)) { this.message = 'Selection refused: missing native cell.'; return false; }
    if (this.currentDraft && !sameKey(key, this.selectedKey)) this.cancel();
    this.selectedKey = { ...key };
    return true;
  }
  move(rows: number, columns: number): boolean {
    const position = this.references.position(this.selectedKey);
    if (!position) return false;
    const key = this.references.keyAt(this.selectedKey.sheetId, position.row + rows, position.column + columns);
    return key ? this.select(key) : false;
  }
  switchSheet(sheetId: string): boolean {
    const key = this.references.keyAt(sheetId, 0, 0);
    return key ? this.select(key) : false;
  }
  startEdit(replacement?: string): boolean {
    if (this.currentDraft) return true;
    this.currentDraft = { key: { ...this.selectedKey }, generation: this.current.context.generation,
      structureEpoch: this.structureEpoch, text: replacement ?? this.source(), composing: false };
    this.message = 'Editing. Enter applies here. Escape cancels.';
    return true;
  }
  setDraft(text: string): void {
    if (this.currentDraft) this.currentDraft = { ...this.currentDraft, text };
  }
  setComposing(composing: boolean): void {
    if (this.currentDraft) this.currentDraft = { ...this.currentDraft, composing };
  }
  cancel(): boolean {
    if (this.currentDraft?.composing) return false;
    this.currentDraft = null;
    this.message = 'Edit cancelled. Cell content is unchanged.';
    return true;
  }
  private reportOutcome(outcome: EventOutcome | undefined): boolean {
    if (outcome?.status === 'applied') return true;
    this.message = outcome?.status === 'refused' ? `Refused: ${outcome.code}` : outcome?.status === 'pending' ? `Pending native dependencies: ${outcome.missing.join(', ')}` : 'Missing native event outcome.';
    return false;
  }
  commit(isComposing = false): boolean {
    const draft = this.currentDraft;
    if (!draft || draft.composing || isComposing) return false;
    this.synchronize();
    if (draft.generation !== this.current.context.generation || draft.structureEpoch !== this.structureEpoch || !sameKey(draft.key, this.selectedKey) || !this.references.position(draft.key)) {
      this.message = 'Draft expired after a document or structure change. Cancel and edit again.';
      return false;
    }
    const input = inputFromText(draft.text, draft.key, this.references);
    if (input.kind === 'invalid') { this.message = `Input refused: ${input.reason}`; return false; }
    try {
      const { event } = this.replica.commit({ kind: 'cell.commit', key: draft.key, input });
      this.synchronize();
      if (!this.reportOutcome(this.current.outcomes[event.eventId])) return false;
      this.ownEdits.push(event.eventId);
      this.currentDraft = null;
      if (this.calculationReady) this.message = 'Applied in this session. Reload discards changes.';
      return true;
    } catch (error) { this.message = `Commit refused: ${errorText(error)}`; return false; }
  }
  undo(): boolean {
    if (this.currentDraft) { this.message = 'Finish or cancel the cell edit before Undo.'; return false; }
    const target = this.ownEdits.at(-1);
    if (!target) { this.message = 'No cell edit from this session to undo.'; return false; }
    try {
      const { event } = this.replica.undo(target);
      this.synchronize();
      if (!this.reportOutcome(this.current.outcomes[event.eventId])) return false;
      this.ownEdits.pop();
      if (this.calculationReady) this.message = 'Your last cell edit was undone in this session.';
      return true;
    } catch (error) { this.message = `Undo refused: ${errorText(error)}`; return false; }
  }
  destroy(): void { this.replica.destroy(); }
}
