import { hasRange } from './guards';
import { Editor, Extension, selectedNodeIds, type Keybinding, type ModelSelection } from '@barocss/editor-core';
import {
  transaction,
  insertTable as insertTableOp,
  insertTableRow,
  deleteTableRow,
  insertTableColumn,
  deleteTableColumn,
  mergeTableCells,
  splitTableCell,
  buildTableGrid,
  findAncestorCell,
  findAncestorTable,
  findCellPosition
} from '@barocss/model';

/**
 * **표에서의 `Tab` — 어느 도구에서나 같은 것.**
 *
 * `word-keymap.ts` 가 원칙을 적어 뒀다: *"키는 제품의 것이고 엔진의 것이 아니다 — `Mod+Alt+1` 은
 * 워드프로세서에서 제목 1이고 FigJam 보드에서는 아무것도 아니다."* 맞다. 그런데 **표에서의 `Tab` 은
 * 제품의 관례가 아니라 그 노드의 관례다** — Word · Google Docs · Notion · 스프레드시트가 전부 같고,
 * 표를 가진 제품이 그것을 각자 정할 여지가 없다.
 *
 * 그래서 이 둘만 여기 있다. `Mod+Alt+i`(아래에 행) 같은 것은 Word 의 발명이고 Word 에 남는다.
 *
 * ## 이것이 없어서 무엇이 안 됐나
 *
 * `nextCell` 은 이 확장이 등록하므로 표를 가진 넷이 다 갖는데, **키를 묶는 곳이
 * `word-keymap.ts` 뿐이었다.** 노트에서 표 안의 `Tab` 은 아무 일도 하지 않았다(브라우저에서 쟀다:
 * 선택이 전후 동일, 표 크기 그대로, 두 번째 글자가 같은 칸에 들어갔다).
 *
 * `when` 이 `inTable` 인 것은 이 확장이 그 맥락을 세우기 때문이다(`onCreate` 의 `setContext`). 그리고
 * 제품 바인딩이 엔진 기본을 **이기므로**(`word-kit.ts` 에 적혀 있다: *"the registry already resolves
 * a conflict by source, and a product's bindings outrank the engine's"*), 기본의
 * `Tab → indentText` 와 부딪히지 않는다 — 표 밖에서는 `inTable` 이 거짓이라 기본이 그대로 산다.
 */
export const TABLE_CELL_KEYBINDINGS: readonly Keybinding[] = [
  { key: 'Tab', command: 'nextCell', when: 'editorFocus && inTable' },
  { key: 'Shift+Tab', command: 'previousCell', when: 'editorFocus && inTable' }
];

export interface TableExtensionOptions {
  enabled?: boolean;
  defaultRows?: number;
  defaultCols?: number;
}

/**
 * Table editing.
 *
 * Structural editing is product-neutral — a table is a table in a document, on a
 * slide and on a web page — so the operations live in `@barocss/model` and this
 * extension only binds them to commands. Formatting (borders, shading, column
 * widths) is a product concern and stays out of here.
 *
 * Every command resolves the current cell from the selection, so a key binding
 * can invoke it with nothing but the caret.
 */
export class TableExtension implements Extension {
  name = 'table';
  priority = 100;
  private _options: TableExtensionOptions;

