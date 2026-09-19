import type { Editor } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { cellPlacementOf, columnsOf, gridOf, installTableBoundaryResize, tableDimensionGrid, tableRowsOf } from '@barocss/office-text';
import { wordTableGridAttributes } from './object-layout';
import { withoutCellBreaks } from './table-cell-pagination';

/** Word dimensions are twips; the shared pointer adapter reports unzoomed pixels. */
export function installWordTableResize(editor: Editor, container: HTMLElement): () => void {
  const dispose = installTableBoundaryResize(container, ({ table, cell, axis }) => {
    const rootId = editor.getRootId();
    const nodeId = table.getAttribute('data-bc-sid')!;
    const cellId = cell.getAttribute('data-bc-sid')!;
    const node = editor.dataStore.getNode(nodeId);
    const cellNode = editor.dataStore.getNode(cellId);
    if (!rootId || !node || !cellNode || !editor.isEditable) return;
    const doc = { rootId, getNode: (id: string) => editor.dataStore.getNode(id) };
    const placement = cellPlacementOf(doc, cellNode);
    if (!placement) return;
    const modelRows = tableRowsOf(doc, node);
    const count = columnsOf(doc, modelRows);
    const measured = Array.from(table.rows[0]?.cells ?? []).flatMap(c => Array.from({ length: c.colSpan }, () => c.offsetWidth * 15 / c.colSpan));
    const grid = tableDimensionGrid(count, gridOf(node.attributes ?? {}), measured, table.offsetWidth * 15);
    const column = placement.at.column + cell.colSpan - 1;
    const originRow = cell.parentElement as HTMLTableRowElement;
    const groupRows = modelRows.filter(item => item.parentId === placement.row.parentId);
    const rowIndex = groupRows.findIndex(item => item.sid === placement.row.sid);
    const targetRow = groupRows[Math.min(groupRows.length - 1, rowIndex + cell.rowSpan - 1)];
    const row = axis === 'row' && targetRow?.sid
      ? Array.from(table.rows).find(item => item.getAttribute('data-bc-sid') === targetRow.sid)
      : originRow;
    if (!row) return;
    // Resize targets come from the boundary, independently of the text/cell
    // selection. An empty covered row still owns its actual lower boundary.
    if (!grid[column]) return;
    const rowId = row.getAttribute('data-bc-sid');
    const rowAttrs = JSON.stringify(rowId ? editor.dataStore.getNode(rowId)?.attributes : undefined);
    const tableAttrs = JSON.stringify(node.attributes);
    const structure = () => JSON.stringify(tableRowsOf(doc, editor.dataStore.getNode(nodeId)!).map(item => [item.sid, item.content]));
    const rowsAtStart = structure();
    const cellAttrs = JSON.stringify(cellNode.attributes);
    const valid = () => editor.isEditable && editor.getRootId() === rootId && table.isConnected
      && !!editor.dataStore.getNode(cellId)
      && JSON.stringify(editor.dataStore.getNode(cellId)?.attributes) === cellAttrs
      && JSON.stringify(editor.dataStore.getNode(nodeId)?.attributes) === tableAttrs
      && structure() === rowsAtStart
      && JSON.stringify(rowId ? editor.dataStore.getNode(rowId)?.attributes : undefined) === rowAttrs;
    return { size: axis === 'column' ? grid[column] / 15 : withoutCellBreaks(table, () => row.offsetHeight), valid,
      commit: size => {
        if (!valid()) return;
        if (axis === 'column') {
          const resized = grid.map((width, index) => index === column ? Math.round(size * 15) : width);
          void transaction(editor, [{ type: 'setAttrs', payload: {
            nodeId, attrs: wordTableGridAttributes(resized)
          } }] as never).commit();
        }
        else if (rowId) void transaction(editor, [{ type: 'setAttrs', payload: {
          nodeId: rowId, attrs: { height: Math.round(size * 15), heightRule: 'atLeast' }
        } }] as never).commit();
      }
    };
  }, () => editor.isEditable);
  const cleanup = () => { dispose(); editor.off('editor:destroy', cleanup); };
  editor.on('editor:destroy', cleanup);
  return cleanup;
}
