/**
 * Table styles: one style, thirteen regions.
 *
 * A paragraph style is a set of formatting and a paragraph either uses it or
 * does not. A *table* style is not one set but thirteen, and which of them
 * reaches a given cell depends on where the cell sits: the header row is bold,
 * every second row is shaded, the first column is bold too, and the cell in the
 * corner belongs to both and needs its own answer. Word calls each of those a
 * conditional format (`tblStylePr`); this file decides which ones reach a cell
 * and in what order they win.
 *
 * **The table asks for them.** A style may define all thirteen regions and a
 * table use none of them: `tblLook` is the table's own list of which regions it
 * wants, which is why the same style looks different on two tables in one
 * document. A table that says nothing gets Word's default — a header row, a
 * first column, and banded rows.
 *
 * **Order is fixed.** Banding is weakest, then the last/first column, then the
 * last/first row, then the corner cells; a later region overrides an earlier one
 * property by property, so a shaded band under a bold header row keeps the band
 * shading and the header's bold. The order is the spec's (ECMA-376 §17.7.6) and
 * it is not negotiable: reverse any pair of it and a built-in style stops
 * looking like itself.
 *
 * **Borders are the exception to "a region formats a cell".** The whole-table
 * region carries the table's own borders — including `insideH`/`insideV`, which
 * are rules *between* cells and belong to no cell in particular. They are
 * applied to the table and resolved onto cells by table-format, the same way the
 * table's direct borders are. Left in the cell layer instead, every cell would
 * take the outer frame as its own and draw it on all four sides.
 */
import {
  betweenBorderAttrs,
  boxBorderAttrs,
  insideBorderAttrs,
  shadingAttrs
} from './formatting';
import type { EffectiveFormat, StyleResolver } from './style-resolver';
import {
  childrenOf,
  indexResources,
  type DocumentAccess,
  type DocumentNode
} from './document-access';
/*
 * The table's *shape* comes from `table-format`, not from the paginator: those two questions — which
 * rows, how many columns — are what a table is, and importing them from the pagination file pulled
 * the whole paginator into anything that drew a table.
 */
import { columnsOf, tableRowsOf } from './table-format';
import type { CellPosition } from './table-format';

/** One region of a table, named as Word names it. */
export type TableStyleRegion =
  | 'wholeTable'
  | 'band1Vert'
  | 'band2Vert'
  | 'band1Horz'
  | 'band2Horz'
  | 'lastCol'
  | 'firstCol'
  | 'lastRow'
  | 'firstRow'
  | 'seCell'
  | 'swCell'
  | 'neCell'
  | 'nwCell';

/** Which regions of its style a table asks for — Word's `tblLook`. */
export interface TableLook {
  firstRow: boolean;
  lastRow: boolean;
  firstColumn: boolean;
  lastColumn: boolean;
  bandedRows: boolean;
  bandedColumns: boolean;
}

/** How many rows and columns make up one band. */
export interface BandSizes {
  row: number;
  column: number;
}

/**
 * What Word gives a table the user inserts: a header row, a first column, and
 * banded rows. A table that records no look at all is one that was never asked
 * the question, and this is the answer Word would have written down.
 */
export const DEFAULT_TABLE_LOOK: TableLook = {
  firstRow: true,
  lastRow: false,
  firstColumn: true,
  lastColumn: false,
  bandedRows: true,
  bandedColumns: false
};

const NO_TABLE_LOOK: TableLook = {
  firstRow: false,
  lastRow: false,
  firstColumn: false,
  lastColumn: false,
  bandedRows: false,
  bandedColumns: false
};

/**
 * The bits a .docx records, which are not all in the same direction: the first
 * four switch a region on, and the last two switch banding *off*. A zero mask
 * therefore means banded in both directions, and always has.
 */
const LOOK_BITS: Array<[number, keyof TableLook, boolean]> = [
  [0x0020, 'firstRow', true],
  [0x0040, 'lastRow', true],
  [0x0080, 'firstColumn', true],
  [0x0100, 'lastColumn', true],
  [0x0200, 'bandedRows', false],
  [0x0400, 'bandedColumns', false]
];

