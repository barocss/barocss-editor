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
import { twipToPx } from '@barocss/office-text';
import type { MeasuredBlock } from './pagination';
import type { StyleResolver } from '@barocss/office-text';
import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';
import { footnoteRefsIn, reserveFor } from './footnotes';
import { lineStartOffsets, type LineAnchor } from './line-offsets';
import { scaledTo } from './table-pagination';
import { suppressedSpacing } from '@barocss/office-text';

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
function lineBands(el: Element): {
  bands: { top: number; bottom: number }[];
  /**
   * Height the layout's own drawings add to the block.
   *
   * Collected here rather than by querying for every chrome element under the
   * block, because chrome *inside* an atomic object adds no height to the
   * paragraph: the brackets a delimiter draws are as tall as the equation and
   * are part of it. Subtracting those took a 44px paragraph to −36 and left it
   * with no lines at all.
   */
  chrome: number;
  /**
   * The lowest point any floated descendant reaches.
   *
   * Which is where the short lines beside it stop and the full-width ones
   * begin — the boundary `splitFrom` is derived from. Null when nothing here
   * floats, which is almost every block.
   */
  floatBottom: number | null;
  /** Where each of those drawings sits, so it can be taken off the line it is on. */
  chromeRects: { top: number; bottom: number }[];
} {
  const rects: { top: number; bottom: number }[] = [];
  const chromeRects: { top: number; bottom: number }[] = [];
  let chrome = 0;
  let floatBottom: number | null = null;
  const view = el.ownerDocument.defaultView;

  /**
   * Whether this element is a thing on a line rather than more of the line.
   *
   * A fraction is one object that happens to stack text inside itself. Walking
   * into it finds the numerator and the denominator at two different heights and
   * counts them as two lines of the paragraph, which they are not — measured, a
   * 44px paragraph holding one equation reported five line tops, and every page
   * break after it moved. Anything that is not `display: inline` is such an
   * object: an equation, a matrix, a picture, a stacked sum.
   */
  const atomic = (display: string | undefined): boolean =>
    !!display && display !== 'inline' && display !== 'contents';

  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child as Text;
        if (text.data.length === 0) continue;

        const range = el.ownerDocument.createRange();
        range.selectNodeContents(text);
        for (const rect of Array.from(range.getClientRects())) {
          rects.push({ top: rect.top, bottom: rect.bottom });
        }
        range.detach?.();
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const element = child as Element;

      // Whatever the layout drew is not a line of the text. The spacer that
      // carries a page break through a paragraph is a full-width empty box, and
      // counting it makes the block a line taller every time it breaks.
      if (element.hasAttribute(CHROME_ATTR)) {
        const box = element.getBoundingClientRect();
        chrome += box.height;
        if (box.height > 0) chromeRects.push({ top: box.top, bottom: box.bottom });
        continue;
      }

      const style = view?.getComputedStyle(element);
      const floating = !!style && style.float !== 'none' && style.float !== '';

      if (floating || atomic(style?.display)) {
        const box = element.getBoundingClientRect();
        if (box.height > 0) rects.push({ top: box.top, bottom: box.bottom });
        // A float is the one thing in a paragraph that makes some of its lines
        // shorter than the others, so where it ends is where the block becomes
        // safe to cut.
        if (floating && box.height > 0) {
          floatBottom = floatBottom === null ? box.bottom : Math.max(floatBottom, box.bottom);
        }
        continue;
      }

      visit(element);
    }
  };

  visit(el);
  rects.sort((a, b) => a.top - b.top);

  const bands: { top: number; bottom: number }[] = [];
  for (const rect of rects) {
    if (rect.bottom <= rect.top) continue;
    const last = bands[bands.length - 1];
    // A 1px tolerance: adjacent line boxes can touch, and sub-pixel positions
    // would otherwise merge two lines into one.
    if (last && rect.top < last.bottom - 1) {
      last.bottom = Math.max(last.bottom, rect.bottom);
    } else {
      bands.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  return { bands, chrome, floatBottom, chromeRects };
}

/**
 * How far down the block each line reaches — the distance from one line's top to
 * the next's, which is what the reader sees a line occupy.
 *
 * Not the band heights: those measure ink, and miss the leading. They were
 * scaled up to the block's height instead, on the reasoning that every line is
 * under-measured by the same fraction — true for text, and false for anything
 * measured as a box rather than as ink. A floated picture is such a thing: its
 * band is drawn 98px tall and was reported as 117, which put the cut 46px below
 * where the paragraph's lines actually reach and left the tail of it drawn
 * above the top margin of the page it continued onto.
 *
 * Measuring the gaps has neither problem and needs no scaling: they sum to the
 * block's height by construction, and each one is the line's real extent
 * whether it was measured as ink or as a box.
 *
 * The first line takes the space above the first band — half-leading, padding,
 * a border — and the last takes everything below its own top, for the same
 * reason. Whatever the layout itself drew is taken off the line it sits on
 * rather than off the block as a whole: it belongs to one gap, and spreading it
 * would make every other line slightly short.
 */
function advances(
  el: HTMLElement,
  bands: { top: number; bottom: number }[],
  chromeRects: { top: number; bottom: number }[],
  scale: number
): number[] {
  const box = el.getBoundingClientRect();
  const edges = [box.top, ...bands.slice(1).map((band) => band.top), box.bottom];

  const lines: number[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    let height = edges[i + 1] - edges[i];
    for (const drawn of chromeRects) {
      const overlap = Math.min(drawn.bottom, edges[i + 1]) - Math.max(drawn.top, edges[i]);
      if (overlap > 0) height -= overlap;
    }
    // Back out of the zoom: everything above is the drawn box, and pagination
    // compares what it measures against a page height computed in twips.
    lines.push(Math.max(0, height / scale));
  }
  return lines;
}

/**
 * A block as a stack of line heights, and where it may be cut.
 */
function linesFor(el: HTMLElement): {
  lines: number[];
  splitFrom?: number;
  /**
   * Where each of those lines starts on the screen.
   *
   * Handed to `lineStartOffsets` so the character positions it finds are
   * counted in the same lines: a merged band is one line here and four to the
   * browser, and a break anchored by the browser's count lands in the wrong
   * place.
   */
  bandTops: number[];
} {
  // getBoundingClientRect, not offsetHeight: the latter rounds to whole pixels,
  // and a fraction of a pixel dropped from every block accumulates into a page
  // that ends several pixels away from where the layout placed it.
  //
  // Less whatever the layout itself put there. A page break drawn inside this
  // paragraph is part of how tall it currently is and no part of how tall its
  // text is — counting it would make the block grow every time it broke.
  const { bands, chrome, floatBottom, chromeRects } = lineBands(el);
  const height = el.getBoundingClientRect().height - chrome;
  const scale = scaleOf(el);

  // Left in the drawn space: these are only ever compared against other drawn
  // positions — `lineStartOffsets` asks the browser where a character is — and
  // two measurements in one space need no conversion between them.
  const bandTops = bands.map((band) => band.top);
  if (height <= 0) return { lines: [], bandTops: [] };
  if (bands.length <= 1) return { lines: [height / scale], bandTops };

  const lines = advances(el, bands, chromeRects, scale);

  /**
   * The first line clear of the float.
   *
   * Every band that overlaps the float has already been merged into one — a
   * band takes in any rectangle that starts before the previous one ends, and
   * the float's own rectangle spans all of them — so the float and the short
   * lines beside it are a single line as far as this measurement goes, and the
   * one after it is the first that is full width.
   *
   * A float reaching past the last line leaves no full-width line at all, and
   * the floor becomes the end of the block — which is the same thing as never
   * cutting it, said in the units the paginator already works in.
   */
  if (floatBottom === null) return { lines, bandTops };
  const clear = bands.findIndex((band) => band.top >= floatBottom - 1);
  const splitFrom = clear === -1 ? lines.length : clear;

  return { lines, bandTops, ...(splitFrom > 0 ? { splitFrom } : {}) };
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
  const scale = scaleOf(el);

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

  return scaledTo(heights, height).map((row) => row / scale);
}

const px = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? twipToPx(value) : 0;

/**
 * How much smaller than itself the page is being drawn.
 *
 * Zoom is a `transform: scale`, which is a visual change and not a layout one —
 * measured, a paragraph keeps every one of its eight lines at half size, and
 * every length comes back multiplied by exactly the factor. That is what makes
 * it the right mechanism: a page must break in the same place at every zoom, and
 * `zoom` the CSS property affects layout and drifts (77.88px where the transform
 * gives 78).
 *
 * But `getClientRects` reports the *drawn* box, and pagination compares what it
 * measures against a page height computed from the document in twips. So
 * everything measured here is divided back out, and the rest of the pass never
 * learns that a zoom exists.
 *
 * Read from the element rather than passed in: the transform is on an ancestor
 * of every surface, and a measurement that has to be *told* the zoom is a
 * measurement that is wrong whenever somebody forgets.
 */
function scaleOf(el: Element): number {
  const view = el.ownerDocument.defaultView;
  if (!view) return 1;
  const matrix = view.getComputedStyle(el).transform;
  if (!matrix || matrix === 'none') {
    const parent = el.parentElement;
    return parent ? scaleOf(parent) : 1;
  }
  // `matrix(a, b, c, d, e, f)` — `a` is the horizontal scale, and a zoom is
  // uniform, so it is the whole answer.
  const a = Number(matrix.slice(matrix.indexOf('(') + 1).split(',')[0]);
  return Number.isFinite(a) && a > 0 ? a : 1;
}

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
    const measured: { lines: number[]; splitFrom?: number; bandTops?: number[] } =
      node.stype === 'bTable'
        ? { lines: rowsFor(child as HTMLElement) }
        : linesFor(child as HTMLElement);
    const lines = measured.lines;
    const refs = footnoteRefsIn(doc, node);

    if (splitBlocks && options.onLineOffsets && lines.length > 1) {
      options.onLineOffsets(sid, lineStartOffsets(child, measured.bandTops));
    }

    // The same rule the renderer draws with. A block that gives up the space
    // between it and a neighbour of its own style has to give it up here too, or
    // the pages come out taller than the ones on the screen. Only a block's own
    // space is read here: the space *inside* a list is between its items, and
    // that is already part of how tall the list measured.
    const suppressed = suppressedSpacing(doc, styles, node);
    blocks.push({
      sid,
      lines,
      reserve: reserveFor(refs, options.footnoteHeights ?? new Map(), options.footnoteSeparator ?? 0),
      spaceBefore: suppressed.before ? 0 : px(format.spacingBefore),
      spaceAfter: suppressed.after ? 0 : px(format.spacingAfter),
      breakBefore: format.pageBreakBefore === true || node.stype === 'pageBreak',
      keepNext: format.keepNext === true,
      // A table splits between its rows, which is what its lines are. It used to
      // be unsplittable, and a table longer than a page was then drawn straight
      // across the gap between two sheets — measured at 1,654px of table on a
      // 1,056px page, its rows crossing the margin and the paper's edge.
      //
      // A paragraph the text runs around a picture in used to be here too, kept
      // whole. That is more than it needs — only the lines beside the picture
      // cannot be cut among, and a paragraph taller than a page could not be
      // kept whole anyway, so it overflowed the bottom margin instead. It
      // carries a floor on the cut now: see `splitFrom`.
      keepLines: !splitBlocks || format.keepLines === true,
      ...(measured.splitFrom !== undefined ? { splitFrom: measured.splitFrom } : {}),
      widowControl: format.widowControl !== false
    });
  }

  return blocks;
}
