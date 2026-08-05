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
import { paginate, type MeasuredBlock, type Page, type PaginationOptions } from './pagination';
import type { EffectiveFormat } from './style-resolver';

export interface SheetMetrics {
  width: number;
  height: number;
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

  return {
    width,
    height,
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

export function layoutSurface(
  blocks: MeasuredBlock[],
  metrics: SheetMetrics,
  options: Omit<PaginationOptions, 'contentHeight'> = {}
): SurfaceLayout {
  const pages = paginate(blocks, { ...options, contentHeight: metrics.contentHeight });
  const pushBySid = new Map<string, number>();

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

  return {
    pages,
    metrics,
    pushBySid,
    totalHeight: pages.length * metrics.height + Math.max(0, pages.length - 1) * metrics.gap
  };
}
