/**
 * Word formatting vocabulary, expressed as reusable attribute groups.
 *
 * A word processor keeps formatting in three places and they are not
 * interchangeable:
 *
 *   direct     attributes on the node itself — what the user set here, now
 *   style      a named style the node points at (`styleId`)
 *   inherited  what the style itself is based on (`basedOn` chains)
 *
 * The schema's job is only to say what may be recorded. Resolving the three into
 * an effective format is the product's job, because the cascade order is a
 * product decision (Word's differs from HTML's).
 *
 * Measurements are in **twips** (1/1440 inch) wherever Word uses them, so a
 * .docx round-trip is lossless. Font sizes are in half-points, again matching
 * Word. Naming follows the domain rather than CSS to keep the mapping obvious.
 */
import type { AttributeDefinition } from '@barocss/schema';

type Attrs = Record<string, AttributeDefinition>;

const num = (def?: number): AttributeDefinition =>
  def === undefined ? { type: 'number', required: false } : { type: 'number', default: def };
const str = (def?: string): AttributeDefinition =>
  def === undefined ? { type: 'string', required: false } : { type: 'string', default: def };
/** A list, for a property that is one — tab stops, most of all. */
const arr = (): AttributeDefinition => ({ type: 'array', required: false });
const bool = (def?: boolean): AttributeDefinition =>
  def === undefined ? { type: 'boolean', required: false } : { type: 'boolean', default: def };

/** Borders are described identically on paragraphs, tables, cells and pages. */
export const borderAttrs = (prefix: string): Attrs => ({
  [`${prefix}Style`]: str(),          // none | single | double | dashed | dotted | thick | wave ...
  [`${prefix}Width`]: num(),          // eighths of a point, as Word stores it
  [`${prefix}Color`]: str(),
  [`${prefix}Space`]: num()           // points between border and content
});

export const boxBorderAttrs = (): Attrs => ({
  ...borderAttrs('borderTop'),
  ...borderAttrs('borderBottom'),
  ...borderAttrs('borderLeft'),
  ...borderAttrs('borderRight'),
  ...borderAttrs('borderBetween'),    // between paragraphs sharing a border
  ...borderAttrs('borderInsideH'),    // table interiors
  ...borderAttrs('borderInsideV')
});

export const shadingAttrs = (): Attrs => ({
  shadingFill: str(),
  shadingColor: str(),
  shadingPattern: str()               // clear | solid | pct10 | horzStripe ...
});

/**
 * Paragraph-level formatting.
 *
 * `styleId` and the direct properties coexist on purpose: Word records both, and
 * "clear direct formatting" is meaningful precisely because they are separate.
 */
export const paragraphFormatAttrs = (): Attrs => ({
  styleId: str(),

  alignment: str(),                   // left | center | right | justify | distribute
  textDirection: str(),               // ltr | rtl
  verticalAlign: str(),               // baseline | superscript | subscript (for the run default)

  indentLeft: num(),                  // twips
  indentRight: num(),
  indentFirstLine: num(),             // positive: first line indent
  indentHanging: num(),               // positive: hanging indent (mutually exclusive with firstLine)
  mirrorIndents: bool(),

  spacingBefore: num(),               // twips
  spacingAfter: num(),
  spacingLine: num(),                 // twips, or 240ths of a line when lineRule is 'auto'
  spacingLineRule: str(),             // auto | exact | atLeast
  contextualSpacing: bool(),          // suppress spacing between same-style paragraphs

  // Pagination control — these are why a paragraph is a pagination unit
  keepNext: bool(),                   // keep with the following paragraph
  keepLines: bool(),                  // do not split across pages
  pageBreakBefore: bool(),
  widowControl: bool(true),
  suppressLineNumbers: bool(),
  suppressAutoHyphens: bool(),

  outlineLevel: num(),                // 0-8; drives the navigation pane and TOC

  /** Tab stops, serialised as `pos:align:leader` triples (twips). */
  tabs: arr(),               // [{ pos, align, leader }], positions in twips

  ...boxBorderAttrs(),
  ...shadingAttrs(),

  /** Numbering: which definition, and at which level. */
  numId: str(),
  numLevel: num()
});

/**
 * Character (run) formatting that is not already expressed as a mark.
 *
 * Anything that can apply to *part* of a text node belongs in the mark
 * vocabulary instead — marks carry ranges, attributes do not. These are the
 * paragraph-mark and style-definition properties.
 */
