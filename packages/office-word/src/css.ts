/**
 * Turning a resolved Word format into CSS.
 *
 * The model stores Word's units — twips for lengths, half-points for font size —
 * because that is what makes a .docx round-trip lossless. The browser wants
 * points and pixels, so the conversion happens here, at the edge, rather than by
 * storing CSS in the document and losing fidelity on the way in.
 *
 *   1 twip  = 1/1440 inch = 1/20 point
 *   1 half-point = 1/2 point
 *
 * Points are emitted rather than pixels: a word processor's zoom is a viewport
 * concern, and `pt` keeps the document's own measurements visible in the DOM.
 */
import type { EffectiveFormat } from './style-resolver';

export type CssStyle = Record<string, string>;

/** Twips → points. */
export const twipToPt = (twip: number): number => twip / 20;

/** Twips → CSS length. */
export const twipToCss = (twip: number): string => `${round(twipToPt(twip))}pt`;

/**
 * Twips → CSS pixels.
 *
 * Layout arithmetic has to happen in one unit, and the browser reports geometry
 * in px. The ratio is fixed — CSS defines 1in as 96px regardless of the display
 * or the zoom level — so this is exact, not an approximation of the rendering.
 */
export const twipToPx = (twip: number): number => (twip / 1440) * 96;

/** Half-points → CSS length. */
export const halfPointToCss = (halfPoint: number): string => `${round(halfPoint / 2)}pt`;

const round = (value: number): number => Math.round(value * 100) / 100;

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const bool = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const TEXT_ALIGN: Record<string, string> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'justify',
  distribute: 'justify'
};

const BORDER_STYLE: Record<string, string> = {
  none: 'none',
  single: 'solid',
  thick: 'solid',
  double: 'double',
  dashed: 'dashed',
  dotted: 'dotted',
  wave: 'solid'
};

/** One border edge, if the format describes it. */
function borderCss(format: EffectiveFormat, prefix: string): string | undefined {
  const style = str(format[`${prefix}Style`]);
  if (!style || style === 'none') return undefined;
  // Word stores border width in eighths of a point.
  const width = num(format[`${prefix}Width`]);
  const color = str(format[`${prefix}Color`]) ?? 'currentColor';
  const cssWidth = width !== undefined ? `${round(width / 8)}pt` : '1pt';
  return `${cssWidth} ${BORDER_STYLE[style] ?? 'solid'} ${color}`;
}

function applyBorders(out: CssStyle, format: EffectiveFormat): void {
  for (const [prefix, property] of [
    ['borderTop', 'borderTop'],
    ['borderBottom', 'borderBottom'],
    ['borderLeft', 'borderLeft'],
    ['borderRight', 'borderRight']
  ] as const) {
    const value = borderCss(format, prefix);
    if (value) out[property] = value;
  }
}

/**
 * Paragraph-level CSS: alignment, indentation, spacing and decoration.
 *
 * Pagination properties (keepNext, widowControl, pageBreakBefore) are not
 * emitted: they are instructions to a paginator, and a browser that honours
 * `break-inside` in a scrolling view would produce something that is neither
 * paginated nor continuous.
 */
