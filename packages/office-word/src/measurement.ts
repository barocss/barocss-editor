/**
 * Reading back what the browser already laid out.
 *
 * This is the one part of pagination that needs a browser, and it needs it for
 * exactly one question: how tall is this block, and how many lines did it break
 * into at this width. Character widths, kerning, script shaping and line
 * breaking are all already done — `Range.getClientRects()` hands back one
 * rectangle per line box, which *is* the line breaking result. Computing glyph
 * metrics ourselves would be re-deriving an answer the layout engine has
 * already given.
 *
 * Spacing is deliberately *not* measured. It is read from the resolved style
 * instead, because the layout pushes blocks down by setting `margin-top` — so
 * measuring the computed margin would feed the previous pass's output back in as
 * this pass's input. Line breaking, by contrast, depends only on the width,
 * which pagination never changes; that is what makes measure → break → place
 * converge instead of oscillate.
 */
import { CHROME_ATTR } from '@barocss/shared';
import { twipToPx } from './css';
import type { MeasuredBlock } from './pagination';
import type { StyleResolver } from './style-resolver';
import { childrenOf, type DocumentAccess, type DocumentNode } from './document-access';
import { footnoteRefsIn, reserveFor } from './footnotes';
import { lineStartOffsets, type LineAnchor } from './line-offsets';
import { scaledTo } from './table-pagination';

/** The DOM attribute the renderer stamps each node's id onto. */
const SID_ATTR = 'data-bc-sid';

export interface MeasureOptions {
  /**
   * Collects the text offset each line of a block starts at.
   *
   * Only wanted when paragraphs may split, since finding them costs a binary
   * search per line and a document that breaks only between blocks has no use
   * for the answer.
   */
  onLineOffsets?: (sid: string, offsets: LineAnchor[]) => void;
  /**
   * Measured height of each footnote body, by id.
   *
   * Empty on the first pass, when the bodies have not been drawn yet. See
   * `reserveFor` for why an unmeasured footnote reserves nothing rather than a
   * guess.
   */
  footnoteHeights?: Map<string, number>;
  /** Height of the rule drawn above the notes. */
  footnoteSeparator?: number;
  /**
   * Whether a paragraph may be split across a page boundary.
   *
   * Splitting mid-paragraph means placing height *between two line boxes*, which
   * can only be done from inside the inline flow — the same place the caret
   * filler lives, and the same offset arithmetic it complicates. Breaking only
   * between blocks needs none of that, so it is the default until the rest is
   * proven on screen.
   */
  splitBlocks?: boolean;
}

/**
 * The line boxes of an element, as vertical bands.
 *
 * A single line yields several rectangles when it contains several inline
 * elements, so rectangles are merged into a band whenever they overlap
 * vertically. Grouping by exact `top` instead would count a superscript, a
 * larger run, or a differently-sized font on the same line as separate lines.
 */
