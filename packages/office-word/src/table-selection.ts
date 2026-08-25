/**
 * Which cells are selected, given the two the reader dragged between.
 *
 * The engine has had a `cell` selection type since selections were written and
 * nothing has ever produced one — declared, accepted by the validator, passed
 * through by `setNode`, and read by no product. This is the arithmetic behind
 * the thing that finally produces one.
 *
 * ## Why a rectangle and not a run
 *
 * A text selection is a run: from here, through everything, to there. Cells are
 * not laid out in a line — dragging from the first cell of one row to the second
 * cell of the next means the four cells of a *block*, not every cell in between,
 * which would take in the whole of the first row. Every table editor works this
 * way and it is the only reading that survives the question "what would merging
 * these do".
 *
 * ## Why it grows
 *
 * A merged cell covers several columns or rows, and a rectangle that clips one
 * in half is not something a reader can act on: `mergeTableCells` refuses a
 * range that is not whole, and refusing after the drag is a selection that says
 * one thing and does another. So the rectangle grows until every cell it touches
 * is inside it — drag onto any part of a merged cell and the whole cell is in,
 * which is what a reader means by touching it.
 *
 * Growing can cascade: taking in a merged cell widens the rectangle, and the
 * wider rectangle may clip a different merge. It settles, because each pass can
 * only grow and the table is finite.
 *
 * ## What it does not do
 *
 * Order the result by anything but the document. A selection is a *set* —
 * `selectedNodeIds` says so — and the order cells were dragged in is not a fact
 * any command here needs.
 */
import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';
import { cellPlacementOf } from '@barocss/office-text';
import { tableRowsOf } from './table-pagination';

/** The rectangle a pair of cells spans, in rows and columns of the table. */
export interface CellRectangle {
  /** The table the cells are in. */
  tableId: string;
  top: number;
  left: number;
  /** Inclusive, and past the far side of any merge that reaches it. */
  bottom: number;
  right: number;
}

const span = (cell: DocumentNode | undefined, key: 'rowspan' | 'colspan'): number =>
  Math.max(1, Number(cell?.attributes?.[key]) || 1);

/** Every cell of the table, with where it sits — the one walk everything here needs. */
function placedCells(
  doc: DocumentAccess,
  table: DocumentNode
): Array<{ cell: DocumentNode; top: number; left: number; bottom: number; right: number }> {
  const placed: Array<{ cell: DocumentNode; top: number; left: number; bottom: number; right: number }> = [];

  tableRowsOf(doc, table).forEach((row, index) => {
    let column = 0;
    for (const cell of childrenOf(doc, row)) {
      const colspan = span(cell, 'colspan');
      const rowspan = span(cell, 'rowspan');
      placed.push({
        cell,
        top: index,
        left: column,
        bottom: index + rowspan - 1,
        right: column + colspan - 1
      });
      column += colspan;
    }
  });

  return placed;
}

/**
 * The rectangle between two cells, grown until it clips no merge.
 *
 * `undefined` when the two are not cells of one table, which is not an error: a
 * drag that leaves the table is a drag that selects text, and the caller decides
 * what to do about it.
 */