export function paragraphCss(format: EffectiveFormat): CssStyle {
  const out: CssStyle = {};

  const alignment = str(format.alignment);
  if (alignment && TEXT_ALIGN[alignment]) out.textAlign = TEXT_ALIGN[alignment];

  const indentLeft = num(format.indentLeft);
  if (indentLeft !== undefined) out.marginLeft = twipToCss(indentLeft);
  const indentRight = num(format.indentRight);
  if (indentRight !== undefined) out.marginRight = twipToCss(indentRight);

  // A hanging indent is a negative first line against a matching left margin —
  // the two properties are one idea in Word and two in CSS.
  const hanging = num(format.indentHanging);
  const firstLine = num(format.indentFirstLine);
  if (hanging !== undefined && hanging > 0) {
    out.textIndent = `-${round(twipToPt(hanging))}pt`;
    out.paddingLeft = twipToCss(hanging);
  } else if (firstLine !== undefined) {
    out.textIndent = twipToCss(firstLine);
  }

  // Emitted even when unset, because unset means zero here, not "whatever the
  // browser thinks". A `<p>` carries a 1em margin from the UA stylesheet, so
  // leaving the property off gave every paragraph spacing that no style asked
  // for — invisible until the layout measured the document and found it taller
  // than the model said it was.
  out.marginTop = twipToCss(num(format.spacingBefore) ?? 0);
  out.marginBottom = twipToCss(num(format.spacingAfter) ?? 0);

  const line = num(format.spacingLine);
  if (line !== undefined) {
    const rule = str(format.spacingLineRule) ?? 'auto';
    // 'auto' counts in 240ths of a line; the others are absolute twips.
    out.lineHeight = rule === 'auto' ? String(round(line / 240)) : twipToCss(line);
  }

  if (str(format.textDirection) === 'rtl') out.direction = 'rtl';

  const shading = str(format.shadingFill);
  if (shading && shading !== 'auto') out.backgroundColor = normalizeColor(shading);

  applyBorders(out, format);
  return out;
}

/** Character-level CSS. */
export function characterCss(format: EffectiveFormat): CssStyle {
  const out: CssStyle = {};

  const family = str(format.fontFamily);
  if (family) out.fontFamily = family;

  const size = num(format.fontSize);
  if (size !== undefined) out.fontSize = halfPointToCss(size);

  // Explicit false matters: a style may switch bold off for a run inside a
  // heading, and leaving the property out would inherit it back.
  const boldValue = bool(format.bold);
  if (boldValue !== undefined) out.fontWeight = boldValue ? 'bold' : 'normal';
  const italicValue = bool(format.italic);
  if (italicValue !== undefined) out.fontStyle = italicValue ? 'italic' : 'normal';

  const decorations: string[] = [];
  const underline = str(format.underline);
  if (underline && underline !== 'none') decorations.push('underline');
  if (bool(format.strike)) decorations.push('line-through');
  if (bool(format.doubleStrike)) decorations.push('line-through');
  if (decorations.length > 0) {
    out.textDecoration = decorations.join(' ');
    if (underline === 'double') out.textDecorationStyle = 'double';
    if (underline === 'dotted') out.textDecorationStyle = 'dotted';
    if (underline === 'wave') out.textDecorationStyle = 'wavy';
    const underlineColor = str(format.underlineColor);
    if (underlineColor) out.textDecorationColor = normalizeColor(underlineColor);
  }

  const color = str(format.color);
  if (color) out.color = normalizeColor(color);
  const highlight = str(format.highlight);
  if (highlight && highlight !== 'none') out.backgroundColor = normalizeColor(highlight);

  if (bool(format.smallCaps)) out.fontVariant = 'small-caps';
  if (bool(format.allCaps)) out.textTransform = 'uppercase';
  // Hidden text still occupies the model; the product decides whether to reveal it.
  if (bool(format.vanish)) out.display = 'none';

  const spacing = num(format.spacing);
  if (spacing !== undefined) out.letterSpacing = twipToCss(spacing);
  const scale = num(format.scale);
  if (scale !== undefined && scale !== 100) out.transform = `scaleX(${round(scale / 100)})`;

  // `position` raises or lowers without changing size, unlike sup/sub.
  const position = num(format.position);
  if (position !== undefined && position !== 0) {
    out.verticalAlign = `${round(position / 2)}pt`;
  }

  if (bool(format.rtl)) out.direction = 'rtl';
  return out;
}

/** Page setup → the CSS box for one rendered page. */
/**
 * The section as a *flow*, once pages are painted separately.
 *
 * Width and the side margins still come from the section — they decide where
 * lines break, which is the input pagination depends on. The vertical margins do
 * not: the distance from the bottom of one page to the top of the next is what
 * the computed break produces, and baking it in as padding here would apply it
 * once for the whole section instead of once per page.
 */