  constructor(options: TableExtensionOptions = {}) {
    this._options = {
      enabled: true,
      defaultRows: 3,
      defaultCols: 3,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'insertTable',
      execute: async (ed: Editor, payload?: { rows?: number; cols?: number }) => {
        const rows = payload?.rows ?? this._options.defaultRows ?? 3;
        const cols = payload?.cols ?? this._options.defaultCols ?? 3;
        const result = await transaction(ed, [insertTableOp(rows, cols)], {
          applySelectionToView: true
        }).commit();
        return result.success;
      },
      /*
       * The operation needs a **range**: `insertTable` reads `context.selection.current` and
       * throws without one, so with a box selected on a slide this said yes, threw, and the
       * transaction failed silently. A caret is enough — the table lands where it is.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
    });

    const structural: Array<[string, (cellId: string) => any]> = [
      ['insertRowAbove', (cellId) => insertTableRow(cellId, 'before')],
      ['insertRowBelow', (cellId) => insertTableRow(cellId, 'after')],
      ['deleteRow', (cellId) => deleteTableRow(cellId)],
      ['insertColumnLeft', (cellId) => insertTableColumn(cellId, 'before')],
      ['insertColumnRight', (cellId) => insertTableColumn(cellId, 'after')],
      ['deleteColumn', (cellId) => deleteTableColumn(cellId)],
      ['splitCell', (cellId) => splitTableCell(cellId)]
    ];

    for (const [name, build] of structural) {
      (editor as any).registerCommand({
        name,
        execute: async (ed: Editor, payload?: { selection?: ModelSelection; cellId?: string }) => {
          const cellId = payload?.cellId ?? this._currentCellId(ed, payload?.selection);
          if (!cellId) return false;
          const result = await transaction(ed, [build(cellId)], {
            applySelectionToView: true
          }).commit();
          return result.success;
        },
        /**
         * A cell — and, for **one** of these seven, a cell that is actually merged.
         *
         * `splitTableCell` refuses a cell whose `colspan` and `rowspan` are both 1, with the reason
         * written into the operation: *"cell is not merged"*. There is nothing to split. So 셀 나누기
         * lit up over every cell in every table, ran, and did nothing on all but the merged ones —
         * which is a control a reader presses once, gets nothing from, and stops trusting.
         *
         * Found by this package's own conformance run. The other six take any cell and the
         * distinction lives here rather than in seven separate registrations, because six of them
         * genuinely do share one guard.
         */
        canExecute: (ed: Editor, payload?: { selection?: ModelSelection; cellId?: string }) => {
          const cellId = payload?.cellId ?? this._currentCellId(ed, payload?.selection);
          if (!cellId) return false;
          return name !== 'splitCell' || isMerged(ed, cellId);
        }
      });
    }

    (editor as any).registerCommand({
      name: 'mergeCells',
      execute: async (
        ed: Editor,
        payload?: { selection?: ModelSelection; fromCellId?: string; toCellId?: string }
      ) => {
        const range = this._selectedCellRange(ed, payload);
        if (!range) return false;
        const result = await transaction(ed, [mergeTableCells(range.from, range.to)], {
          applySelectionToView: true
        }).commit();
        return result.success;
      },
      canExecute: (ed: Editor, payload?: any) => !!this._selectedCellRange(ed, payload)
    });

    // Tab moves to the next cell; past the last cell it grows the table, which is
    // the behaviour every word processor and spreadsheet shares.
    (editor as any).registerCommand({
      name: 'nextCell',
      execute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        this._moveCell(ed, payload?.selection, 1),
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        !!this._currentCellId(ed, payload?.selection)
    });

    (editor as any).registerCommand({
      name: 'previousCell',
      execute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        this._moveCell(ed, payload?.selection, -1),
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        !!this._currentCellId(ed, payload?.selection)
    });

    this._trackTableContext(editor);
  }

  /**
   * Keep an `inTable` context flag current so key bindings can be scoped to
   * tables. Tab has to mean "next cell" inside a table and "indent" outside it,
   * and a `when` clause is the only place that distinction can live without the
   * key map knowing about tables.
   *
   * The extension owns this because it owns table knowledge — the engine has no
   * concept of a cell.
   */
  private _trackTableContext(editor: Editor): void {
    const update = () => {
      const inTable = !!this._currentCellId(editor);
      if ((editor as any).getContext?.('inTable') !== inTable) {
        (editor as any).setContext?.('inTable', inTable);
      }
    };
    editor.on?.('editor:selection.change', update);
    editor.on?.('editor:selection.model', update);
    editor.on?.('editor:content.change', update);
    update();
  }

  onDestroy(_editor: Editor): void {}

  /** The cell the caret is in, if any. */
  private _currentCellId(editor: Editor, selection?: ModelSelection): string | null {
    const dataStore = (editor as any).dataStore;
    const sel = selection ?? (editor as any).selection;
    if (!dataStore || !sel || sel.type !== 'range') return null;
    return findAncestorCell(dataStore, sel.startNodeId);
  }

  /**
   * The cell range a merge should cover.
   *
   * Three answers, and the third was missing.
   *
   * 1. An explicit pair wins.
   * 2. A `cell` selection — the block a drag across cells makes.
   * 3. A `range` whose two ends sit in different cells, which is what the browser
   *    gives when nothing has taken the drag over.
   *
   * **2 was not here, and `cell` is the selection type that exists for this
   * command.** Merging is the one table operation that cannot be said as "the
   * cell the caret is in", so a set of cells was added to the model for it — and
   * then this asked `type !== 'range'` and threw the set away. It worked in Word
   * and Slides because `office-word/table-commands.ts` bridges: it reads the
   * `cell` selection and hands the two corners in through 1. Site and Note have
   * no such bridge, so the **셀 합치기** in the site's own table menu could not be
   * pressed after a drag.
   *
   * The fix is here rather than a third bridge. `nodeIds` is in document order,
   * so its first and last are opposite corners of the rectangle by construction —
   * exactly what `mergeTableCells` wants, and exactly what the bridge computes.
   */
  private _selectedCellRange(
    editor: Editor,
    payload?: { selection?: ModelSelection; fromCellId?: string; toCellId?: string }
  ): { from: string; to: string } | null {
    if (payload?.fromCellId && payload?.toCellId) {
      return { from: payload.fromCellId, to: payload.toCellId };
    }
    const dataStore = (editor as any).dataStore;
    const sel = payload?.selection ?? (editor as any).selection;
    if (!dataStore || !sel) return null;

    if (sel.type === 'cell') {
      const ids = selectedNodeIds(sel);
      // One cell is a set of one, and a set of one is not a merge.
      if (ids.length < 2) return null;
      return { from: ids[0], to: ids[ids.length - 1] };
    }

    if (sel.type !== 'range') return null;

    const from = findAncestorCell(dataStore, sel.startNodeId);
    const to = findAncestorCell(dataStore, sel.endNodeId);
    if (!from || !to || from === to) return null;
    return { from, to };
  }

  /**
   * Move the caret one cell forward or back in reading order.
   *
   * Returns false at the start of the table so Shift+Tab can fall through to
   * whatever the product wants; moving past the last cell appends a row instead,
   * which is how tables get grown in practice.
   */
  private _moveCell(editor: Editor, selection: ModelSelection | undefined, delta: 1 | -1): boolean {
    const dataStore = (editor as any).dataStore;
    const cellId = this._currentCellId(editor, selection);
    if (!dataStore || !cellId) return false;

    const tableId = findAncestorTable(dataStore, cellId);
    if (!tableId) return false;

    const grid = buildTableGrid(dataStore, tableId);
    const at = findCellPosition(grid, cellId);
    if (!at) return false;

    // Walk the grid, skipping slots covered by a span so a merged cell is
    // visited once rather than once per slot it occupies.
    let row = at.row;
    let column = at.column;
    for (;;) {
      column += delta;
      if (column >= grid.columnCount) {
        column = 0;
        row += 1;
      } else if (column < 0) {
        column = grid.columnCount - 1;
        row -= 1;
      }

      if (row < 0) return false;
      if (row >= grid.rowIds.length) {
        if (delta === -1) return false;
        void editor.executeCommand('insertRowBelow', { cellId });
        return true;
      }

      const slot = grid.slots[row][column];
      if (slot?.sid && slot.isOrigin) {
        this._placeCaretIn(editor, slot.sid);
        return true;
      }
    }
  }

  /** Put the caret at the start of a cell's first text node. */
  private _placeCaretIn(editor: Editor, cellId: string): void {
    const dataStore = (editor as any).dataStore;
    const findFirstText = (nodeId: string, depth = 0): string | null => {
      if (depth > 8) return null;
      const node = dataStore.getNode(nodeId);
      if (!node) return null;
      if (typeof node.text === 'string') return node.sid ?? null;
      for (const childId of (node.content as string[]) ?? []) {
        const found = findFirstText(childId, depth + 1);
        if (found) return found;
      }
      return null;
    };

    const textId = findFirstText(cellId);
    if (!textId) return;
    editor.updateSelection?.({
      type: 'range',
      startNodeId: textId,
      startOffset: 0,
      endNodeId: textId,
      endOffset: 0,
      collapsed: true
    } as ModelSelection);
  }
}

export function createTableExtension(options?: TableExtensionOptions): TableExtension {
  return new TableExtension(options);
}

/**
 * Whether a cell spans more than one — the only kind there is anything to split in.
 *
 * The same question `splitTableCell` asks before refusing, asked where a control can see the answer.
 * A default of 1 for both, which is what the schema declares and what a cell that has never been
 * merged carries.
 */
function isMerged(editor: Editor, cellId: string): boolean {
  const cell = editor.dataStore?.getNode(cellId);
  const attrs = (cell?.attributes ?? {}) as { colspan?: number; rowspan?: number };
  return (attrs.colspan ?? 1) > 1 || (attrs.rowspan ?? 1) > 1;
}