/** The names, with the ones Word's own attributes use as aliases. */
const LOOK_NAMES: Record<string, keyof TableLook> = {
  firstrow: 'firstRow',
  lastrow: 'lastRow',
  firstcolumn: 'firstColumn',
  firstcol: 'firstColumn',
  lastcolumn: 'lastColumn',
  lastcol: 'lastColumn',
  bandedrows: 'bandedRows',
  hband: 'bandedRows',
  bandedcolumns: 'bandedColumns',
  bandedcols: 'bandedColumns',
  vband: 'bandedColumns'
};

/**
 * What a table's `look` asks for.
 *
 * Two spellings, because a document can come from either place: the names a
 * person writes (`firstRow,bandedRows`), and the bitmask a .docx carries
 * (`04A0`). `none` is the third — a table that wants the style's whole-table
 * formatting and none of its regions, which no bitmask spells legibly.
 */
export function parseTableLook(value: unknown): TableLook {
  if (typeof value !== 'string' || value.trim().length === 0) return { ...DEFAULT_TABLE_LOOK };

  const text = value.trim();
  if (text.toLowerCase() === 'none') return { ...NO_TABLE_LOOK };

  const hex = /^(0x)?[0-9a-fA-F]{1,4}$/.exec(text);
  if (hex) {
    const mask = Number.parseInt(text.replace(/^0x/i, ''), 16);
    const look = { ...NO_TABLE_LOOK };
    for (const [bit, flag, on] of LOOK_BITS) {
      look[flag] = (mask & bit) !== 0 ? on : !on;
    }
    return look;
  }

  // A list names everything it wants, so anything unnamed is off.
  const look = { ...NO_TABLE_LOOK };
  for (const part of text.split(/[,\s]+/)) {
    const flag = LOOK_NAMES[part.toLowerCase()];
    if (flag) look[flag] = true;
  }
  return look;
}

/**
 * A look, written back out as the names it asks for.
 *
 * Names rather than the bitmask: what a document records should be readable by
 * whoever opens it, and `firstRow,bandedRows` says what `04A0` means. Both are
 * read back, so a .docx that arrives as a mask stays one until something
 * changes it.
 */
export function formatTableLook(look: TableLook): string {
  const named = (Object.keys(look) as Array<keyof TableLook>).filter((flag) => look[flag]);
  return named.length > 0 ? named.join(',') : 'none';
}

/** The styles a document defines for tables, in the order it defines them. */
export function tableStylesOf(doc: DocumentAccess): Array<{ id: string; name: string }> {
  const styles: Array<{ id: string; name: string }> = [];
  for (const resource of indexResources(doc).values()) {
    if (resource.stype !== 'styleDef' || resource.attributes?.type !== 'table') continue;
    const id = resource.attributes?.id;
    if (typeof id !== 'string') continue;
    const name = resource.attributes?.name;
    styles.push({ id, name: typeof name === 'string' ? name : id });
  }
  return styles;
}

/** The nearest ancestor of a kind, which is how "here" is found in a table. */
function ancestorOf(
  doc: DocumentAccess,
  node: DocumentNode | undefined,
  kinds: string[]
): DocumentNode | undefined {
  let current = node;
  for (let depth = 0; current && depth < 64; depth++) {
    if (kinds.includes(current.stype ?? '')) return current;
    current = current.parentId ? doc.getNode(current.parentId) : undefined;
  }
  return undefined;
}

/** The table an edit is in, found from the cell or block the caret is in. */
export function tableOf(
  doc: DocumentAccess,
  node: DocumentNode | undefined
): DocumentNode | undefined {
  return ancestorOf(doc, node, ['bTable']);
}

/** The cell an edit is in, which is what a cell command means by "here". */
export function cellOf(
  doc: DocumentAccess,
  node: DocumentNode | undefined
): DocumentNode | undefined {
  return ancestorOf(doc, node, ['bTableCell', 'bTableHeaderCell']);
}