export function flowCss(format: EffectiveFormat): CssStyle {
  const out: CssStyle = {};
  const landscape = str(format.orientation) === 'landscape';

  const width = num(format.pageWidth);
  const height = num(format.pageHeight);
  if (width !== undefined && height !== undefined) {
    // The section is exactly one page wide including its side margins, so the
    // sheets drawn behind it line up with its edges rather than its text.
    out.boxSizing = 'border-box';
    out.width = twipToCss(landscape ? height : width);
  }

  // The binding takes its room out of the side it is on, on top of whatever
  // margin is already there. The same sum is in `sheetMetrics`, where the lines
  // are broken — a gutter drawn here and not counted there would break lines at
  // one width and draw them at another.
  const gutter = num(format.marginGutter) ?? 0;
  const gutterAtTop = bool(format.gutterAtTop) === true;

  const left = num(format.marginLeft);
  const right = num(format.marginRight);
  if (left !== undefined) out.paddingLeft = twipToCss(left + (gutterAtTop ? 0 : gutter));
  if (right !== undefined) out.paddingRight = twipToCss(right);
  // Nothing for a gutter at the top: the flow has no vertical padding at all —
  // where a page starts is what the computed break produces — so a top gutter is
  // part of the top margin the layout pushes each page down by, and drawing it
  // here as well would count it twice.

  const columns = num(format.columnCount);
  if (columns !== undefined && columns > 1) {
    out.columnCount = String(columns);
    const spacing = num(format.columnSpacing);
    if (spacing !== undefined) out.columnGap = twipToCss(spacing);
    if (bool(format.columnSeparator)) out.columnRule = '1px solid currentColor';
  }

  return out;
}

export function pageCss(format: EffectiveFormat): CssStyle {
  const out: CssStyle = {};
  const landscape = str(format.orientation) === 'landscape';

  const width = num(format.pageWidth);
  const height = num(format.pageHeight);
  if (width !== undefined && height !== undefined) {
    out.width = twipToCss(landscape ? height : width);
    out.minHeight = twipToCss(landscape ? width : height);
  }

  const top = num(format.marginTop);
  const right = num(format.marginRight);
  const bottom = num(format.marginBottom);
  const left = num(format.marginLeft);
  if ([top, right, bottom, left].every((v) => v !== undefined)) {
    out.padding = `${twipToCss(top!)} ${twipToCss(right!)} ${twipToCss(bottom!)} ${twipToCss(left!)}`;
  }

  const columns = num(format.columnCount);
  if (columns !== undefined && columns > 1) {
    out.columnCount = String(columns);
    const spacing = num(format.columnSpacing);
    if (spacing !== undefined) out.columnGap = twipToCss(spacing);
    if (bool(format.columnSeparator)) out.columnRule = '1px solid currentColor';
  }

  applyBorders(out, format);
  return out;
}

/** Table, row and cell CSS. */
export function tableCss(format: EffectiveFormat): CssStyle {
  const out: CssStyle = { borderCollapse: 'collapse' };

  const width = num(format.width);
  const widthType = str(format.widthType) ?? 'auto';
  if (width !== undefined) {
    // Word records percentages in fiftieths of a percent.
    out.width = widthType === 'pct' ? `${round(width / 50)}%` : twipToCss(width);
  }
  if (str(format.layout) === 'fixed') out.tableLayout = 'fixed';

  const alignment = str(format.alignment);
  if (alignment === 'center') out.margin = '0 auto';
  else if (alignment === 'right') out.marginLeft = 'auto';

  const indent = num(format.indent);
  if (indent !== undefined) out.marginLeft = twipToCss(indent);

  const shading = str(format.shadingFill);
  if (shading && shading !== 'auto') out.backgroundColor = normalizeColor(shading);

  applyBorders(out, format);
  return out;
}

