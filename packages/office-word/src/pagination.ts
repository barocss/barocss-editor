/**
 * Where the page breaks fall.
 *
 * Pagination is a layout result, not content. Nothing here touches the model:
 * it takes blocks that have already been measured and returns the breaks, so the
 * same computation runs in a browser, in a test with synthetic heights, or on a
 * server with metrics from a font library.
 *
 * The unit of measurement is the line, not the block. A paragraph that does not
 * fit is usually split rather than moved, and widow control is a statement about
 * lines — so a block arrives as its line heights, and a scalar height would make
 * both impossible.
 *
 * What is deliberately absent: any notion of scroll position, zoom or visible
 * range. Those belong to a viewport, and a viewport only decides which of these
 * pages to paint. Breaks are computed for the whole document either way.
 */

/** A block as the layout sees it: a stack of line boxes plus its break rules. */
export interface MeasuredBlock {
  sid: string;
  /** Height of each line box, in the same unit as `contentHeight` (px). */
  lines: number[];
  /** Space above and below the lines that travels with the block. */
  spaceBefore?: number;
  spaceAfter?: number;
  /** Word's `pageBreakBefore`, or an explicit `pageBreak` node ahead of it. */
  breakBefore?: boolean;
  /** Word's `keepNext`: stay on the same page as the block that follows. */
  keepNext?: boolean;
  /**
   * Word's `keepLines`: never split this block.
   *
   * Not a table row's `cantSplit`, which asks for nothing here. A table's lines
   * are its rows, so a break already falls between two of them and every row is
   * whole on the page it lands on — this switch is the whole table's.
   */
  keepLines?: boolean;
  /** Word's `widowControl`: never leave a single line behind or ahead. */
  widowControl?: boolean;
  /**
   * Height this block requires at the *bottom* of whatever page it lands on.
   *
   * Footnotes are what this is for: a reference in a paragraph pushes its body
   * to the foot of that page, and the body takes room the paragraph can no
   * longer have. So the reservation travels with the block that causes it, and
   * the page it lands on gets that much less to fill.
   *
   * Attributed to the page where the block *starts*, even when the block splits.
   * Word can carry a footnote to the continuation page; deciding that needs to
   * know which line the reference is on, which is finer than this measures.
   */
  reserve?: number;
}

/** The part of a block that sits on one page. */
export interface PageFragment {
  sid: string;
  /** Line range on this page, `[from, to)`. */
  fromLine: number;
  toLine: number;
  height: number;
  /** True when the block continues onto the next page. */
  continues: boolean;
  /** True when the block began on an earlier page. */
  continued: boolean;
}

export interface Page {
  index: number;
  fragments: PageFragment[];
  /** Height consumed, which is at most `contentHeight` unless a block overflows. */
  height: number;
  /** Space held at the foot of this page by the blocks on it. */
  reserved: number;
}

export interface PaginationOptions {
  /** Usable height of a page: page height minus its margins, in px. */
  contentHeight: number;
  /**
   * Guard for the keepNext repair loop. A violated keepNext is fixed by forcing
   * a break, which can expose another; the loop is bounded so a pathological
   * document cannot hang the layout.
   */
  maxRepairs?: number;
}

/** Word's widow/orphan rule: never one line alone at either end of a split. */
const MIN_LINES_EITHER_SIDE = 2;

/**
 * Paragraph spacing collapses at a page boundary.
 *
 * Space before is suppressed at the top of a page — otherwise every page would
 * open with a blank strip whose size depended on which paragraph happened to
 * land there. Space after is not required to fit: it is clipped at the bottom
 * instead. Without that second rule, trailing space alone could push a paragraph
 * over the edge and split it, which is a visible defect for no gain.
 */
function leadingSpace(block: MeasuredBlock, from: number, atPageTop: boolean): number {
  if (from !== 0 || atPageTop) return 0;
  return block.spaceBefore ?? 0;
}

/** How many of the remaining lines fit in `available`. */
function linesThatFit(
  block: MeasuredBlock,
  from: number,
  available: number,
  atPageTop: boolean
): number {
  let used = leadingSpace(block, from, atPageTop);
  let count = 0;
  for (let i = from; i < block.lines.length; i++) {
    const next = used + block.lines[i];
    if (next > available) break;
    used = next;
    count++;
  }
  return count;
}

function fragmentHeight(
  block: MeasuredBlock,
  from: number,
  to: number,
  atPageTop: boolean
): number {
  let height = leadingSpace(block, from, atPageTop);
  for (let i = from; i < to; i++) height += block.lines[i];
  if (to === block.lines.length) height += block.spaceAfter ?? 0;
  return height;
}

/**
 * Pull `fit` back until both sides of the split keep enough lines.
 *
 * Returns 0 when no legal split exists, which means the whole block moves to the
 * next page. That is the same answer Word gives: widow control turns a bad split
 * into a page break.
 */
function applyWidowControl(block: MeasuredBlock, from: number, fit: number): number {
  if (!block.widowControl) return fit;

  const total = block.lines.length - from;
  // A two-line paragraph cannot satisfy the rule on both sides; Word keeps it whole.
  if (total < MIN_LINES_EITHER_SIDE * 2) return fit === total ? fit : 0;

  let adjusted = fit;
  // Leave at least two lines behind on this page
  if (adjusted < MIN_LINES_EITHER_SIDE) return 0;
  // Carry at least two lines forward to the next
  if (total - adjusted < MIN_LINES_EITHER_SIDE) adjusted = total - MIN_LINES_EITHER_SIDE;
  return adjusted < MIN_LINES_EITHER_SIDE ? 0 : adjusted;
}