export const characterFormatAttrs = (): Attrs => ({
  styleId: str(),
  fontFamily: str(),
  /**
   * Kept so a .docx round-trips, and deliberately not rendered.
   *
   * Word and ODF both give a run three font slots — Latin, East Asian, complex
   * script — and choose between them per character. This product renders one
   * font per run, which is Google Docs' model and every web editor's: a reader
   * picks a family for the text, and anything the family does not cover falls
   * back the way the browser falls back.
   *
   * Reading them was tried and reverted. CSS has no per-script property, so the
   * three become one `font-family` list — which chooses by *coverage* where
   * Word chooses by *script*, and the two disagree exactly where Word needs its
   * `w:hint` to break the tie: digits, punctuation, and a Latin face that
   * happens to carry Hangul. A near-miss of Word's rule is harder to reason
   * about than one font, and one font is what the reader is choosing.
   */
  fontFamilyEastAsia: str(),
  fontFamilyComplexScript: str(),
  fontSize: num(),                    // half-points
  fontSizeComplexScript: num(),
  bold: bool(),
  italic: bool(),
  underline: str(),                   // none | single | double | dotted | wave ...
  underlineColor: str(),
  strike: bool(),
  doubleStrike: bool(),
  color: str(),
  highlight: str(),
  smallCaps: bool(),
  allCaps: bool(),
  vanish: bool(),                     // hidden text
  outline: bool(),
  shadow: bool(),
  emboss: bool(),
  imprint: bool(),
  spacing: num(),                     // letter spacing, twips
  scale: num(),                       // horizontal scale, percent
  position: num(),                    // raised/lowered, half-points
  kerning: num(),                     // minimum size for kerning, half-points
  rtl: bool(),
  lang: str(),
  langEastAsia: str(),
  noProof: bool(),                    // exclude from spell/grammar check
  ...shadingAttrs()
});

/** Page setup for a section. */
export const pageSetupAttrs = (): Attrs => ({
  pageWidth: num(12240),              // twips; US Letter by default
  pageHeight: num(15840),
  orientation: str('portrait'),       // portrait | landscape

  marginTop: num(1440),
  marginBottom: num(1440),
  marginLeft: num(1440),
  marginRight: num(1440),
  marginHeader: num(720),
  marginFooter: num(720),
  marginGutter: num(0),
  gutterAtTop: bool(false),

  /** Multi-column layout within the section. */
  columnCount: num(1),
  columnSpacing: num(720),
  columnsEqualWidth: bool(true),
  columnSeparator: bool(false),

  /** Page numbering restarts and format live with the section in Word. */
  pageNumberFormat: str(),            // decimal | upperRoman | lowerLetter ...
  pageNumberStart: num(),
  pageNumberChapterStyle: str(),

  verticalAlign: str('top'),          // top | center | both | bottom
  titlePage: bool(false),             // distinct first-page header/footer
  differentOddEven: bool(false),

  lineNumberingCountBy: num(),
  lineNumberingStart: num(),
  lineNumberingRestart: str(),        // newPage | newSection | continuous
  lineNumberingDistance: num(),

  ...boxBorderAttrs()                 // page borders
});

/** Table-level formatting. */
export const tableFormatAttrs = (): Attrs => ({
  styleId: str(),
  width: num(),
  widthType: str('auto'),             // auto | dxa (twips) | pct
  alignment: str(),                   // left | center | right
  indent: num(),
  layout: str('auto'),                // auto | fixed
  cellSpacing: num(),
  cellMarginTop: num(),
  cellMarginBottom: num(),
  cellMarginLeft: num(108),
  cellMarginRight: num(108),
  /** Column widths in twips, comma separated — Word's tblGrid. */
  grid: str(),
  /**
   * Which of a table style's conditional formats this table asks for — Word's
   * `tblLook`. Either the names it wants (`firstRow,bandedRows`) or the bitmask
   * a .docx records (`04A0`); see table-style for how it is read.
   */
  look: str(),
  /**
   * How many rows and columns make up one band. Banding stripes in pairs of this
   * size, which is what lets a style shade every second *pair* of rows.
   */
  rowBandSize: num(1),
  columnBandSize: num(1),
  bidiVisual: bool(),
  overlap: bool(),
  caption: str(),
  description: str(),
  ...boxBorderAttrs(),
  ...shadingAttrs()
});

export const tableRowFormatAttrs = (): Attrs => ({
  height: num(),
  heightRule: str(),                  // auto | atLeast | exact
  /** Repeat this row as a header on every page the table spans. */
  isHeader: bool(false),
  cantSplit: bool(false),
  cellSpacing: num(),
  alignment: str(),
  ...shadingAttrs()
});

export const tableCellFormatAttrs = (): Attrs => ({
  width: num(),
  widthType: str('auto'),
  verticalAlign: str('top'),          // top | center | bottom
  textDirection: str(),               // lrTb | tbRl | btLr ...
  fitText: bool(),
  noWrap: bool(),
  marginTop: num(),
  marginBottom: num(),
  marginLeft: num(),
  marginRight: num(),
  ...boxBorderAttrs(),
  ...shadingAttrs()
});

/**
 * Who changed what, when. Present on every node and mark that can be part of a
 * tracked revision; the product decides how to display it.
 */
export const revisionAttrs = (): Attrs => ({
  revisionId: str(),
  /**
   * What the revision proposes for this block.
   *
   * `deletion` on a paragraph is Word's deleted paragraph mark: the boundary
   * goes and this block joins the one after it. Without a type the id says a
   * revision exists and not what it asks for.
   */
  revisionType: str(),
  revisionAuthor: str(),
  revisionDate: str()
});