/**
 * A row's own formatting.
 *
 * Height is most of what a row has to say and CSS says it as a minimum: a table
 * row grows to fit its cells whatever height it is given. That is exactly Word's
 * `atLeast`, and it is why `exact` cannot be drawn here — clipping what does not
 * fit is the cells' to do, and `rowClipHeight` is what tells them to.
 *
 * `auto` records a height Word ignores. Honouring it would leave every row that
 * once had a fixed height still wearing it after the rule was set back.
 */
export function tableRowCss(format: EffectiveFormat): CssStyle {
  const out: CssStyle = {};

  const height = num(format.height);
  const rule = str(format.heightRule) ?? 'auto';
  if (height !== undefined && height > 0 && rule !== 'auto') out.height = twipToCss(height);

  const shading = str(format.shadingFill);
  if (shading && shading !== 'auto') out.backgroundColor = normalizeColor(shading);

  return out;
}

/**
 * The height a cell in this row must clip its content to, if any.
 *
 * Only `exact` clips, and only a box *inside* the cell can do it: a table cell
 * treats every height as a minimum and ignores its own `overflow`, so a row of
 * 20pt holding three lines of text was measured at 37pt with both set. The cell
 * draws the box; this says how tall.
 */
export function rowClipHeight(format: EffectiveFormat): string | undefined {
  const height = num(format.height);
  if (str(format.heightRule) !== 'exact' || height === undefined || height <= 0) return undefined;
  return twipToCss(height);
}

/**
 * Which way the text in a cell runs.
 *
 * A column header narrow enough to need its label on its side is the reason this
 * exists, and Word names the directions by the axes they run along: `tbRl` reads
 * downwards, `btLr` upwards.
 *
 * Upwards is the awkward one. CSS has a writing mode for it — `sideways-lr` —
 * that browsers only lately agreed on, so it is drawn the way it has always been
 * drawn instead: the downward mode, turned around. The result is the same text,
 * and it renders where `sideways-lr` would be ignored.
 *
 * The `V` spellings are Word's East Asian refinements of the same three
 * directions, and they run the same way; what differs is how upright the
 * individual glyphs stand, which the font decides here.
 */
export function verticalTextCss(direction: string | undefined): CssStyle {
  switch (direction) {
    case 'tbRl':
    case 'tbRlV':
      return { writingMode: 'vertical-rl' };
    case 'tbLrV':
      return { writingMode: 'vertical-lr' };
    case 'btLr':
      return { writingMode: 'vertical-rl', transform: 'rotate(180deg)' };
    default:
      // `lrTb` and `lrTbV` are ordinary lines, and so is anything unrecognised:
      // a direction nobody can draw should read as the text it always was.
      return {};
  }
}

export function tableCellCss(format: EffectiveFormat): CssStyle {
  const out: CssStyle = {};

  const width = num(format.width);
  if (width !== undefined) {
    out.width = str(format.widthType) === 'pct' ? `${round(width / 50)}%` : twipToCss(width);
  }

  const vAlign = str(format.verticalAlign);
  if (vAlign) out.verticalAlign = vAlign === 'center' ? 'middle' : vAlign;

  Object.assign(out, verticalTextCss(str(format.textDirection)));

  const margins = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map((key) =>
    num(format[key])
  );
  if (margins.some((m) => m !== undefined)) {
    out.padding = margins.map((m) => twipToCss(m ?? 0)).join(' ');
  }

  if (bool(format.noWrap)) out.whiteSpace = 'nowrap';

  const shading = str(format.shadingFill);
  if (shading && shading !== 'auto') out.backgroundColor = normalizeColor(shading);

  applyBorders(out, format);
  return out;
}

/**
 * Word writes colours as bare hex (`FF0000`) and uses `auto` for "let the reader
 * decide". Pass anything else through so a product can store CSS colours too.
 */
export function normalizeColor(value: string): string {
  if (value === 'auto') return 'currentColor';
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return value;
}
