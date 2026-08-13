/**
 * A table's own formatting, as CSS.
 *
 * Two parts of Word's table model have no shape in CSS and are what this file is
 * for. The rest — a cell's width, padding, shading and borders — already goes
 * through `tableCellCss`, and the table inherits the same vocabulary.
 *
 * **The grid.** Word stores column widths once, on the table, as a list of
 * twips: `tblGrid`. CSS has no such thing, so it becomes a `<colgroup>` and the
 * table is told to honour it with `table-layout: fixed`. Without that a browser
 * sizes columns from their contents and a document that says its first column is
 * two inches wide silently gets whatever the text asked for.
 *
 * **The inside borders.** `insideH` and `insideV` are rules *between* cells, and
 * CSS has no selector for "between". They are resolved here into borders on the
 * cells themselves — each cell takes the inside rule on the sides that face
 * another cell, and the table's own outer rule on the sides that face out. Doing
 * it any other way means drawing the outer border twice as thick wherever the
 * two meet.
 */
import type { CssStyle } from './css';
import { normalizeColor, twipToCss } from './css';
import type { EffectiveFormat } from './style-resolver';

/** Where a cell sits, which is what decides which of its sides face outwards. */
export interface CellPosition {
  row: number;
  column: number;
  rows: number;
  columns: number;
  /** Merged cells cover more than one, and their far side is the far one's. */
  rowspan?: number;
  colspan?: number;
}

/** One border, as Word stores it. */
interface Border {
  style?: string;
  width?: number;
  color?: string;
}

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** Read one of the borders off a format, by its prefix. */
export function borderOf(format: EffectiveFormat, prefix: string): Border | undefined {
  const style = asString(format[`${prefix}Style`]);
  const width = asNumber(format[`${prefix}Width`]);
  const color = asString(format[`${prefix}Color`]);
  if (!style && width === undefined && !color) return undefined;
  return { style, width, color };
}

/**
 * A border as CSS.
 *
 * Word's width is in eighths of a point, which is not a unit CSS knows; `none`
 * and a missing style both mean no line, and Word writes both.
 */
export function borderCss(border: Border | undefined): string | undefined {
  if (!border) return undefined;
  const style = border.style ?? 'single';
  if (style === 'none' || style === 'nil') return 'none';

  const width = (border.width ?? 4) / 8;
  const line = style === 'double' ? 'double' : style === 'dashed' ? 'dashed'
    : style === 'dotted' ? 'dotted' : 'solid';
  return `${width}pt ${line} ${normalizeColor(border.color ?? 'auto')}`;
}

/**
 * The column widths a table declares, in twips.
 *
 * Empty when it declares none, which is a table whose columns are whatever its
 * contents make them — the browser's default and Word's `auto` layout.
 */
export function gridOf(format: EffectiveFormat): number[] {
  const grid = asString(format.grid);
  if (!grid) return [];
  return grid
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((width) => Number.isFinite(width) && width > 0);
}

/** The table element's own CSS. */
export function tableCss(format: EffectiveFormat): CssStyle {
  const out: CssStyle = {};

  const width = asNumber(format.width);
  if (width !== undefined) {
    out.width = asString(format.widthType) === 'pct' ? `${Math.round(width / 50)}%` : twipToCss(width);
  }

  // Fixed whenever the document says how wide its columns are. Left to itself a
  // browser sizes them from the text, and a declared width means nothing.
  if (asString(format.layout) === 'fixed' || gridOf(format).length > 0) {
    out.tableLayout = 'fixed';
  }

  const alignment = asString(format.alignment);
  if (alignment === 'center') out.margin = '0 auto';
  else if (alignment === 'right') out.marginLeft = 'auto';

  const indent = asNumber(format.indent);
  if (indent !== undefined && indent !== 0) out.marginLeft = twipToCss(indent);

  const spacing = asNumber(format.cellSpacing);
  if (spacing !== undefined && spacing > 0) {
    // Cells cannot be spaced apart while their borders are collapsed together.
    out.borderCollapse = 'separate';
    out.borderSpacing = twipToCss(spacing);
  } else {
    out.borderCollapse = 'collapse';
  }

  const shading = asString(format.shadingFill);
  if (shading && shading !== 'auto') out.backgroundColor = normalizeColor(shading);

  // A right-to-left table is the same table read from the other side: the first
  // column is the rightmost one. The model keeps its columns in document order
  // either way, which is why this is a property of the table and not a different
  // arrangement of its cells — and why the borders resolved onto them still say
  // what they said.
  if (format.bidiVisual === true) out.direction = 'rtl';

  return out;
}

/**
 * The margins a table gives its cells.
 *
 * Word states them once on the table — `tblCellMar` — and a cell may then
 * override any side of it. So they arrive as a layer under the cell's own
 * formatting rather than as CSS: they are a default the cell can beat, and the
 * cascade already knows how to express that.
 *
 * Named differently at each end on purpose, and this is the translation:
 * `cellMarginLeft` is what a table gives, `marginLeft` is what a cell has.
 */
export function cellMargins(table: EffectiveFormat): Record<string, unknown> {
  const layer: Record<string, unknown> = {};
  for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
    const value = asNumber(table[`cellMargin${side}`]);
    if (value !== undefined) layer[`margin${side}`] = value;
  }
  return layer;
}

/**
 * The borders a cell carries, given where it sits.
 *
 * A side that faces another cell takes the table's inside rule; a side that
 * faces out takes its outer one. The cell's own borders, if it has any, win over
 * both — Word resolves it the same way, and a cell that asks for a thick left
 * edge should get one wherever it sits.
 */
export function cellBorders(
  table: EffectiveFormat,
  cell: EffectiveFormat,
  at: CellPosition
): CssStyle {
  const insideH = borderOf(table, 'borderInsideH');
  const insideV = borderOf(table, 'borderInsideV');

  const lastRow = at.row + (at.rowspan ?? 1) >= at.rows;
  const lastColumn = at.column + (at.colspan ?? 1) >= at.columns;

  const pick = (side: string, outer: Border | undefined, inner: Border | undefined) =>
    borderOf(cell, `border${side}`) ?? outer ?? inner;

  const out: CssStyle = {};
  const set = (property: string, border: Border | undefined) => {
    const css = borderCss(border);
    if (css) out[property] = css;
  };

  set('borderTop', pick('Top', at.row === 0 ? borderOf(table, 'borderTop') : undefined, insideH));
  set('borderBottom', pick('Bottom', lastRow ? borderOf(table, 'borderBottom') : undefined, insideH));
  set('borderLeft', pick('Left', at.column === 0 ? borderOf(table, 'borderLeft') : undefined, insideV));
  set('borderRight', pick('Right', lastColumn ? borderOf(table, 'borderRight') : undefined, insideV));

  return out;
}
