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

/**
 * The effects Word draws with the font, as the web can draw them.
 *
 * One definition, because they arrive two ways: as a character format, from a
 * style or from direct formatting, and as a mark over a range. A style and a
 * mark saying the same thing have to draw the same, which is the reason
 * `characterCss` is shared between them in the first place.
 *
 * Keyed by the character-format attribute; `mark-format.ts` maps its own names
 * onto these.
 */
export const FONT_EFFECTS: Record<string, CssStyle> = {
  // Hollow glyphs: a ring of shadow with nothing inside it.
  outline: { textShadow: '0 0 1px currentColor', color: 'transparent' },
  shadow: { textShadow: '1px 1px 1px rgba(0,0,0,.4)' },
  // Lit from above and from below — which is the whole difference between them.
  emboss: { textShadow: '0 1px 0 rgba(255,255,255,.7), 0 -1px 0 rgba(0,0,0,.3)' },
  imprint: { textShadow: '0 -1px 0 rgba(255,255,255,.7), 0 1px 0 rgba(0,0,0,.3)' }
};

/**
 * Whether the browser may break a word at the end of a line.
 *
 * Word's `hyphenationAuto` is a document setting and `suppressAutoHyphens` is a
 * paragraph's exception to it — neither had a reader, and neither is any use
 * without the third: a browser hyphenates by dictionary and needs to be told
 * which language the text is in. `lang` had no reader either, so all three
 * arrive together or none of them does anything.
 *
 * `hyphenationZone` — the space Word allows at the end of a line before it
 * reaches for a hyphen — has no equivalent in CSS and is left unread on purpose.
 *
 * This changes line breaking, which is the one thing pagination depends on. It
 * needs no part of it: the pages are measured from the rendered document, so a
 * hyphenated line is measured hyphenated.
 */
export function hyphenationCss(
  auto: boolean,
  format: EffectiveFormat | undefined
): CssStyle {
  const out: CssStyle = {};
  if (!auto) return out;
  // A paragraph may opt out of a document that opted in. `manual` rather than
  // `none`: a soft hyphen the author typed is still a place they chose.
  out.hyphens = bool(format?.suppressAutoHyphens) ? 'manual' : 'auto';
  return out;
}

/**
 * A paragraph's indents, as they fall on the page they land on.
 *
 * `mirrorIndents` says the left and right indents are really *inside* and
 * *outside* — the inside being the edge the binding is on, which changes side
 * every page. It is what makes a bound document look right: the extra room for
 * the spine is on the right of a left-hand page and on the left of a right-hand
 * one, and a paragraph that indents from the spine has to follow.
 *
 * Even pages are left-hand pages, which is the same question `differentOddEven`
 * asks of headers, and asked of the number the page *shows* rather than its
 * index — a section that restarts its numbering restarts which side it is on.
 *
 * Pure, and the sum is unchanged, which is why the paginator needs no part of
 * this: swapping the two leaves the text exactly as wide, so no line breaks
 * anywhere else.
 */
export function mirroredIndents(
  format: EffectiveFormat,
  onEvenPage: boolean
): EffectiveFormat {
  if (!bool(format.mirrorIndents) || !onEvenPage) return format;
  return { ...format, indentLeft: format.indentRight, indentRight: format.indentLeft };
}

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
  /**
   * **Through `normalizeColor`**, which every other colour in this file went through and this did
   * not.
   *
   * Word writes a colour as six hex digits and no `#` — `2C5282` — which is not a CSS colour, so the
   * whole shorthand was invalid and the browser dropped the **entire declaration**: no line at all,
   * not a black one. Every bordered paragraph and every table drawing its rules from a style was
   * affected, and the sample's own `GridTable` states its inside borders exactly that way.
   *
   * Invisible in a unit test, which compares the string this returns; found the first time a bordered
   * paragraph was put in the sample and the *computed* width came back `0px`.
   */
  const color = normalizeColor(str(format[`${prefix}Color`]) ?? 'currentColor');
  const cssWidth = width !== undefined ? `${round(width / 8)}pt` : '1pt';
  return `${cssWidth} ${BORDER_STYLE[style] ?? 'solid'} ${color}`;
}