function lineBands(el: Element): { top: number; bottom: number }[] {
  // Per text node rather than over the whole element. A range across the element
  // also returns rectangles for what is *not* text — the spacer that draws a
  // page break inside a paragraph is an empty element, and measuring it as a
  // line makes the block look one line taller each time it breaks, which drifts
  // further on every pass.
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (text.data.length === 0) continue;

    const range = el.ownerDocument.createRange();
    range.selectNodeContents(text);
    rects.push(...Array.from(range.getClientRects()));
    range.detach?.();
  }

  rects.sort((a, b) => a.top - b.top);

  const bands: { top: number; bottom: number }[] = [];
  for (const rect of rects) {
    if (rect.height <= 0) continue;
    const last = bands[bands.length - 1];
    // A 1px tolerance: adjacent line boxes can touch, and sub-pixel positions
    // would otherwise merge two lines into one.
    if (last && rect.top < last.bottom - 1) {
      last.bottom = Math.max(last.bottom, rect.bottom);
    } else {
      bands.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  return bands;
}

/**
 * Split a block's height across its lines, in the proportions they were measured
 * in.
 *
 * The band heights are not used directly: they measure ink, not the line box, so
 * they miss the leading and would not sum to the block's height — and
 * pagination's arithmetic depends on `sum(lines) === height`. Scaling them to
 * that total keeps both: the sum is right, and a line that is genuinely taller
 * than its neighbours keeps its share.
 *
 * It used to divide the height evenly, which is exact only when every line is
 * the same size. One equation inline in a paragraph is 40px against 14px for the
 * lines around it, and dividing evenly moved every page break after it —
 * measured as three pagination tests failing the moment a bracketed fraction
 * went into the fixture. A large picture or a run in a much larger size does the
 * same thing, more quietly.
 */
function linesFor(el: HTMLElement): number[] {
  // getBoundingClientRect, not offsetHeight: the latter rounds to whole pixels,
  // and a fraction of a pixel dropped from every block accumulates into a page
  // that ends several pixels away from where the layout placed it.
  //
  // Less whatever the layout itself put there. A page break drawn inside this
  // paragraph is part of how tall it currently is and no part of how tall its
  // text is — counting it would make the block grow every time it broke.
  let height = el.getBoundingClientRect().height;
  for (const chrome of Array.from(el.querySelectorAll(`[${CHROME_ATTR}]`))) {
    height -= chrome.getBoundingClientRect().height;
  }
  const bands = lineBands(el);
  if (height <= 0) return [];
  if (bands.length <= 1) return [height];

  return scaledTo(
    bands.map((band) => band.bottom - band.top),
    height
  );
}

/**
 * A table measured by its rows.
 *
 * A table's line is a row. Nothing else in a table is a place a page can end:
 * splitting between two lines of a cell would leave the cell's borders on one
 * page and the rest of its text on another, which is why Word breaks tables at
 * rows and so does every other word processor.
 *
 * Its own rows, not every row inside it — a table nested in a cell breaks with
 * the row that contains it, not independently of it. And not the rows the layout
 * itself drew: a repeated header and the gap under a break are part of how tall
 * the table currently is and no part of how tall its content is, so counting
 * them would make the table grow every time it broke.
 */
function rowsFor(el: HTMLElement): number[] {
  const heights: number[] = [];

  for (const group of Array.from(el.children)) {
    if (group.hasAttribute(CHROME_ATTR)) continue;

    const rows = Array.from(group.children).filter(
      (row) => row.tagName === 'TR' && !row.hasAttribute(CHROME_ATTR)
    );

    // A header is a row with no `tr` around it: the schema has it hold cells
    // directly, so the browser wraps them in an anonymous row box and there is
    // nothing to query for. The group is that row.
    if (rows.length === 0) {
      const height = group.getBoundingClientRect().height;
      if (height > 0) heights.push(height);
      continue;
    }

    for (const row of rows) heights.push(row.getBoundingClientRect().height);
  }

  if (heights.length === 0) return heights;

  // Scaled so they sum to the table's own height, the way a paragraph's lines
  // are — less whatever the layout itself drew inside it.
  let height = el.getBoundingClientRect().height;
  for (const chrome of Array.from(el.querySelectorAll(`[${CHROME_ATTR}]`))) {
    height -= chrome.getBoundingClientRect().height;
  }

  return scaledTo(heights, height);
}

const px = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? twipToPx(value) : 0;

/**
 * Measure the blocks of a rendered surface, in document order.
 *
 * Driven by the model rather than by walking the DOM. A renderer stamps its
 * node's id onto *every* element of that node's template, not only the root — so
 * the page sheets a surface draws carry the surface's own id, and a DOM walk
 * counts them as blocks. Asking the model which children exist, and then finding
 * each one, has no such ambiguity, and takes document order from the place that
 * actually defines it.
 *
 * Only the surface's own children are measured. A paragraph inside a table cell
 * is not a page-level block — the table is — and descending into it would
 * paginate the same content twice.
 */
export function measureBlocks(
  surfaceEl: HTMLElement,
  doc: DocumentAccess,
  styles: StyleResolver,
  options: MeasureOptions = {}
): MeasuredBlock[] {
  const splitBlocks = options.splitBlocks ?? false;
  const blocks: MeasuredBlock[] = [];

  const surfaceSid = surfaceEl.getAttribute(SID_ATTR);
  const surface = surfaceSid ? (doc.getNode(surfaceSid) as DocumentNode | undefined) : undefined;
  if (!surface) return blocks;

  for (const node of childrenOf(doc, surface)) {
    const sid = node.sid;
    if (!sid) continue;

    const child = surfaceEl.querySelector(`[${SID_ATTR}="${CSS.escape(sid)}"]`);
    if (!child) continue;

    // Resolved as a paragraph even for a table: what this reads are the
    // break rules — spacing, keepNext, pageBreakBefore — and those are the same
    // properties whatever the block is. Resolving a table in the table context
    // instead answered with different spacing and moved every page after it.
    const format = styles.resolveNode(node, 'paragraph');
    const lines = node.stype === 'bTable' ? rowsFor(child as HTMLElement) : linesFor(child as HTMLElement);
    const refs = footnoteRefsIn(doc, node);

    if (splitBlocks && options.onLineOffsets && lines.length > 1) {
      options.onLineOffsets(sid, lineStartOffsets(child));
    }

    blocks.push({
      sid,
      lines,
      reserve: reserveFor(refs, options.footnoteHeights ?? new Map(), options.footnoteSeparator ?? 0),
      spaceBefore: px(format.spacingBefore),
      spaceAfter: px(format.spacingAfter),
      breakBefore: format.pageBreakBefore === true || node.stype === 'pageBreak',
      keepNext: format.keepNext === true,
      // A table splits between its rows, which is what its lines are. It used to
      // be unsplittable, and a table longer than a page was then drawn straight
      // across the gap between two sheets — measured at 1,654px of table on a
      // 1,056px page, its rows crossing the margin and the paper's edge.
      keepLines: !splitBlocks || format.keepLines === true,
      widowControl: format.widowControl !== false
    });
  }

  return blocks;
}
