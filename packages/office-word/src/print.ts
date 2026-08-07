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

  const page = [
    `@page {`,
    `  size: ${toPt(metrics.width)} ${toPt(metrics.height)};`,
    `  margin: ${toPt(metrics.marginTop)} ${toPt(metrics.marginRight)} ${toPt(metrics.marginBottom)} ${toPt(metrics.marginLeft)};`,
    `}`
  ].join('\n');

  return `${page}

@media print {
  /* The application, not the document. */
  .w-toolbar {
    display: none !important;
  }

  /* The paper itself, and the copies of the header and footer drawn onto each
     of them. A sheet is an absolutely positioned rectangle covering one page's
     worth of the flow; on paper the page *is* that rectangle. The furniture is
     dropped rather than printed once in the wrong place — a header that appears
     on page one only is worse than one that does not appear. */
  .w-sheet,
  .w-furniture,
  .w-page-break {
    display: none !important;
  }

  /* The layer the sheets lived in stays, because the footnotes are in it and
     they are the document — dropping them would lose text off the printout
     entirely. Put back in the flow and ordered last, they print together at the
     end of their section rather than at the foot of the page they belong to.
     That is not where Word puts them, and it is the part of this that a print
     rendering pass would fix. */
  .w-sheets {
    position: static !important;
    inset: auto !important;
    height: auto !important;
    order: 1;
  }

  .w-footnotes {
    position: static !important;
    transform: none !important;
    inset: auto !important;
    width: auto !important;
    margin-top: 24pt;
    border-top: 1px solid #999;
    padding-top: 6pt;
  }

  /* The page box now supplies the paper and its margins, so the section stops
     supplying its own; its minimum height came from the layout and would print
     as a blank page at the end. */
  .w-surface {
    width: auto !important;
    min-height: 0 !important;
    padding: 0 !important;
  }

  /* Back into the flow. A block placed by coordinate is one the column layout
     put in a box, and blocks left out of the flow print on top of each other. */
  [data-positioned='true'] {
    position: static !important;
    inset: auto !important;
    width: auto !important;
    margin-top: 0 !important;
  }

  /* Where the paginator said a page ends. The push that moved this block down
     to meet its sheet goes with it: the break has already put it at the top. */
  [data-page-open='true'] {
    break-before: page !important;
    page-break-before: always !important;
    margin-top: 0 !important;
  }

  /* A printer breaking a heading off the paragraph it introduces is its own
     kind of wrong. */
  h1, h2, h3, h4, h5, h6 {
    break-after: avoid;
  }
}`;
}
