/**
 * Table structure operations: rows, columns and cell merging.
 *
 * These are deliberately product-neutral. A table is a table in Word, in a
 * slide and on a web page — only the formatting differs — so the structural
 * editing lives in the shared model rather than in a product kit.
 *
 * The model follows the Office schema:
 *
 *   bTable → (bTableHeader)? bTableBody+ (bTableFooter)?
 *   bTableHeader → bTableHeaderCell+          (a header is one row of cells)
 *   bTableBody / bTableFooter → bTableRow+
 *   bTableRow → bTableCell+
 *
 * Merging is expressed with `colspan` / `rowspan` on the surviving cell and the
 * removal of the cells it swallows, which is how HTML and OOXML both do it. That
 * means a row's cell count is not the table's column count, so every operation
 * here walks the grid rather than indexing the children directly.
 */
import { holdsText } from '@barocss/shared';
import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

type Store = TransactionContext['dataStore'];

interface GridCell {
  /** sid of the cell occupying this slot, or null for a slot covered by a span. */
  sid: string | null;
  /** True when this slot is the cell's own top-left corner. */
  isOrigin: boolean;
}

interface TableGrid {
  /** Row sids in document order, including the header row when present. */
  rowIds: string[];
  /** grid[row][column] — spans expanded, so every slot is addressed. */
  slots: GridCell[][];
  columnCount: number;
}

const attr = (node: any, name: string, fallback = 1): number => {
  const value = node?.attributes?.[name];
  return typeof value === 'number' && value > 0 ? value : fallback;
};

/** Rows of a table, in order, flattening header/body/footer sections. */
function collectRows(dataStore: Store, tableId: string): string[] {
  const table = dataStore.getNode(tableId);
  if (!table || !Array.isArray(table.content)) return [];

  const rows: string[] = [];
  for (const sectionId of table.content as string[]) {
    const section = dataStore.getNode(sectionId);
    if (!section) continue;
    if (section.stype === 'bTableHeader') {
      // A header IS a row: its children are cells, not rows.
      rows.push(sectionId);
      continue;
    }
    for (const rowId of (section.content as string[]) ?? []) rows.push(rowId);
  }
  return rows;
}

/**
 * Expand spans into a dense grid so a "column" means the same thing in every row.
 *
 * Without this, deleting "column 2" would delete the second *child* of each row,
 * which is a different cell in any row that contains a merge.
 */
export function buildTableGrid(dataStore: Store, tableId: string): TableGrid {
  const rowIds = collectRows(dataStore, tableId);
  const slots: GridCell[][] = rowIds.map(() => []);

  const place = (row: number, cellId: string, colspan: number, rowspan: number): void => {
    // Find the first free slot in this row
    let col = 0;
    while (slots[row][col]) col++;
    for (let r = 0; r < rowspan && row + r < rowIds.length; r++) {
      for (let c = 0; c < colspan; c++) {
        slots[row + r][col + c] = { sid: cellId, isOrigin: r === 0 && c === 0 };
      }
    }
  };

  rowIds.forEach((rowId, rowIndex) => {
    const row = dataStore.getNode(rowId);
    for (const cellId of ((row?.content as string[]) ?? [])) {
      const cell = dataStore.getNode(cellId);
      if (!cell) continue;
      place(rowIndex, cellId, attr(cell, 'colspan'), attr(cell, 'rowspan'));
    }
  });

  const columnCount = slots.reduce((max, row) => Math.max(max, row.length), 0);
  // Fill trailing holes so callers can index without guarding
  for (const row of slots) {
    for (let c = 0; c < columnCount; c++) {
      if (!row[c]) row[c] = { sid: null, isOrigin: false };
    }
  }

  return { rowIds, slots, columnCount };
}

/** Locate a cell in the grid. */
export function findCellPosition(
  grid: TableGrid,
  cellId: string
): { row: number; column: number } | null {
  for (let r = 0; r < grid.slots.length; r++) {
    for (let c = 0; c < grid.columnCount; c++) {
      const slot = grid.slots[r][c];
      if (slot.sid === cellId && slot.isOrigin) return { row: r, column: c };
    }
  }
  return null;
}