/** The band sizes a table declares, never smaller than one row or column. */
export function bandSizesOf(format: EffectiveFormat): BandSizes {
  const size = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
  return { row: size(format.rowBandSize), column: size(format.columnBandSize) };
}

/**
 * Which band an index falls in, counting from the first one that bands.
 *
 * The excluded row or column is the header: banding starts *after* it, so the
 * first row of data is band 1 whether or not the table has a header — a style
 * whose bands are shaded and unshaded shades the same rows either way.
 */
function bandOf(index: number, excluded: number, size: number): number {
  return Math.floor((index - excluded) / Math.max(1, size));
}

/**
 * The regions that reach a cell, lowest precedence first.
 *
 * `wholeTable` always does. The rest depend on where the cell is and on what the
 * table asked for: a first row that the look does not want is an ordinary row,
 * and it bands like one.
 */
export function regionsAt(
  look: TableLook,
  at: CellPosition,
  bands: BandSizes = { row: 1, column: 1 }
): TableStyleRegion[] {
  const regions: TableStyleRegion[] = ['wholeTable'];

  const firstRow = look.firstRow && at.row === 0;
  const lastRow = look.lastRow && at.row + (at.rowspan ?? 1) >= at.rows;
  const firstColumn = look.firstColumn && at.column === 0;
  const lastColumn = look.lastColumn && at.column + (at.colspan ?? 1) >= at.columns;

  // A row or column with a region of its own does not band: the header of a
  // striped table is the header colour, not the first stripe.
  if (look.bandedColumns && !firstColumn && !lastColumn) {
    const band = bandOf(at.column, look.firstColumn ? 1 : 0, bands.column);
    regions.push(band % 2 === 0 ? 'band1Vert' : 'band2Vert');
  }
  if (look.bandedRows && !firstRow && !lastRow) {
    const band = bandOf(at.row, look.firstRow ? 1 : 0, bands.row);
    regions.push(band % 2 === 0 ? 'band1Horz' : 'band2Horz');
  }

  if (lastColumn) regions.push('lastCol');
  if (firstColumn) regions.push('firstCol');
  if (lastRow) regions.push('lastRow');
  if (firstRow) regions.push('firstRow');

  // A corner belongs to a row region and a column region at once, and the style
  // may say what it looks like where they meet. Only where both were asked for:
  // the corner of a first row that the table did not ask for is not a corner.
  if (lastRow && lastColumn) regions.push('seCell');
  if (lastRow && firstColumn) regions.push('swCell');
  if (firstRow && lastColumn) regions.push('neCell');
  if (firstRow && firstColumn) regions.push('nwCell');

  return regions;
}

/** The regions a whole row can be in. The rest are facts about a cell. */
const ROW_REGIONS = new Set<TableStyleRegion>([
  'wholeTable',
  'band1Horz',
  'band2Horz',
  'lastRow',
  'firstRow'
]);

/**
 * The regions that reach a whole row, lowest precedence first.
 *
 * A row is in the same horizontal regions as any of its cells — which row it is
 * decides them — and in none of the vertical ones: being in the first column is
 * a fact about a cell, and a row is every column at once. The position handed
 * down is a cell's because the rule is the same one; everything it says about
 * columns is then dropped.
 */
export function rowRegionsAt(
  look: TableLook,
  row: number,
  rows: number,
  bands: BandSizes = { row: 1, column: 1 }
): TableStyleRegion[] {
  return regionsAt(look, { row, column: 0, rows, columns: 1 }, bands).filter((region) =>
    ROW_REGIONS.has(region)
  );
}

/**
 * Borders and shading: what a region says about the box rather than the text.
 *
 * Every border group, including the interior ones — this is a list of keys to *keep
 * out* of a cell's text layer, so it has to name them all whatever any one node type
 * declares. `boxBorderAttrs()` was the whole set until it was split into the edges a
 * box has, the between-border a block has and the interior a table has; taking the
 * split literally here would have started painting a table-wide inside border onto
 * every cell, which no test would have noticed.
 */
const BOX_KEYS = new Set([
  ...Object.keys(boxBorderAttrs()),
  ...Object.keys(betweenBorderAttrs()),
  ...Object.keys(insideBorderAttrs()),
  ...Object.keys(shadingAttrs())
]);

