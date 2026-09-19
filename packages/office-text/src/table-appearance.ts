import { type Editor, type Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { childrenOf, type DocumentAccess, type DocumentNode } from './document-access';
import { columnsOf, gridOf, tableRowsOf } from './table-format';
import { cellContaining } from './table-selection';
import { tableOf } from './table-style';
import { registerTableHeaderCommand } from './table-header';

import type { TableTheme } from './table-theme';
export type { TableTheme } from './table-theme';
export interface TableColumnWidthPayload { tableId: string; column: number; width: number; widths?: number[]; }
export interface TableCellBackgroundPayload { cellId?: string; color: string; }
export interface TableThemePayload { tableId: string; theme: TableTheme; }
export interface GrowTableRowsPayload { tableId: string; cellId: string; count: number; }
const access = (editor: Editor): DocumentAccess => ({ rootId: editor.getRootId() ?? '', getNode: id => editor.dataStore.getNode(id) });
const tableAt = (editor: Editor, id?: string) => {
  const node = id ? editor.dataStore.getNode(id) : undefined;
  return node?.stype === 'bTable' ? node : undefined;
};
const cellsFor = (editor: Editor, cellId?: string): DocumentNode[] => {
  const doc = access(editor);
  if (cellId) { const cell = cellContaining(doc, cellId); return cell ? [cell] : []; }
  const selection = editor.selection;
  if (!selection) return [];
  const ids = selection.type === 'range' ? [selection.startNodeId] : selectedNodeIds(selection);
  return [...new Set(ids)].flatMap(id => {
    const table = tableAt(editor, id);
    if (table) return tableRowsOf(doc, table).flatMap(row => childrenOf(doc, row));
    const cell = cellContaining(doc, id);
    return cell ? [cell] : [];
  });
};
const colorValid = (color: unknown): color is string => typeof color === 'string' && (color === '' || /^#?[0-9a-f]{6}$/i.test(color));
const attrsOp = (nodeId: string, attrs: Record<string, unknown>) => ({ type: 'setAttrs', payload: { nodeId, attrs } });
const commit = async (editor: Editor, operations: ReturnType<typeof attrsOp>[]) => operations.length > 0 && (await transaction(editor, operations as never).commit()).success;

/** Product-independent table appearance using the existing portable Office attributes. */
export class TableAppearanceExtension implements Extension {
  name = 'tableAppearance';
  onCreate(editor: Editor): void {
    registerTableHeaderCommand(editor);
    const widthAllowed = (ed: Editor, p?: TableColumnWidthPayload) => {
      const table = tableAt(ed, p?.tableId);
      return !!table && !!p && Number.isInteger(p.column) && p.column >= 0 && p.column < columnsOf(access(ed), tableRowsOf(access(ed), table)) && Number.isFinite(p.width) && p.width >= 32 && p.width <= 1600;
    };
    editor.registerCommand({ name: 'setTableColumnWidth', canExecute: widthAllowed,
      execute: async (ed: Editor, p?: TableColumnWidthPayload) => {
        if (!widthAllowed(ed, p) || !p) return false;
        const table = tableAt(ed, p.tableId)!;
        const count = columnsOf(access(ed), tableRowsOf(access(ed), table));
        const previous = gridOf(table.attributes ?? {});
        const grid = Array.from({ length: count }, (_, i) => previous[i] ?? (Number.isFinite(p.widths?.[i]) && p.widths![i] >= 32 && p.widths![i] <= 1600 ? Math.round(p.widths![i] * 15) : 1800));
        grid[p.column] = Math.round(p.width * 15);
        return commit(ed, [attrsOp(p.tableId, { grid: grid.join(','), layout: 'fixed', width: grid.reduce((a, b) => a + b, 0), widthType: 'dxa' })]);
      }
    });
    const backgroundAllowed = (ed: Editor, p?: TableCellBackgroundPayload) => !!p && colorValid(p.color) && cellsFor(ed, p.cellId).length > 0;
    editor.registerCommand({ name: 'setTableCellBackground', canExecute: backgroundAllowed,
      execute: async (ed: Editor, p?: TableCellBackgroundPayload) => {
        if (!backgroundAllowed(ed, p) || !p) return false;
        return commit(ed, cellsFor(ed, p.cellId).map(cell => attrsOp(cell.sid!, { shadingFill: p.color ? p.color.replace(/^#/, '').toUpperCase() : null, shadingPattern: null, shadingColor: null })));
      }
    });
    const themeAllowed = (ed: Editor, p?: TableThemePayload) => !!tableAt(ed, p?.tableId) && !!p && ['plain', 'striped', 'blue'].includes(p.theme);
    editor.registerCommand({ name: 'setTableTheme', canExecute: themeAllowed,
      execute: async (ed: Editor, p?: TableThemePayload) => {
        if (!themeAllowed(ed, p) || !p) return false;
        const table = tableAt(ed, p.tableId)!;
        const operations = [attrsOp(p.tableId, { theme: p.theme }),
          ...tableRowsOf(access(ed), table).flatMap(row => childrenOf(access(ed), row).map(cell =>
            attrsOp(cell.sid!, { shadingFill: null, shadingPattern: null, shadingColor: null })
          ))];
        return commit(ed, operations);
      }
    });
    const growAllowed = (ed: Editor, p?: GrowTableRowsPayload) => {
      if (!p || !Number.isInteger(p.count) || p.count < 1 || p.count > 100) return false;
      const doc = access(ed);
      const cell = cellContaining(doc, p.cellId);
      return !!tableAt(ed, p.tableId) && tableOf(doc, cell)?.sid === p.tableId;
    };
    editor.registerCommand({ name: 'growTableRows', canExecute: growAllowed,
      execute: async (ed: Editor, p?: GrowTableRowsPayload) => {
        if (!growAllowed(ed, p) || !p) return false;
        const result = await transaction(ed, Array.from({ length: p.count }, () => ({ type: 'insertTableRow', payload: { cellId: p.cellId, position: 'after' } })) as never).commit();
        return result.success;
      }
    });
  }
}
