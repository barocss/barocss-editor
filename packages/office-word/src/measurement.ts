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
import { twipToPx } from './css';
import type { MeasuredBlock } from './pagination';
import type { StyleResolver } from './style-resolver';
import { childrenOf, type DocumentAccess, type DocumentNode } from './document-access';
import { footnoteRefsIn, reserveFor } from './footnotes';

/** The DOM attribute the renderer stamps each node's id onto. */
const SID_ATTR = 'data-bc-sid';

export interface MeasureOptions {
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
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);

  const rects = Array.from(range.getClientRects())
    .filter((r) => r.height > 0)
    .sort((a, b) => a.top - b.top);
  range.detach?.();

  const bands: { top: number; bottom: number }[] = [];
  for (const rect of rects) {
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
 * Split a block's height evenly across its lines.
 *
 * The band heights are not used directly: they measure ink, not the line box, so
 * they miss leading and would not sum to the block's height — and pagination's
 * arithmetic depends on `sum(lines) === height`. Within a block whose lines are
 * the same size this is exact; where they differ it distributes the error, which
 * is only visible as a split landing one line early or late.
 */
function linesFor(el: HTMLElement): number[] {
  // getBoundingClientRect, not offsetHeight: the latter rounds to whole pixels,
  // and a fraction of a pixel dropped from every block accumulates into a page
  // that ends several pixels away from where the layout placed it.
  const height = el.getBoundingClientRect().height;
  const count = lineBands(el).length;
  if (height <= 0) return [];
  if (count <= 1) return [height];
  return Array.from({ length: count }, () => height / count);
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

    const format = styles.resolveNode(node, 'paragraph');
    const lines = linesFor(child as HTMLElement);
    const refs = footnoteRefsIn(doc, node);

    blocks.push({
      sid,
      lines,
      reserve: reserveFor(refs, options.footnoteHeights ?? new Map(), options.footnoteSeparator ?? 0),
      spaceBefore: px(format.spacingBefore),
      spaceAfter: px(format.spacingAfter),
      breakBefore: format.pageBreakBefore === true || node.stype === 'pageBreak',
      keepNext: format.keepNext === true,
      // A table is a block here, not a stack of rows, so it cannot be split
      // between lines even when paragraphs can be.
      keepLines: !splitBlocks || format.keepLines === true || node.stype === 'bTable',
      widowControl: format.widowControl !== false
    });
  }

  return blocks;
}