function without(attrs: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (!keys.has(key)) out[key] = value;
  }
  return out;
}

/**
 * What a table style contributes to one cell.
 *
 * The regions are merged rather than kept apart, and in their order — applying
 * three layers in turn and applying the one object they merge into are the same
 * thing, and every caller wants the answer rather than the working.
 */
export interface CellStyleLayers {
  /** The regions that reached it, lowest precedence first. */
  regions: TableStyleRegion[];
  /** For the cell itself: its shading, its own borders, its geometry. */
  cell: Record<string, unknown>;
  /** For the text in it: everything about the text and nothing about the box. */
  text: Record<string, unknown>;
}

const NO_LAYERS: CellStyleLayers = { regions: [], cell: {}, text: {} };

/**
 * The whole-table region, which formats the table itself.
 *
 * Applied over the table rather than over its cells because that is where its
 * borders mean what they say — see the note at the top of this file.
 */
export function tableStyleLayer(
  styles: StyleResolver,
  table: DocumentNode
): Record<string, unknown> | undefined {
  const styleId = table.attributes?.styleId;
  if (typeof styleId !== 'string') return undefined;
  return styles.conditionalFormatsFor(styleId).get('wholeTable');
}

/**
 * The layers a table style contributes to the cell at a position.
 *
 * `tableFormat` is the table's resolved format, for a caller that already has
 * one — a renderer drawing a cell needs it for the borders anyway, and resolving
 * it once per cell rather than twice is the difference on a long table. Only
 * `look` and the band sizes are read from it, and no region can change either,
 * so passing it with or without the style's own layer is the same.
 */
export function cellStyleLayers(
  styles: StyleResolver,
  table: DocumentNode,
  at: CellPosition,
  tableFormat?: EffectiveFormat
): CellStyleLayers {
  const styleId = table.attributes?.styleId;
  if (typeof styleId !== 'string') return NO_LAYERS;

  const defined = styles.conditionalFormatsFor(styleId);
  if (defined.size === 0) return NO_LAYERS;

  const format = tableFormat ?? styles.resolveNode(table, 'table');
  const regions = regionsAt(parseTableLook(format.look), at, bandSizesOf(format)).filter((region) =>
    defined.has(region)
  );

  const cell: Record<string, unknown> = {};
  const text: Record<string, unknown> = {};
  for (const region of regions) {
    const attrs = defined.get(region)!;
    // The whole table's borders are the *table's* borders, and go on it instead.
    Object.assign(cell, region === 'wholeTable' ? without(attrs, BOX_KEYS) : attrs);
    Object.assign(text, without(attrs, BOX_KEYS));
  }

  return { regions, cell, text };
}

/**
 * What a table style says about a whole row.
 *
 * Shading and borders are left out: they belong to the cells, which already draw
 * them, and a row that painted them too would paint them behind the cells and
 * outside their edges — visible wherever the table is spaced or a cell shades
 * itself differently. What is left is the row's own vocabulary: how tall it is
 * and whether it may break.
 */
export function rowStyleLayer(
  styles: StyleResolver,
  table: DocumentNode,
  row: number,
  rows: number,
  tableFormat?: EffectiveFormat
): Record<string, unknown> {
  const styleId = table.attributes?.styleId;
  if (typeof styleId !== 'string') return {};

  const defined = styles.conditionalFormatsFor(styleId);
  if (defined.size === 0) return {};

  const format = tableFormat ?? styles.resolveNode(table, 'table');
  const layer: Record<string, unknown> = {};
  for (const region of rowRegionsAt(parseTableLook(format.look), row, rows, bandSizesOf(format))) {
    const attrs = defined.get(region);
    if (attrs) Object.assign(layer, without(attrs, BOX_KEYS));
  }
  return layer;
}

/** A row, the table it belongs to, and which row of it it is. */
export interface RowPlacement {
  table: DocumentNode;
  at: { row: number; rows: number };
}