export function cellRectangle(
  doc: DocumentAccess,
  fromCellId: string,
  toCellId: string
): CellRectangle | undefined {
  const from = doc.getNode(fromCellId);
  const to = doc.getNode(toCellId);
  if (!from || !to) return undefined;

  const a = cellPlacementOf(doc, from);
  const b = cellPlacementOf(doc, to);
  if (!a || !b || a.table.sid !== b.table.sid) return undefined;

  let top = Math.min(a.at.row, b.at.row);
  let left = Math.min(a.at.column, b.at.column);
  let bottom = Math.max(a.at.row + (a.at.rowspan ?? 1) - 1, b.at.row + (b.at.rowspan ?? 1) - 1);
  let right = Math.max(
    a.at.column + (a.at.colspan ?? 1) - 1,
    b.at.column + (b.at.colspan ?? 1) - 1
  );

  const cells = placedCells(doc, a.table);

  // Grow until a pass changes nothing. Bounded by the table: each pass either
  // widens the rectangle or ends it, and the rectangle cannot exceed the grid.
  for (let pass = 0; pass < cells.length + 1; pass++) {
    let grew = false;

    for (const at of cells) {
      const touches = at.top <= bottom && at.bottom >= top && at.left <= right && at.right >= left;
      if (!touches) continue;
      if (at.top < top) (top = at.top), (grew = true);
      if (at.left < left) (left = at.left), (grew = true);
      if (at.bottom > bottom) (bottom = at.bottom), (grew = true);
      if (at.right > right) (right = at.right), (grew = true);
    }

    if (!grew) break;
  }

  return { tableId: a.table.sid as string, top, left, bottom, right };
}

/** The cells inside a rectangle, in document order. */
export function cellsInRectangle(doc: DocumentAccess, rectangle: CellRectangle): string[] {
  const table = doc.getNode(rectangle.tableId);
  if (!table) return [];

  return placedCells(doc, table)
    .filter(
      (at) =>
        at.top >= rectangle.top &&
        at.bottom <= rectangle.bottom &&
        at.left >= rectangle.left &&
        at.right <= rectangle.right
    )
    .map((at) => at.cell.sid as string)
    .filter((sid): sid is string => typeof sid === 'string');
}

/**
 * The cells a reader selected by dragging from one to another.
 *
 * The whole of it in one call, because every caller wants the set and none of
 * them wants the rectangle on its own.
 */
export function cellsBetween(doc: DocumentAccess, fromCellId: string, toCellId: string): string[] {
  const rectangle = cellRectangle(doc, fromCellId, toCellId);
  return rectangle ? cellsInRectangle(doc, rectangle) : [];
}

/**
 * The rows a set of cells covers, as indices into the table.
 *
 * What "delete row" means when four cells across two rows are selected: both
 * rows, once each. Counted from the cells rather than tracked alongside them,
 * because the selection is a set of cells and anything else would be a second
 * copy of the same fact.
 */
export function rowsCovered(doc: DocumentAccess, cellIds: string[]): number[] {
  const rows = new Set<number>();

  for (const sid of cellIds) {
    const cell = doc.getNode(sid);
    const at = cell ? cellPlacementOf(doc, cell) : undefined;
    if (!at) continue;
    for (let row = at.at.row; row <= at.at.row + (at.at.rowspan ?? 1) - 1; row++) rows.add(row);
  }

  return [...rows].sort((x, y) => x - y);
}

/** The columns a set of cells covers. The other half of `rowsCovered`. */
export function columnsCovered(doc: DocumentAccess, cellIds: string[]): number[] {
  const columns = new Set<number>();

  for (const sid of cellIds) {
    const cell = doc.getNode(sid);
    const at = cell ? cellPlacementOf(doc, cell) : undefined;
    if (!at) continue;
    for (
      let column = at.at.column;
      column <= at.at.column + (at.at.colspan ?? 1) - 1;
      column++
    ) {
      columns.add(column);
    }
  }

  return [...columns].sort((x, y) => x - y);
}

/**
 * The cell an id is in, or is — walking up from wherever the caret is.
 *
 * A pointer lands on a paragraph inside a cell, and a selection names a text
 * node inside that paragraph. Every caller of the arithmetic above starts from
 * one of those, so the walk belongs here rather than in each of them.
 */
export function cellContaining(doc: DocumentAccess, sid: string | undefined): DocumentNode | undefined {
  let node = sid ? doc.getNode(sid) : undefined;

  for (let depth = 0; node && depth < 64; depth++) {
    if (node.stype === 'bTableCell' || node.stype === 'bTableHeaderCell') return node;
    node = node.parentId ? doc.getNode(node.parentId) : undefined;
  }

  return undefined;
}