/**
 * A **page border**: the four edges a section asks for, and nothing else about the page.
 *
 * Separate from `pageCss` on purpose. That one answers *"how big is this page and what room does it
 * leave"* — width, height, padding, columns — and a page border is drawn on the **sheet**, which
 * already knows its size from the layout. Handing it `pageCss` put a width and a padding on a sheet
 * that had both, measured as a sheet the wrong size.
 *
 * `pageSetupAttrs` has carried `boxBorderAttrs()` since the schema was written and `pageCss` has
 * known how to draw them for just as long, and nothing ever called `pageCss` — it was exported and
 * reachable from a console. Twelve of Word's unread attributes were this.
 */
export function pageBorderCss(format: EffectiveFormat): CssStyle {
  const out: CssStyle = {};
  applyBorders(out, format);
  return out;
}

/**
 * The line drawn **between** two blocks that share an edge — Word's fifth border.
 *
 * Exported because the decision is not the format's: a block's top is its own border where it stands
 * alone and this one where its neighbour asks for the same box, and only `sharedBorders` knows
 * which. See `blockStyle`, which is the one caller.
 *
 * `undefined` where the block asks for no `between`, which is Word's answer as well: a bordered box
 * with no between border is one box with no rules inside it, not a box with doubled edges.
 */
export function betweenBorderCss(format: EffectiveFormat): string | undefined {
  return borderCss(format, 'borderBetween');
}

/**
 * The four edges, and the room each one leaves the text.
 *
 * `*Space` — points between the border and what it encloses — was declared on every
 * kind of box and drawn nowhere, so every bordered paragraph in the product had its
 * line hard against the letters. Found by `every-attribute-is-read`.
 *
 * Only where there **is** a border, which is Word's reading too: a space with no line
 * to be spaced from is not a paragraph indent by another name.
 *
 * Added to any padding already there rather than replacing it, in `calc()` because the
 * two are in different units. A hanging indent is a `padding-left` (see
 * `paragraphCss`) and it runs before this: overwriting it would have made a
 * left-bordered list item lose its hang, which is the kind of fault that only shows up
 * in a document nobody has yet.
 */
