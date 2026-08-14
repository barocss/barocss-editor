import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * The six table operations, which had no tests at all.
 *
 * Five hundred lines deciding where a row goes, what a column does to every row
 * at once, and what happens to the cells a merge swallowed — none of it ever
 * run except by the editor. A table is also the one structure where being
 * wrong is invisible until it is badly wrong: a grid stays rectangular right up
 * until it does not, and then every row after the mistake is off by one.
 *
 * So what is asserted throughout is the grid, not the operation's own report of
 * itself: how many rows, how many cells in each, and which text is in which
 * cell. A table that says it inserted a column and left one row short is the
 * fault worth catching, and only counting cells catches it.
 */
describe('table structure', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        bTable: { name: 'bTable', group: 'block', content: 'block+' },
        bTableHeader: { name: 'bTableHeader', group: 'block', content: 'block+' },
        bTableBody: { name: 'bTableBody', group: 'block', content: 'block+' },
        bTableRow: { name: 'bTableRow', group: 'block', content: 'block+' },
        bTableCell: { name: 'bTableCell', group: 'block', content: 'block*' },
        bTableHeaderCell: { name: 'bTableHeaderCell', group: 'block', content: 'block*' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  /**
   * A body-only table of `rows` × `columns`, each cell holding "r{row}c{col}".
   * Cell ids are predictable so a test can name the one it means.
   */
  function table(rows: number, columns: number): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['tbl'] } as INode);
    dataStore.setNode({ sid: 'tbl', stype: 'bTable', content: ['body'], parentId: 'doc-1' } as INode);
    const rowIds: string[] = [];
    for (let r = 0; r < rows; r++) {
      const rowId = `row-${r}`;
      rowIds.push(rowId);
      const cellIds: string[] = [];
      for (let c = 0; c < columns; c++) {
        const cellId = `c-${r}-${c}`;
        cellIds.push(cellId);
        dataStore.setNode({ sid: cellId, stype: 'bTableCell', content: [`p-${r}-${c}`], parentId: rowId } as INode);
        dataStore.setNode({ sid: `p-${r}-${c}`, stype: 'paragraph', content: [`t-${r}-${c}`], parentId: cellId } as INode);
        dataStore.setNode({ sid: `t-${r}-${c}`, stype: 'inline-text', text: `r${r}c${c}`, parentId: `p-${r}-${c}` } as INode);
      }
      dataStore.setNode({ sid: rowId, stype: 'bTableRow', content: cellIds, parentId: 'body' } as INode);
    }
    dataStore.setNode({ sid: 'body', stype: 'bTableBody', content: rowIds, parentId: 'tbl' } as INode);
  }

  const run = async (type: string, payload: Record<string, unknown>) => {
    const op = globalOperationRegistry.get(type);
    expect(op, `${type} is not registered`).toBeDefined();
    return await op!.execute({ type, payload } as any, context);
  };

  const textUnder = (id: string): string => {
    const node = dataStore.getNode(id) as INode;
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    return (node.content ?? []).map(textUnder).join('');
  };

  /** The grid as text, row by row — the only description worth asserting on. */
  const grid = (): string[][] => {
    const rowsOf = (id: string): string[] => {
      const node = dataStore.getNode(id) as INode;
      if (!node) return [];
      if (node.stype === 'bTableRow') return [id];
      return (node.content ?? []).flatMap(rowsOf);
    };
    return rowsOf('tbl').map((rowId) =>
      ((dataStore.getNode(rowId) as INode).content ?? []).map(textUnder)
    );
  };

  describe('rows', () => {
    it('inserts a row after the one the caret is in', async () => {
      table(2, 3);
      await run('insertTableRow', { cellId: 'c-0-1', position: 'after' });

      const after = grid();
      expect(after.length, '행이 늘지 않았습니다').toBe(3);
      expect(after[0]).toEqual(['r0c0', 'r0c1', 'r0c2']);
      expect(after[1], '새 행이 비어 있지 않습니다').toEqual(['', '', '']);
      expect(after[2]).toEqual(['r1c0', 'r1c1', 'r1c2']);
    });

    it('inserts a row before the one the caret is in', async () => {
      table(2, 2);
      await run('insertTableRow', { cellId: 'c-1-0', position: 'before' });

      const after = grid();
      expect(after.length).toBe(3);
      expect(after[1]).toEqual(['', '']);
      expect(after[2]).toEqual(['r1c0', 'r1c1']);
    });

    it('gives the new row as many cells as the table is wide', async () => {
      table(3, 4);
      await run('insertTableRow', { cellId: 'c-1-2', position: 'after' });

      for (const row of grid()) {
        expect(row.length, `행 길이가 어긋났습니다: ${JSON.stringify(grid())}`).toBe(4);
      }
    });

    it('deletes the row the caret is in and no other', async () => {
      table(3, 2);
      await run('deleteTableRow', { cellId: 'c-1-0' });

      expect(grid()).toEqual([
        ['r0c0', 'r0c1'],
        ['r2c0', 'r2c1']
      ]);
    });

    it('refuses to delete the last row rather than leave a table with none', async () => {
      table(1, 2);
      const result = await run('deleteTableRow', { cellId: 'c-0-0' });

      expect(result.ok).toBe(false);
      expect(grid().length, '마지막 행이 지워졌습니다').toBe(1);
    });

    it('refuses outside a table', async () => {
      dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
      dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['t-1'], parentId: 'doc-1' } as INode);
      dataStore.setNode({ sid: 't-1', stype: 'inline-text', text: 'x', parentId: 'p-1' } as INode);

      await expect(run('insertTableRow', { cellId: 't-1' })).rejects.toThrow(/not inside a table/);
      await expect(run('deleteTableRow', { cellId: 't-1' })).rejects.toThrow(/not inside a table/);
    });
  });

  describe('columns', () => {
    it('inserts a column into every row, not just the one the caret is in', async () => {
      table(3, 2);
      await run('insertTableColumn', { cellId: 'c-1-0', position: 'after' });

      const after = grid();
      expect(after.map((row) => row.length), '행마다 열 수가 다릅니다').toEqual([3, 3, 3]);
      expect(after[0]).toEqual(['r0c0', '', 'r0c1']);
      expect(after[1]).toEqual(['r1c0', '', 'r1c1']);
      expect(after[2]).toEqual(['r2c0', '', 'r2c1']);
    });

    it('inserts a column before the caret’s', async () => {
      table(2, 2);
      await run('insertTableColumn', { cellId: 'c-0-1', position: 'before' });

      expect(grid()[0]).toEqual(['r0c0', '', 'r0c1']);
    });

    it('deletes a column from every row', async () => {
      table(3, 3);
      await run('deleteTableColumn', { cellId: 'c-0-1' });

      expect(grid()).toEqual([
        ['r0c0', 'r0c2'],
        ['r1c0', 'r1c2'],
        ['r2c0', 'r2c2']
      ]);
    });

    it('leaves the table rectangular however columns are added and removed', async () => {
      table(3, 3);
      await run('insertTableColumn', { cellId: 'c-0-0', position: 'after' });
      await run('insertTableColumn', { cellId: 'c-2-2', position: 'before' });
      await run('deleteTableColumn', { cellId: 'c-1-0' });

      const widths = new Set(grid().map((row) => row.length));
      expect(widths.size, `표가 직사각형이 아닙니다: ${JSON.stringify(grid())}`).toBe(1);
    });
  });

  describe('merging and splitting cells', () => {
    it('merges two cells across and leaves the row one cell shorter', async () => {
      table(2, 3);
      const result = await run('mergeTableCells', { fromCellId: 'c-0-0', toCellId: 'c-0-1' });
      expect(result.ok).toBe(true);

      const merged = dataStore.getNode('c-0-0') as INode;
      expect(merged.attributes?.colspan, '가로 병합이 기록되지 않았습니다').toBe(2);
      expect(grid()[0].length, '병합했는데 셀 수가 그대로입니다').toBe(2);
    });

    it('keeps the text of both cells it merged', async () => {
      table(2, 3);
      await run('mergeTableCells', { fromCellId: 'c-0-0', toCellId: 'c-0-1' });
      expect(textUnder('c-0-0'), '병합하면서 글자가 사라졌습니다').toContain('r0c0');
      expect(textUnder('c-0-0')).toContain('r0c1');
    });

    it('splits a merged cell back into as many as it spanned', async () => {
      table(2, 3);
      await run('mergeTableCells', { fromCellId: 'c-0-0', toCellId: 'c-0-1' });
      await run('splitTableCell', { cellId: 'c-0-0' });

      const after = grid();
      expect(after[0].length, '나눈 뒤에도 셀 수가 돌아오지 않았습니다').toBe(3);
      const cell = dataStore.getNode('c-0-0') as INode;
      expect(cell.attributes?.colspan ?? 1).toBe(1);
    });

    it('refuses to merge cells that are not in the same table', async () => {
      table(2, 2);
      // A cell that is not in a table at all: the operation must say so rather
      // than build a rectangle out of one corner.
      dataStore.setNode({ sid: 'loose', stype: 'bTableCell', content: [] } as INode);
      const result = await run('mergeTableCells', { fromCellId: 'c-0-0', toCellId: 'loose' });
      expect(result.ok).toBe(false);
    });
  });
});
