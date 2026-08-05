/**
 * Turning computed breaks into positions on screen.
 *
 * Pages are painted, not nested. The obvious implementation — a `<div>` per page
 * holding that page's blocks — would reparent model nodes under elements that do
 * not correspond to anything in the model, and the input path depends on a
 * block's DOM living under its parent's element: that is how a DOM mutation is
 * traced back to the node it belongs to. So the content stays one continuous
 * flow, the page sheets are drawn behind it, and each page's first block is
 * pushed down until it lines up with the top of its sheet.
 *
 * The push is a `margin-top`, which is why it is safe: it moves a block
 * vertically without changing the width, so nothing re-breaks and the next
 * measurement returns the same lines.
 */
import { twipToPx } from './css';
import { assignFootnotes } from './footnotes';
import { paginate, type MeasuredBlock, type Page, type PaginationOptions } from './pagination';
import type { EffectiveFormat } from './style-resolver';

export interface SheetMetrics {
  width: number;
  height: number;
  /** How many columns the section's text flows through on each page. */
  columnCount: number;
  /** Gap between columns, in px. */
  columnGap: number;
  /** Width of one column, which is what lines break at. */
  columnWidth: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Visual space between sheets, which is not part of any page. */
  gap: number;
  /** Height available for content: the sheet minus its vertical margins. */
  contentHeight: number;
}

export interface SurfaceLayout {
  pages: Page[];
  metrics: SheetMetrics;
  /** Extra top margin for the block that opens each page, keyed by node id. */
  pushBySid: Map<string, number>;
  /** Total height of every sheet plus the gaps between them. */
  totalHeight: number;
  /** Footnote bodies to draw at the foot of each page, in reading order. */
  footnotesByPage: Map<number, string[]>;
  /** The number each footnote shows, counted over the document. */
  footnoteNumbers: Map<string, number>;
  /** The page each block starts on, which a table of contents needs. */
  pageOfBlock: Map<string, number>;
  /**
   * Where each block sits, for a section whose text runs in columns.
   *
   * Empty for a single column, where blocks stack in normal flow and only the
   * one opening each page needs moving. A column break is a move to the right
   * and *up*, which no margin can express, so those sections position every
   * block instead.
   */
  positionBySid: Map<string, { top: number; left: number; width: number }>;
}

/** Distance between the tops of consecutive sheets. */
export const DEFAULT_SHEET_GAP = 24;

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Sheet geometry in pixels, from a section's resolved page setup. */
export function sheetMetrics(format: EffectiveFormat, gap = DEFAULT_SHEET_GAP): SheetMetrics {
  const landscape = format.orientation === 'landscape';
  const rawWidth = num(format.pageWidth, 12240);
  const rawHeight = num(format.pageHeight, 15840);

  const width = twipToPx(landscape ? rawHeight : rawWidth);
  const height = twipToPx(landscape ? rawWidth : rawHeight);
  const marginTop = twipToPx(num(format.marginTop, 1440));
  const marginBottom = twipToPx(num(format.marginBottom, 1440));
  const marginLeft = twipToPx(num(format.marginLeft, 1440));
  const marginRight = twipToPx(num(format.marginRight, 1440));

  // Lines break at the column width, not the page width — which is why this is
  // part of the metrics rather than something the renderer works out later.
  const columnCount = Math.max(1, Math.round(num(format.columnCount, 1)));
  const columnGap = twipToPx(num(format.columnSpacing, 720));
  const textWidth = Math.max(1, width - marginLeft - marginRight);
  const columnWidth =
    columnCount > 1 ? (textWidth - columnGap * (columnCount - 1)) / columnCount : textWidth;

  return {
    width,
    height,
    columnCount,
    columnGap,
    columnWidth,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    gap,
    // A page shorter than its own margins has no content area; clamping keeps
    // pagination from dividing content into pages that cannot hold anything.
    contentHeight: Math.max(1, height - marginTop - marginBottom)
  };
}

export interface SurfaceLayoutOptions extends Omit<PaginationOptions, 'contentHeight'> {
  /** Footnotes each block references, in document order. */
  footnoteRefs?: Map<string, string[]>;
}

export function layoutSurface(
  blocks: MeasuredBlock[],
  metrics: SheetMetrics,
  options: SurfaceLayoutOptions = {}
): SurfaceLayout {
  const { footnoteRefs, ...paginationOptions } = options;
  const pages = paginate(blocks, { ...paginationOptions, contentHeight: metrics.contentHeight });
  const pushBySid = new Map<string, number>();

  const positionBySid = new Map<string, { top: number; left: number; width: number }>();
  const columns = metrics.columnCount;

  if (columns > 1) {
    // The paginator filled boxes of one column's height; which box is which
    // column, and which page that column is on, is arithmetic on its index.
    for (const slice of pages) {
      const pageIndex = Math.floor(slice.index / columns);
      const columnIndex = slice.index % columns;
      const sheetTop = pageIndex * (metrics.height + metrics.gap);

      let offset = 0;
      for (const fragment of slice.fragments) {
        positionBySid.set(fragment.sid, {
          top: sheetTop + metrics.marginTop + offset,
          left: metrics.marginLeft + columnIndex * (metrics.columnWidth + metrics.columnGap),
          width: metrics.columnWidth
        });
        offset += fragment.height;
      }
    }
  } else {
    // `consumed` is where the flow has reached, measured from the top of the first
    // sheet. Each page's first block is pushed by the difference between where its
    // sheet's content area starts and where the flow would otherwise be.
    let consumed = 0;
    for (const page of pages) {
      const first = page.fragments[0];
      const contentTop = page.index * (metrics.height + metrics.gap) + metrics.marginTop;
      if (first) {
        // Never negative: content that overflowed its page must not be dragged
        // back up over the page before it.
        pushBySid.set(first.sid, Math.max(0, contentTop - consumed));
      }
      consumed = contentTop + page.height;
    }
  }

  // A footnote is drawn on the page its reference starts on, so this needs to
  // know where each block began — which is only true after the breaks are known.
  const pageOfBlock = new Map<string, number>();
  for (const page of pages) {
    // With columns a paginated box is a column, and several of them share a page
    const pageIndex = columns > 1 ? Math.floor(page.index / columns) : page.index;
    for (const fragment of page.fragments) {
      if (!fragment.continued && !pageOfBlock.has(fragment.sid)) {
        pageOfBlock.set(fragment.sid, pageIndex);
      }
    }
  }

  // A page holds one box per column, so the sheets to draw are fewer than the
  // boxes the paginator filled.
  const sheetCount = Math.max(1, Math.ceil(pages.length / columns));

  const footnotes = assignFootnotes({
    refsByBlock: footnoteRefs ?? new Map(),
    pageOfBlock,
    order: blocks.map((block) => block.sid)
  });

  return {
    pages,
    metrics,
    pushBySid,
    positionBySid,
    totalHeight: sheetCount * metrics.height + Math.max(0, sheetCount - 1) * metrics.gap,
    footnotesByPage: footnotes.byPage,
    footnoteNumbers: footnotes.numberOf,
    pageOfBlock
  };
}