function applyBorders(out: CssStyle, format: EffectiveFormat): void {
  for (const [prefix, property, padding] of [
    ['borderTop', 'borderTop', 'paddingTop'],
    ['borderBottom', 'borderBottom', 'paddingBottom'],
    ['borderLeft', 'borderLeft', 'paddingLeft'],
    ['borderRight', 'borderRight', 'paddingRight']
  ] as const) {
    const value = borderCss(format, prefix);
    if (!value) continue;
    out[property] = value;

    const space = num(format[`${prefix}Space`]);
    if (space === undefined || space <= 0) continue;
    const already = out[padding];
    out[padding] = already ? `calc(${already} + ${round(space)}pt)` : `${round(space)}pt`;
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

  Object.assign(out, shadingCss(format));

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

  /**
   * The four effects Word draws with the font itself.
   *
   * Outline hollows the glyphs, and shadow, emboss and imprint light them from
   * one side or the other. A browser has no font that does any of it, so each is
   * approximated with a shadow — which is what every other web word processor
   * does, and closer than ignoring them.
   *
   * These were unread. They are also *marks*, and the sweep that finds
   * unread attributes counts a name read for a different meaning as read: the
   * marks `shadowText`, `emboss` and `imprint` made the character *format*
   * attributes of the same names look answered, and they were not. A run that
   * arrived embossed from a style drew flat.
   *
   * Shared with the marks rather than restated, so that a style and a mark
   * saying the same thing draw the same — which is the reason `characterCss`
   * itself is shared.
   */
  for (const [effect, css] of Object.entries(FONT_EFFECTS)) {
    if (bool(format[effect as keyof EffectiveFormat] as unknown)) Object.assign(out, css);
  }

  /**
   * Kerning, which Word stores as the size it starts applying at.
   *
   * Not a switch: `w:kern` is a *minimum font size* in half-points, and zero
   * means off. So the run's own size decides — which is expressible, since CSS
   * has the switch and the comparison can be made here.
   */
  const kerning = num(format.kerning);
  if (kerning !== undefined) {
    const runSize = num(format.fontSize);
    out.fontKerning =
      kerning > 0 && (runSize === undefined || runSize >= kerning) ? 'normal' : 'none';
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

  Object.assign(out, shadingCss(format));

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

  Object.assign(out, shadingCss(format));

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

  Object.assign(out, shadingCss(format));

  applyBorders(out, format);
  return out;
}

/**
 * Word writes colours as bare hex (`FF0000`) and uses `auto` for "let the reader
 * decide". Pass anything else through so a product can store CSS colours too.
 */
/**
 * How much of the pattern colour a percentage shading shows.
 *
 * Word writes these as `pct5`, `pct12`, `pct25` … and a handful of aliases with
 * no number in them at all. The number *is* the answer — `pct25` is a quarter of
 * the pattern colour over the fill — so there is nothing to look up; what needs
 * saying is only what the wordless ones mean.
 */
function patternPercent(pattern: string): number | undefined {
  const numbered = /^pct(\d+)$/.exec(pattern);
  if (numbered) return Math.min(100, Math.max(0, Number(numbered[1])));
  return undefined;
}

/** The stripes, and the angle each one runs at. */
const STRIPES: Record<string, number> = {
  horzStripe: 0,
  thinHorzStripe: 0,
  vertStripe: 90,
  thinVertStripe: 90,
  diagStripe: 45,
  thinDiagStripe: 45,
  reverseDiagStripe: -45,
  thinReverseDiagStripe: -45
};

/** The crosses: two runs of stripes at right angles. */
const CROSSES = new Set([
  'horzCross',
  'thinHorzCross',
  'diagCross',
  'thinDiagCross'
]);

/**
 * A cell's, row's, paragraph's or table's shading, as CSS.
 *
 * Word's shading is three things and this file used to read one of them. `fill`
 * is the background colour, `color` is the colour a *pattern* is drawn in, and
 * `val` says which pattern — and the same two lines were written out four times,
 * each reading `shadingFill` alone. So a document that arrived asking for a 25%
 * grey stipple over white drew as plain white, and `shadingColor` and
 * `shadingPattern` were on the list of attributes the schema declares and nothing
 * reads.
 *
 * What the patterns become:
 *
 * - **`clear`, or nothing** — the fill, and that is all. The overwhelming
 *   majority of real shading.
 * - **`solid`** — the *pattern* colour covers the cell. Word's own reading, and
 *   it surprises people: a solid shading ignores the fill entirely.
 * - **`pctN`** — N% of the pattern colour over the fill. CSS has no stipple, and
 *   a blend is not an approximation of one so much as what a stipple *is* for at
 *   this size: `color-mix` gives the grey the reader expects at any zoom, where a
 *   real dot pattern would alias into stripes.
 * - **stripes and crosses** — a repeating gradient at the angle the name says.
 *   Drawn as `backgroundImage` over the fill, so the fill is still the background
 *   and a pattern is a thing on top of it.
 */
export function shadingCss(format: EffectiveFormat): CssStyle {
  const fill = str(format.shadingFill);
  const color = str(format.shadingColor);
  const pattern = str(format.shadingPattern) ?? 'clear';

  const out: CssStyle = {};
  const background = fill && fill !== 'auto' ? normalizeColor(fill) : undefined;
  if (background) out.backgroundColor = background;

  // A pattern needs a colour to be drawn in. Without one there is nothing to
  // draw, which is also true of Word: `w:shd` with a `val` and no `color` shows
  // the fill.
  if (!color || color === 'auto' || pattern === 'clear' || pattern === 'nil') return out;

  const ink = normalizeColor(color);

  if (pattern === 'solid') {
    // The pattern covers everything, so the fill is not visible at all.
    out.backgroundColor = ink;
    return out;
  }

  const percent = patternPercent(pattern);
  if (percent !== undefined) {
    out.backgroundColor = `color-mix(in srgb, ${ink} ${percent}%, ${background ?? 'white'})`;
    return out;
  }

  const angle = STRIPES[pattern];
  if (angle !== undefined) {
    out.backgroundImage = `repeating-linear-gradient(${angle}deg, ${ink} 0 1px, transparent 1px 4px)`;
    return out;
  }

  if (CROSSES.has(pattern)) {
    const diagonal = pattern.toLowerCase().includes('diag');
    const [a, b] = diagonal ? [45, -45] : [0, 90];
    out.backgroundImage =
      `repeating-linear-gradient(${a}deg, ${ink} 0 1px, transparent 1px 4px), ` +
      `repeating-linear-gradient(${b}deg, ${ink} 0 1px, transparent 1px 4px)`;
    return out;
  }

  // A pattern this does not know is drawn as its fill rather than as nothing:
  // the reader asked for a shaded cell and the shade is the part we have.
  return out;
}

export function normalizeColor(value: string): string {
  if (value === 'auto') return 'currentColor';
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return value;
}
