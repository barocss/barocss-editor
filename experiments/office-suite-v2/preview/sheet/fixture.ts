import { SheetReplica } from '../../src/collaboration.ts';
import { createWorkbookContext } from '../../src/workbook.ts';
import { ReferenceIndex } from '../../src/references.ts';
import { parseFormula } from '../../src/formula.ts';
import type { CellKey, WorkbookCommand } from '../../src/contracts.ts';

export const PREVIEW_SIZE = Object.freeze({ rows: 32, columns: 12 });
export const PREVIEW_SHEETS = Object.freeze([
  { id: 'sheet-budget', name: 'Budget' }, { id: 'sheet-rates', name: 'Rates' },
]);

/** A real native event bootstrap. No parallel editable data model or storage. */
export function createPreviewReplica(generation: string = globalThis.crypto.randomUUID()): SheetReplica {
  const context = createWorkbookContext({ documentId: 'sheet-preview', workbookId: 'budget-example', generation });
  const replica = new SheetReplica(context, { actorId: 'local-preview-user', sessionId: globalThis.crypto.randomUUID() });
  const add = (command: WorkbookCommand): void => { replica.commit(command); };
  try {
    let previousSheet: string | null = null;
    for (const sheet of PREVIEW_SHEETS) {
      add({ kind: 'sheet.insert', sheetId: sheet.id, name: sheet.name, afterSheetId: previousSheet });
      previousSheet = sheet.id;
      for (const axis of ['row', 'column'] as const) {
        const size = axis === 'row' ? PREVIEW_SIZE.rows : PREVIEW_SIZE.columns;
        for (let i = 0; i < size; i++) add({ kind: 'axis.insert', sheetId: sheet.id, axis, id: `${axis}-${i + 1}`, afterId: i === 0 ? null : `${axis}-${i}` });
      }
    }
    const index = new ReferenceIndex(replica.projection);
    const key = (sheetId: string, row: number, column: number): CellKey => {
      const result = index.keyAt(sheetId, row - 1, column - 1);
      if (!result) throw new Error('Preview bootstrap address is missing');
      return result;
    };
    const cells: readonly [string, number, number, string | number][] = [
      ['sheet-rates', 1, 1, 'Item'], ['sheet-rates', 1, 2, 'Unit price'],
      ['sheet-rates', 2, 1, 'Notebook'], ['sheet-rates', 2, 2, 12],
      ['sheet-rates', 3, 1, 'Pen'], ['sheet-rates', 3, 2, 4],
      ['sheet-budget', 1, 1, 'Item'], ['sheet-budget', 1, 2, 'Quantity'],
      ['sheet-budget', 1, 3, 'Unit price'], ['sheet-budget', 1, 4, 'Total'],
      ['sheet-budget', 2, 1, 'Notebook'], ['sheet-budget', 2, 2, 3],
      ['sheet-budget', 2, 3, '=Rates!B2'], ['sheet-budget', 2, 4, '=B2*C2'],
      ['sheet-budget', 3, 1, 'Pen'], ['sheet-budget', 3, 2, 2],
      ['sheet-budget', 3, 3, '=Rates!B3'], ['sheet-budget', 3, 4, '=B3*C3'],
      ['sheet-budget', 4, 1, 'Total'], ['sheet-budget', 4, 4, '=SUM(D2:D3)'],
      ['sheet-budget', 5, 1, 'Review'], ['sheet-budget', 5, 4, '=IF(D4>40,"Review","Within budget")'],
    ];
    add({ kind: 'cells.commit', changes: cells.map(([sheetId, row, column, value]) => {
      const cell = key(sheetId, row, column);
      return { key: cell, input: typeof value === 'string' && value.startsWith('=') ? parseFormula(value, cell, index) : { kind: 'literal', value } };
    }) });
    return replica;
  } catch (error) { replica.destroy(); throw error; }
}