function layout(blocks: MeasuredBlock[], forced: Set<number>, contentHeight: number): Page[] {
  const pages: Page[] = [];
  let current: Page = { index: 0, fragments: [], height: 0, reserved: 0 };

  const flush = () => {
    pages.push(current);
    current = { index: pages.length, fragments: [], height: 0, reserved: 0 };
  };

  /**
   * What is left on this page.
   *
   * The reservation of the block being placed counts too: a paragraph whose
   * footnote would not fit alongside it does not belong on this page, and
   * discovering that after placing it would leave the footnote overlapping the
   * text.
   */
  const room = (pending: number) => contentHeight - current.height - current.reserved - pending;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // An empty page is already the next page; breaking again would leave a blank one.
    if ((block.breakBefore || forced.has(i)) && current.fragments.length > 0) flush();

    const reserve = block.reserve ?? 0;

    // A zero-line block still occupies its own spacing and can carry a break.
    if (block.lines.length === 0) {
      let height = fragmentHeight(block, 0, 0, current.fragments.length === 0);
      if (height > 0 && height > room(reserve) && current.fragments.length > 0) {
        flush();
        height = fragmentHeight(block, 0, 0, true);
      }
      current.fragments.push({ sid: block.sid, fromLine: 0, toLine: 0, height, continues: false, continued: false });
      current.height += height;
      current.reserved += reserve;
      continue;
    }

    let from = 0;
    while (from < block.lines.length) {
      const atPageTop = current.fragments.length === 0;
      // Only the first fragment of a block carries its reservation with it
      const available = room(from === 0 ? reserve : 0);
      const fit = linesThatFit(block, from, available, atPageTop);
      const remaining = block.lines.length - from;

      if (fit < remaining) {
        // Not everything fits: either split here, or move what is left to the next page
        const splittable = !block.keepLines;
        const legal = splittable ? applyWidowControl(block, from, fit) : 0;

        if (legal <= 0) {
          if (current.fragments.length === 0) {
            // Nothing to move it past: a block taller than a page overflows rather
            // than vanishing, and the reader sees it clipped instead of missing.
            const height = fragmentHeight(block, from, block.lines.length, atPageTop);
            current.fragments.push({
              sid: block.sid,
              fromLine: from,
              toLine: block.lines.length,
              height,
              continues: false,
              continued: from > 0
            });
            current.height += height;
            if (from === 0) current.reserved += reserve;
            from = block.lines.length;
            break;
          }
          flush();
          continue;
        }

        const height = fragmentHeight(block, from, from + legal, atPageTop);
        current.fragments.push({
          sid: block.sid,
          fromLine: from,
          toLine: from + legal,
          height,
          continues: true,
          continued: from > 0
        });
        current.height += height;
        if (from === 0) current.reserved += reserve;
        from += legal;
        flush();
        continue;
      }

      const height = fragmentHeight(block, from, block.lines.length, atPageTop);
      current.fragments.push({
        sid: block.sid,
        fromLine: from,
        toLine: block.lines.length,
        height,
        continues: false,
        continued: from > 0
      });
      current.height += height;
      if (from === 0) current.reserved += reserve;
      from = block.lines.length;
    }
  }

  if (current.fragments.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

/** Page index a block starts on, and the one it ends on. */
function pageSpan(pages: Page[]): Map<string, { start: number; end: number }> {
  const span = new Map<string, { start: number; end: number }>();
  for (const page of pages) {
    for (const fragment of page.fragments) {
      const existing = span.get(fragment.sid);
      if (existing) existing.end = page.index;
      else span.set(fragment.sid, { start: page.index, end: page.index });
    }
  }
  return span;
}

export function paginate(blocks: MeasuredBlock[], options: PaginationOptions): Page[] {
  const { contentHeight } = options;
  const maxRepairs = options.maxRepairs ?? blocks.length;

  // `keepNext` cannot be honoured while filling greedily: whether it is violated
  // is only known once the *following* block has been placed. So lay out, look
  // for a violation, force a break before the offending block, and lay out again.
  const forced = new Set<number>();
  const givenUp = new Set<number>();

  for (let repair = 0; repair <= maxRepairs; repair++) {
    const pages = layout(blocks, forced, contentHeight);
    const span = pageSpan(pages);

    let violation = -1;
    for (let i = 0; i < blocks.length - 1; i++) {
      if (!blocks[i].keepNext || givenUp.has(i)) continue;
      const here = span.get(blocks[i].sid);
      const next = span.get(blocks[i + 1].sid);
      if (here && next && next.start > here.end) {
        violation = i;
        break;
      }
    }

    if (violation === -1) return pages;

    // Moving a block that already starts a page cannot help, and asking again
    // would loop. Word gives up on the constraint in exactly this case.
    const startsItsPage =
      pages[span.get(blocks[violation].sid)!.start].fragments[0]?.sid === blocks[violation].sid;
    if (startsItsPage || forced.has(violation)) {
      givenUp.add(violation);
      continue;
    }
    forced.add(violation);
  }

  return layout(blocks, forced, contentHeight);
}