/** The table a node sits in, walking up from a cell or its content. */
export function findAncestorTable(dataStore: Store, nodeId: string): string | null {
  const seen = new Set<string>([nodeId]);
  let current = dataStore.getNode(nodeId);
  while (current?.parentId) {
    const parent = dataStore.getNode(current.parentId);
    if (!parent?.sid || seen.has(parent.sid)) return null;
    if (parent.stype === 'bTable') return parent.sid;
    seen.add(parent.sid);
    current = parent;
  }
  return null;
}

/** The cell a node sits in. */
export function findAncestorCell(dataStore: Store, nodeId: string): string | null {
  const seen = new Set<string>([nodeId]);
  let current = dataStore.getNode(nodeId);
  if (current && (current.stype === 'bTableCell' || current.stype === 'bTableHeaderCell')) {
    return current.sid ?? null;
  }
  while (current?.parentId) {
    const parent = dataStore.getNode(current.parentId);
    if (!parent?.sid || seen.has(parent.sid)) return null;
    if (parent.stype === 'bTableCell' || parent.stype === 'bTableHeaderCell') return parent.sid;
    seen.add(parent.sid);
    current = parent;
  }
  return null;
}

/** A new, empty cell of the type its row expects. */
function createCell(dataStore: Store, rowId: string, index: number): string {
  const row = dataStore.getNode(rowId);
  const stype = row?.stype === 'bTableHeader' ? 'bTableHeaderCell' : 'bTableCell';
  const cellId = dataStore.content.addChild(
    rowId,
    { stype, attributes: { colspan: 1, rowspan: 1 }, content: [] } as any,
    index
  );
  // Every cell needs a text node for the caret to land in.
  dataStore.content.addChild(cellId, { stype: 'inline-text', text: '' } as any, 0);
  return cellId;
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export const insertTableRow = defineOperationDSL(
  (cellId: string, position: 'before' | 'after' = 'after') =>
    ({ type: 'insertTableRow', payload: { cellId, position } } as any),
  { atom: false, category: 'structure' }
);

defineOperation('insertTableRow', async (operation: any, context: TransactionContext) => {
  const { cellId, position = 'after' } = operation.payload;
  const dataStore = context.dataStore;

  const tableId = findAncestorTable(dataStore, cellId);
  if (!tableId) throw new Error('insertTableRow: not inside a table');

  const grid = buildTableGrid(dataStore, tableId);
  const at = findCellPosition(grid, cellId);
  if (!at) throw new Error('insertTableRow: cell not found in table');

  const referenceRowId = grid.rowIds[at.row];
  const referenceRow = dataStore.getNode(referenceRowId);
  // A header row is a single row by definition; a new row belongs to the body.
  const sectionId =
    referenceRow?.stype === 'bTableHeader' ? null : referenceRow?.parentId ?? null;

  let targetSectionId = sectionId;
  let indexInSection = 0;
  if (sectionId) {
    const section = dataStore.getNode(sectionId);
    const rowsInSection = ((section?.content as string[]) ?? []);
    indexInSection = rowsInSection.indexOf(referenceRowId) + (position === 'after' ? 1 : 0);
  } else {
    // Inserting relative to the header: put the row at the top of the first body.
    const table = dataStore.getNode(tableId);
    targetSectionId =
      ((table?.content as string[]) ?? []).find(
        (id) => dataStore.getNode(id)?.stype === 'bTableBody'
      ) ?? null;
    indexInSection = 0;
  }
  if (!targetSectionId) throw new Error('insertTableRow: no body section to insert into');

  const rowId = dataStore.content.addChild(
    targetSectionId,
    { stype: 'bTableRow', content: [] } as any,
    indexInSection
  );

  // One cell per grid column, so the new row lines up with the ones around it.
  let firstTextId: string | null = null;
  for (let c = 0; c < grid.columnCount; c++) {
    const newCellId = createCell(dataStore, rowId, c);
    if (!firstTextId) {
      firstTextId = ((dataStore.getNode(newCellId)?.content as string[]) ?? [])[0] ?? null;
    }
  }

  return {
    ok: true,
    data: dataStore.getNode(rowId),
    inverse: { type: 'removeChild', payload: { parentId: targetSectionId, childId: rowId } },
    selectionAfter: firstTextId ? { nodeId: firstTextId, offset: 0 } : undefined
  };
});

export const deleteTableRow = defineOperationDSL(
  (cellId: string) => ({ type: 'deleteTableRow', payload: { cellId } } as any),
  { atom: false, category: 'structure' }
);

defineOperation('deleteTableRow', async (operation: any, context: TransactionContext) => {
  const { cellId } = operation.payload;
  const dataStore = context.dataStore;

  const tableId = findAncestorTable(dataStore, cellId);
  if (!tableId) throw new Error('deleteTableRow: not inside a table');

  const grid = buildTableGrid(dataStore, tableId);
  const at = findCellPosition(grid, cellId);
  if (!at) throw new Error('deleteTableRow: cell not found in table');

  // The schema requires at least one row per body section; refuse rather than
  // leave the table invalid and have the commit rejected with a worse message.
  if (grid.rowIds.length <= 1) {
    return { ok: false, error: 'deleteTableRow: a table must keep at least one row' };
  }

  const rowId = grid.rowIds[at.row];
  const row = dataStore.getNode(rowId);

  /**
   * How to put each change back, collected as it is made.
   *
   * A row is not one change: the cells spanning into it from above shrink too,
   * and the row itself comes out of its section. One inverse cannot say both,
   * so this returns a `batch` — which is the whole reason that operation
   * exists. Undo used to do nothing at all here.
   */
  const undo: { type: string; payload: unknown }[] = [];

  // Cells spanning into this row from above must shrink, or the grid tears.
  for (let c = 0; c < grid.columnCount; c++) {
    const slot = grid.slots[at.row][c];
    if (!slot.sid || slot.isOrigin) continue;
    const cell = dataStore.getNode(slot.sid);
    const rowspan = attr(cell, 'rowspan');
    if (rowspan > 1) {
      undo.push({
        type: 'setAttrs',
        payload: { nodeId: slot.sid, attrs: { ...(cell?.attributes ?? {}) }, replace: true }
      });
      dataStore.updateNode(
        slot.sid,
        { attributes: { ...(cell?.attributes ?? {}), rowspan: rowspan - 1 } } as any,
        false
      );
    }
  }

  const parentId = row?.parentId;
  // Where it sat, read before it is taken out — a row put back at the end is a
  // table whose rows have changed order and lost nothing, which is the shape of
  // fault this package keeps producing.
  const owner = row?.stype === 'bTableHeader' ? tableId : parentId;
  const ownerNode = owner ? dataStore.getNode(owner) : null;
  const wasAt = Array.isArray(ownerNode?.content)
    ? (ownerNode!.content as string[]).indexOf(rowId)
    : -1;
  const rowBefore = JSON.parse(JSON.stringify(row));

  if (owner) {
    undo.push({
      type: 'addChild',
      payload: { parentId: owner, child: rowBefore, ...(wasAt >= 0 ? { position: wasAt } : {}) }
    });
    dataStore.content.removeChild(owner, rowId);
  }

  return {
    ok: true,
    data: { removed: rowId },
    // Reversed: the last change made is the first put back.
    ...(undo.length ? { inverse: { type: 'batch', payload: { operations: undo.slice().reverse() } } } : {})
  };
});

// ── Columns ──────────────────────────────────────────────────────────────────

export const insertTableColumn = defineOperationDSL(
  (cellId: string, position: 'before' | 'after' = 'after') =>
    ({ type: 'insertTableColumn', payload: { cellId, position } } as any),
  { atom: false, category: 'structure' }
);

defineOperation('insertTableColumn', async (operation: any, context: TransactionContext) => {
  const { cellId, position = 'after' } = operation.payload;
  const dataStore = context.dataStore;

  const tableId = findAncestorTable(dataStore, cellId);
  if (!tableId) throw new Error('insertTableColumn: not inside a table');

  const grid = buildTableGrid(dataStore, tableId);
  const at = findCellPosition(grid, cellId);
  if (!at) throw new Error('insertTableColumn: cell not found in table');

  const targetColumn = position === 'after' ? at.column + 1 : at.column;
  let firstTextId: string | null = null;
  /** How to put each change back — a cell per row, and any that widened. */
  const undo: { type: string; payload: unknown }[] = [];

  for (let r = 0; r < grid.rowIds.length; r++) {
    const rowId = grid.rowIds[r];
    const slot = grid.slots[r][targetColumn];
    const previous = targetColumn > 0 ? grid.slots[r][targetColumn - 1] : undefined;

    // A cell spanning across the insertion point widens instead of being split:
    // splitting it would change what the user merged.
    if (slot && !slot.isOrigin && previous && previous.sid === slot.sid && slot.sid) {
      const cell = dataStore.getNode(slot.sid);
      undo.push({
        type: 'setAttrs',
        payload: { nodeId: slot.sid, attrs: { ...(cell?.attributes ?? {}) }, replace: true }
      });
      dataStore.updateNode(
        slot.sid,
        { attributes: { ...(cell?.attributes ?? {}), colspan: attr(cell, 'colspan') + 1 } } as any,
        false
      );
      continue;
    }

    // Index among this row's actual children, which is not the grid column.
    const row = dataStore.getNode(rowId);
    const children = ((row?.content as string[]) ?? []);
    let insertIndex = children.length;
    for (let c = targetColumn; c < grid.columnCount; c++) {
      const candidate = grid.slots[r][c];
      if (candidate?.sid && candidate.isOrigin) {
        const found = children.indexOf(candidate.sid);
        if (found >= 0) {
          insertIndex = found;
          break;
        }
      }
    }

    const newCellId = createCell(dataStore, rowId, insertIndex);
    undo.push({ type: 'removeChild', payload: { parentId: rowId, childId: newCellId } });
    if (!firstTextId) {
      firstTextId = ((dataStore.getNode(newCellId)?.content as string[]) ?? [])[0] ?? null;
    }
  }

  return {
    ok: true,
    data: { tableId, column: targetColumn },
    selectionAfter: firstTextId ? { nodeId: firstTextId, offset: 0 } : undefined,
    // A cell in every row is several changes and one column: see `batch`.
    ...(undo.length ? { inverse: { type: 'batch', payload: { operations: undo.slice().reverse() } } } : {})
  };
});

export const deleteTableColumn = defineOperationDSL(
  (cellId: string) => ({ type: 'deleteTableColumn', payload: { cellId } } as any),
  { atom: false, category: 'structure' }
);

defineOperation('deleteTableColumn', async (operation: any, context: TransactionContext) => {
  const { cellId } = operation.payload;
  const dataStore = context.dataStore;

  const tableId = findAncestorTable(dataStore, cellId);
  if (!tableId) throw new Error('deleteTableColumn: not inside a table');

  const grid = buildTableGrid(dataStore, tableId);
  const at = findCellPosition(grid, cellId);
  if (!at) throw new Error('deleteTableColumn: cell not found in table');

  if (grid.columnCount <= 1) {
    return { ok: false, error: 'deleteTableColumn: a table must keep at least one column' };
  }

  const removed = new Set<string>();
  /** How to put each change back — a cell from every row, and any that narrowed. */
  const undo: { type: string; payload: unknown }[] = [];

  for (let r = 0; r < grid.rowIds.length; r++) {
    const slot = grid.slots[r][at.column];
    if (!slot?.sid || removed.has(slot.sid)) continue;

    const cell = dataStore.getNode(slot.sid);
    const colspan = attr(cell, 'colspan');
    if (colspan > 1) {
      // Spanning cell: narrow it rather than delete the whole merge.
      undo.push({
        type: 'setAttrs',
        payload: { nodeId: slot.sid, attrs: { ...(cell?.attributes ?? {}) }, replace: true }
      });
      dataStore.updateNode(
        slot.sid,
        { attributes: { ...(cell?.attributes ?? {}), colspan: colspan - 1 } } as any,
        false
      );
      removed.add(slot.sid);
      continue;
    }

    const rowId = grid.rowIds[r];
    const owner = dataStore.getNode(slot.sid)?.parentId ?? rowId;
    // Read before it goes, and with the index it sat at: a cell put back at the
    // end of its row is a column that has moved.
    const ownerNode = dataStore.getNode(owner);
    const wasAt = Array.isArray(ownerNode?.content)
      ? (ownerNode!.content as string[]).indexOf(slot.sid)
      : -1;
    undo.push({
      type: 'addChild',
      payload: {
        parentId: owner,
        child: JSON.parse(JSON.stringify(cell)),
        ...(wasAt >= 0 ? { position: wasAt } : {})
      }
    });
    dataStore.content.removeChild(owner, slot.sid);
    removed.add(slot.sid);
  }

  return {
    ok: true,
    data: { tableId, column: at.column },
    ...(undo.length ? { inverse: { type: 'batch', payload: { operations: undo.slice().reverse() } } } : {})
  };
});

// ── Merge and split ──────────────────────────────────────────────────────────

export const mergeTableCells = defineOperationDSL(
  (fromCellId: string, toCellId: string) =>
    ({ type: 'mergeTableCells', payload: { fromCellId, toCellId } } as any),
  { atom: false, category: 'structure' }
);

defineOperation('mergeTableCells', async (operation: any, context: TransactionContext) => {
  const { fromCellId, toCellId } = operation.payload;
  const dataStore = context.dataStore;

  const tableId = findAncestorTable(dataStore, fromCellId);
  if (!tableId) throw new Error('mergeTableCells: not inside a table');
  if (findAncestorTable(dataStore, toCellId) !== tableId) {
    return { ok: false, error: 'mergeTableCells: cells are in different tables' };
  }

  const grid = buildTableGrid(dataStore, tableId);
  const a = findCellPosition(grid, fromCellId);
  const b = findCellPosition(grid, toCellId);
  if (!a || !b) throw new Error('mergeTableCells: cell not found in table');

  const top = Math.min(a.row, b.row);
  const left = Math.min(a.column, b.column);
  const bottom = Math.max(a.row, b.row);
  const right = Math.max(a.column, b.column);

  // The rectangle has to be whole: a cell that only partly overlaps it would
  // have to be split to merge, which silently changes a different merge.
  const inside = new Set<string>();
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const sid = grid.slots[r][c]?.sid;
      if (sid) inside.add(sid);
    }
  }
  for (const sid of inside) {
    const pos = findCellPosition(grid, sid);
    if (!pos) continue;
    const cell = dataStore.getNode(sid);
    const spanRight = pos.column + attr(cell, 'colspan') - 1;
    const spanBottom = pos.row + attr(cell, 'rowspan') - 1;
    if (pos.row < top || pos.column < left || spanRight > right || spanBottom > bottom) {
      return { ok: false, error: 'mergeTableCells: selection is not a rectangle' };
    }
  }

  const survivorId = grid.slots[top][left]?.sid;
  if (!survivorId) throw new Error('mergeTableCells: no cell at the top-left of the range');

  // Content of the absorbed cells moves into the survivor rather than being
  // dropped — merging cells is not meant to delete what was typed in them.
  const survivor = dataStore.getNode(survivorId);
  let appendAt = ((survivor?.content as string[]) ?? []).length;
  /**
   * How to put each change back.
   *
   * Merging moves what was typed in the absorbed cells into the survivor and
   * then takes the cells out — so undoing it has to move the paragraphs home
   * before the cells they belong in are put back, and the cells have to come
   * back at the index they sat at. Three kinds of change, which is why this
   * declared none at all until now.
   */
  const undo: { type: string; payload: unknown }[] = [];

  for (const sid of inside) {
    if (sid === survivorId) continue;
    const cell = dataStore.getNode(sid);
    for (const childId of ((cell?.content as string[]) ?? []).slice()) {
      const child = dataStore.getNode(childId);
      const isEmptyText = holdsText(child) && !child?.text;
      if (isEmptyText) continue;
      const wasAt = ((cell?.content as string[]) ?? []).indexOf(childId);
      undo.push({
        type: 'moveNode',
        payload: { nodeId: childId, newParentId: sid, ...(wasAt >= 0 ? { position: wasAt } : {}) }
      });
      dataStore.moveNode(childId, survivorId, appendAt++);
    }
    const owner = cell?.parentId;
    if (owner) {
      const ownerNode = dataStore.getNode(owner);
      const wasAt = Array.isArray(ownerNode?.content)
        ? (ownerNode!.content as string[]).indexOf(sid)
        : -1;
      // The cell as it stands now — emptied, since its children have already
      // moved out and the steps that carry them home run after this one.
      undo.push({
        type: 'addChild',
        payload: {
          parentId: owner,
          child: JSON.parse(JSON.stringify(dataStore.getNode(sid))),
          ...(wasAt >= 0 ? { position: wasAt } : {})
        }
      });
      dataStore.content.removeChild(owner, sid);
    }
  }

  undo.push({
    type: 'setAttrs',
    payload: { nodeId: survivorId, attrs: { ...(survivor?.attributes ?? {}) }, replace: true }
  });
  dataStore.updateNode(
    survivorId,
    {
      attributes: {
        ...(survivor?.attributes ?? {}),
        colspan: right - left + 1,
        rowspan: bottom - top + 1
      }
    } as any,
    false
  );

  return {
    ok: true,
    data: dataStore.getNode(survivorId),
    ...(undo.length ? { inverse: { type: 'batch', payload: { operations: undo.slice().reverse() } } } : {})
  };
});

