/**
 * Printing what was already paginated.
 *
 * The document has real pages on screen: the paginator measured the rendered
 * text and decided where each one ends. Printing is not a second pagination —
 * it is the first one, honoured. So this does not ask the browser to work out
 * where the pages go; it tells it, by putting an explicit break before every
 * block the paginator put at the top of a page.
 *
 * Letting the browser decide instead would produce a printout that disagrees
 * with the screen: the reader sees a page break after the third paragraph and
 * the paper breaks after the fourth, and neither is obviously wrong, which is
 * the worst kind of wrong.
 *
 * What is dropped in print is everything that exists to *simulate* paper. The
 * sheets are absolutely positioned rectangles behind the text and would print as
 * one enormous rectangle on the first page; the pushes that drop a block onto
 * its sheet would print as blank space on top of a break that already happened.
 * Paper needs neither.
 */
import type { SheetMetrics } from './layout';

/** CSS pixels to points, the unit a printer works in. */
const toPt = (px: number): string => `${Math.round(px * 0.75 * 100) / 100}pt`;

/**
 * The stylesheet that makes the printed pages the computed ones.
 *
 * Margins are given to `@page` rather than left on the section. On screen the
 * section carries its own padding and the sheets sit behind it; on paper the
 * page box *is* the margin, and a section still padding itself would inset the
 * text twice.
 */
export function printCss(metrics: SheetMetrics | undefined): string {
  if (!metrics) return '';

  // No margin on the page box: a printed page is a whole sheet here, margins
  // and all, because the copy inside it is clipped to the sheet rather than to
  // the text area. Asking the page box for margins as well would inset the
  // text twice.
  const page = [
    `@page {`,
    `  size: ${toPt(metrics.width)} ${toPt(metrics.height)};`,
    `  margin: 0;`,
    `}`
  ].join('\n');

  return `${page}

@media print {
  /* The application, and the document as it is read on screen: one continuous
     flow with sheets drawn behind it. Neither is what goes on paper.
     Nothing *inside* a copy is hidden, on purpose — the offsets that clip each
     page were measured against the document as it stands, and hiding anything
     in the copy reflows it and makes every one of them wrong. The clipping is
     what decides which part shows. */
  .w-toolbar,
  .w-document:not(.w-print-copy) {
    display: none !important;
  }

  /* What goes on paper is one box per page, each holding a copy of the whole
     document shifted so that exactly that page shows through. The text is never
     cut: a paragraph crossing a boundary is in both, its top on one page and
     its bottom on the next, which is what that paragraph looks like on paper.
     Line breaking is the same in every copy because the width is. */
  .w-print-pages {
    display: block !important;
  }

  .w-print-page {
    position: relative;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
    background: #fff;
  }

  .w-print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .w-print-copy {
    position: absolute;
    margin: 0;
  }

  /* The sheets keep their place in the copies: the page's own header, footer,
     page number and footnotes are drawn on them, positioned per page, and the
     clipping shows each page the ones that belong to it. Only the paper itself
     goes — the page box is the paper now — along with the shadow that made it
     look like paper on a screen. */
  .w-print-copy .w-sheet {
    background: transparent !important;
    box-shadow: none !important;
  }

  /* Nothing but the pages. A print copy left in the flow would print itself
     twice: once as a page and once as ordinary content. */
  body > *:not(.w-print-pages) {
    display: none !important;
  }
}`;
}
