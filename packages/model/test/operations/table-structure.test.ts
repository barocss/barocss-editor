import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { SelectionManager } from '@barocss/editor-core';
import { transaction } from '../../src/transaction-dsl';
import {
  insertTableRow,
  deleteTableRow,
  insertTableColumn,
  deleteTableColumn,
  mergeTableCells,
  splitTableCell,
  buildTableGrid
} from '../../src/operations/tableStructure';
import '../../src/operations/register-operations';

/**
 * Table structure editing. Merges are expressed as colspan/rowspan plus removed
 * cells, so a row's child count is not the table's column count — every case
 * here exists because indexing children directly would get it wrong.
 */
describe('table structure operations', () => {
  let ds: DataStore;
  let editor: any;

  const schema = new Schema('t', {
    topNode: 'document',
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      'inline-text': { name: 'inline-text', group: 'inline' },
      bTable: { name: 'bTable', group: 'block', content: '(bTableHeader)? bTableBody+ (bTableFooter)?' },
      bTableHeader: { name: 'bTableHeader', group: 'block', content: 'bTableHeaderCell+' },
      bTableBody: { name: 'bTableBody', group: 'block', content: 'bTableRow+' },
      bTableFooter: { name: 'bTableFooter', group: 'block', content: 'bTableRow+' },
      bTableRow: { name: 'bTableRow', group: 'block', content: 'bTableCell*' },
      bTableCell: {
        name: 'bTableCell',
        group: 'block',
        content: 'inline*',
        attrs: { colspan: { type: 'number', default: 1 }, rowspan: { type: 'number', default: 1 } }
      },
      bTableHeaderCell: {
        name: 'bTableHeaderCell',
        group: 'block',
        content: 'inline*',
        attrs: { colspan: { type: 'number', default: 1 }, rowspan: { type: 'number', default: 1 } }
      }
    },
    marks: {}
  } as any);

  /** A rows x cols body-only table; cell sids are `c{row}{col}`. */
  const buildTable = (rows: number, cols: number) => {
    ds.setNode({ sid: 'doc', stype: 'document', content: ['tbl'], attributes: {} } as any, false);
    ds.setNode({ sid: 'tbl', stype: 'bTable', content: ['body'], parentId: 'doc', attributes: {} } as any, false);
    const rowIds: string[] = [];
    for (let r = 0; r < rows; r++) {
      const rowId = `r${r}`;
      rowIds.push(rowId);
      const cellIds: string[] = [];
      for (let c = 0; c < cols; c++) {
        const cellId = `c${r}${c}`;
        cellIds.push(cellId);
        ds.setNode(
          { sid: cellId, stype: 'bTableCell', content: [`${cellId}t`], parentId: rowId, attributes: { colspan: 1, rowspan: 1 } } as any,
          false
        );
        ds.setNode({ sid: `${cellId}t`, stype: 'inline-text', text: `${r}${c}`, parentId: cellId, attributes: {} } as any, false);
      }
      ds.setNode({ sid: rowId, stype: 'bTableRow', content: cellIds, parentId: 'body', attributes: {} } as any, false);
    }
    ds.setNode({ sid: 'body', stype: 'bTableBody', content: rowIds, parentId: 'tbl', attributes: {} } as any, false);
  };

  const run = (ops: any[]) => transaction(editor, ops).commit();
  const grid = () => buildTableGrid(ds as any, 'tbl');
  const rowCount = () => grid().rowIds.length;
  const colCount = () => grid().columnCount;

  beforeEach(() => {
    ds = new DataStore(undefined, schema);
    editor = {
      dataStore: ds,
      _dataStore: ds,
      selectionManager: new SelectionManager({ dataStore: ds }),
      getActiveSchema: () => schema,
      historyManager: { push: () => {} },
      emit: () => {},
      updateSelection: () => {}
    };
  });

  describe('grid', () => {
    it('expands spans so a column means the same thing in every row', () => {
      buildTable(2, 3);
      ds.updateNode('c00', { attributes: { colspan: 2, rowspan: 1 } } as any, false);
      ds.updateNode('r0', { content: ['c00', 'c02'] } as any, false);

      const g = grid();
      expect(g.columnCount).toBe(3);
      expect(g.slots[0].map((s) => s.sid)).toEqual(['c00', 'c00', 'c02']);
      expect(g.slots[1].map((s) => s.sid)).toEqual(['c10', 'c11', 'c12']);
    });
  });

  describe('rows', () => {
    it('inserts a row after the current one with a full set of cells', async () => {
      buildTable(2, 3);
      const r = await run([insertTableRow('c00', 'after')]);

      expect(r.success).toBe(true);
      expect(rowCount()).toBe(3);
      expect(grid().slots[1].filter((s) => s.sid).length).toBe(3);
    });

    it('inserts before the current row', async () => {
      buildTable(2, 2);
      await run([insertTableRow('c10', 'before')]);

      const g = grid();
      expect(g.rowIds).toHaveLength(3);
      // the new row sits between r0 and r1
      expect(g.slots[2].map((s) => s.sid)).toEqual(['c10', 'c11']);
    });

    it('deletes a row', async () => {
      buildTable(3, 2);
      const r = await run([deleteTableRow('c10')]);

      expect(r.success).toBe(true);
      expect(rowCount()).toBe(2);
      // removeChild detaches rather than deleting, which is what the inverse
      // operation relies on — so assert the structure, not the node map.
      expect(grid().slots.flat().some((s) => s.sid === 'c10')).toBe(false);
    });

    it('refuses to delete the last row rather than leave an invalid table', async () => {
      buildTable(1, 2);
      const r = await run([deleteTableRow('c00')]);

      expect(r.success).toBe(false);
      expect(rowCount()).toBe(1);
    });

    it('shrinks a cell that spans into the deleted row', async () => {
      buildTable(3, 2);
      // c00 spans rows 0-1
      ds.updateNode('c00', { attributes: { colspan: 1, rowspan: 2 } } as any, false);
      ds.updateNode('r1', { content: ['c11'] } as any, false);
      ds.deleteNode('c10');

      await run([deleteTableRow('c11')]);

      expect(ds.getNode('c00')?.attributes?.rowspan).toBe(1);
    });
  });

  describe('columns', () => {
    it('inserts a column into every row', async () => {
      buildTable(3, 2);
      const r = await run([insertTableColumn('c00', 'after')]);

      expect(r.success).toBe(true);
      expect(colCount()).toBe(3);
      for (const row of grid().slots) {
        expect(row.filter((s) => s.sid).length).toBe(3);
      }
    });

    it('widens a spanning cell instead of splitting what the user merged', async () => {
      buildTable(2, 3);
      ds.updateNode('c00', { attributes: { colspan: 2, rowspan: 1 } } as any, false);
      ds.updateNode('r0', { content: ['c00', 'c02'] } as any, false);
      ds.deleteNode('c01');

      // insert inside the span
      await run([insertTableColumn('c10', 'after')]);

      expect(ds.getNode('c00')?.attributes?.colspan).toBe(3);
      expect(colCount()).toBe(4);
    });

    it('deletes a column', async () => {
      buildTable(2, 3);
      const r = await run([deleteTableColumn('c01')]);

      expect(r.success).toBe(true);
      expect(colCount()).toBe(2);
      const remaining = grid().slots.flat().map((s) => s.sid);
      expect(remaining).not.toContain('c01');
      expect(remaining).not.toContain('c11');
    });

    it('narrows a spanning cell rather than deleting the whole merge', async () => {
      buildTable(2, 3);
      ds.updateNode('c00', { attributes: { colspan: 2, rowspan: 1 } } as any, false);
      ds.updateNode('r0', { content: ['c00', 'c02'] } as any, false);
      ds.deleteNode('c01');

      await run([deleteTableColumn('c10')]);

      expect(ds.getNode('c00')).toBeDefined();
      expect(ds.getNode('c00')?.attributes?.colspan).toBe(1);
    });

    it('refuses to delete the last column', async () => {
      buildTable(2, 1);
      const r = await run([deleteTableColumn('c00')]);

      expect(r.success).toBe(false);
      expect(colCount()).toBe(1);
    });
  });

  describe('merge and split', () => {
    it('merges a rectangle and keeps the absorbed content', async () => {
      buildTable(2, 2);
      const r = await run([mergeTableCells('c00', 'c11')]);

      expect(r.errors).toEqual([]);
      expect(r.success).toBe(true);
      const survivor = ds.getNode('c00')!;
      expect(survivor.attributes?.colspan).toBe(2);
      expect(survivor.attributes?.rowspan).toBe(2);
      // text from the absorbed cells came along
      const texts = (survivor.content as string[]).map((id) => ds.getNode(id)?.text);
      expect(texts).toContain('01');
      expect(texts).toContain('11');
      // detached from the grid (removeChild does not delete the node itself)
      expect(grid().slots.flat().some((sl) => sl.sid === 'c11')).toBe(false);
    });

    it('refuses a selection that is not a rectangle', async () => {
      buildTable(3, 3);
      // c00 already spans out of the target range
      ds.updateNode('c00', { attributes: { colspan: 3, rowspan: 1 } } as any, false);
      ds.updateNode('r0', { content: ['c00'] } as any, false);
      ds.deleteNode('c01');
      ds.deleteNode('c02');

      const r = await run([mergeTableCells('c00', 'c10')]);
      expect(r.success).toBe(false);
    });

    it('splits a merged cell back into the slots it took', async () => {
      buildTable(2, 2);
      await run([mergeTableCells('c00', 'c11')]);
      const r = await run([splitTableCell('c00')]);

      expect(r.success).toBe(true);
      expect(ds.getNode('c00')?.attributes?.colspan).toBe(1);
      expect(ds.getNode('c00')?.attributes?.rowspan).toBe(1);
      expect(colCount()).toBe(2);
      expect(rowCount()).toBe(2);
    });

    it('refuses to split a cell that is not merged', async () => {
      buildTable(2, 2);
      const r = await run([splitTableCell('c00')]);
      expect(r.success).toBe(false);
    });
  });
});