/**
 * Which row of its table a row is.
 *
 * Nothing when it is not a row at all: a header *group* is a row only when it
 * holds cells directly, and one that holds rows is the group its rows are in —
 * which is what `tableRowsOf` already decides, so this asks it rather than
 * deciding again.
 */
export function rowPlacementOf(doc: DocumentAccess, row: DocumentNode): RowPlacement | undefined {
  const parent = row.parentId ? doc.getNode(row.parentId) : undefined;
  const table =
    parent?.stype === 'bTable'
      ? parent
      : parent?.parentId
        ? doc.getNode(parent.parentId)
        : undefined;
  if (table?.stype !== 'bTable') return undefined;

  const rows = tableRowsOf(doc, table);
  const index = rows.findIndex((each) => each.sid === row.sid);
  if (index < 0) return undefined;

  return { table, at: { row: index, rows: rows.length } };
}

/** A row's effective formatting, including what its table's style says about it. */
export function rowFormat(
  styles: StyleResolver,
  doc: DocumentAccess,
  row: DocumentNode
): EffectiveFormat {
  const placement = rowPlacementOf(doc, row);
  const layer = placement
    ? rowStyleLayer(styles, placement.table, placement.at.row, placement.at.rows)
    : {};
  return styles.resolveNodeWith(row, 'table', [layer]);
}

/** A cell, the table it belongs to, and where in that table it sits. */
export interface CellPlacement {
  table: DocumentNode;
  row: DocumentNode;
  at: CellPosition;
}

/**
 * Where a cell sits, found by walking up from it.
 *
 * Nothing on a cell says which row or column it is in — the position is the
 * shape of the tree around it — and both the borders it draws and the regions
 * of a table style that reach it depend on the answer.
 */
export function cellPlacementOf(
  doc: DocumentAccess,
  cell: DocumentNode
): CellPlacement | undefined {
  const row = cell.parentId ? doc.getNode(cell.parentId) : undefined;
  if (!row) return undefined;

  // A header holds its cells directly, with no row between — the schema says so
  // — which makes the group the row.
  const group = row.stype === 'bTableHeader' ? row : row.parentId ? doc.getNode(row.parentId) : undefined;
  const table =
    group?.stype === 'bTable'
      ? group
      : group?.parentId
        ? doc.getNode(group.parentId)
        : undefined;
  if (table?.stype !== 'bTable') return undefined;

  const rows = tableRowsOf(doc, table);
  const index = rows.findIndex((each) => each.sid === row.sid);

  // Counted in columns, not in cells: a merged cell covers more than one, and
  // the one after it starts past the far side of the merge.
  let column = 0;
  for (const each of childrenOf(doc, row)) {
    if (each.sid === cell.sid) break;
    column += Number(each.attributes?.colspan) || 1;
  }

  return {
    table,
    row,
    at: {
      row: index < 0 ? 0 : index,
      column,
      rows: rows.length,
      columns: columnsOf(doc, rows),
      rowspan: Number(cell.attributes?.rowspan) || 1,
      colspan: Number(cell.attributes?.colspan) || 1
    }
  };
}

/**
 * The text layers for a block inside a table cell, if it is inside one.
 *
 * Why a block asks at all: a table style's "header row in bold" is run
 * formatting, and the runs it means are in the paragraphs inside the cell, not
 * on the cell. The cell could carry it as inherited CSS, but only until a
 * paragraph resolved a value of its own — and every paragraph does, because the
 * document defaults give it one.
 */
export function blockStyleLayers(
  doc: DocumentAccess | undefined,
  styles: StyleResolver | undefined,
  block: DocumentNode
): Array<Record<string, unknown>> {
  if (!doc || !styles || !block.parentId) return [];

  // The common case is a block that is not in a table at all, and it costs one
  // lookup to find that out.
  const parent = doc.getNode(block.parentId);
  if (parent?.stype !== 'bTableCell' && parent?.stype !== 'bTableHeaderCell') return [];

  const placement = cellPlacementOf(doc, parent);
  if (!placement) return [];
  return [cellStyleLayers(styles, placement.table, placement.at).text];
}