export const splitTableCell = defineOperationDSL(
  (cellId: string) => ({ type: 'splitTableCell', payload: { cellId } } as any),
  { atom: false, category: 'structure' }
);

defineOperation('splitTableCell', async (operation: any, context: TransactionContext) => {
  const { cellId } = operation.payload;
  const dataStore = context.dataStore;

  const tableId = findAncestorTable(dataStore, cellId);
  if (!tableId) throw new Error('splitTableCell: not inside a table');

  const cell = dataStore.getNode(cellId);
  const colspan = attr(cell, 'colspan');
  const rowspan = attr(cell, 'rowspan');
  if (colspan === 1 && rowspan === 1) {
    return { ok: false, error: 'splitTableCell: cell is not merged' };
  }

  const grid = buildTableGrid(dataStore, tableId);
  const at = findCellPosition(grid, cellId);
  if (!at) throw new Error('splitTableCell: cell not found in table');

  /** How to put each change back — the spans, and every cell this makes. */
  const undo: { type: string; payload: unknown }[] = [
    { type: 'setAttrs', payload: { nodeId: cellId, attrs: { ...(cell?.attributes ?? {}) }, replace: true } }
  ];

  // The survivor keeps its content; the slots it gave up become empty cells.
  dataStore.updateNode(
    cellId,
    { attributes: { ...(cell?.attributes ?? {}), colspan: 1, rowspan: 1 } } as any,
    false
  );

  for (let r = at.row; r < at.row + rowspan; r++) {
    const rowId = grid.rowIds[r];
    if (!rowId) continue;
    const row = dataStore.getNode(rowId);
    const children = ((row?.content as string[]) ?? []);
    const base = r === at.row ? children.indexOf(cellId) + 1 : 0;
    const count = r === at.row ? colspan - 1 : colspan;
    for (let i = 0; i < count; i++) {
      const madeId = createCell(dataStore, rowId, base + i);
      undo.push({ type: 'removeChild', payload: { parentId: rowId, childId: madeId } });
    }
  }

  return {
    ok: true,
    data: dataStore.getNode(cellId),
    // The cells go first and the spans go back last, which is the order they
    // were made in, reversed. See `batch`.
    inverse: { type: 'batch', payload: { operations: undo.slice().reverse() } }
  };
});
