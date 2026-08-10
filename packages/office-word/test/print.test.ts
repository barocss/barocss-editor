import { describe, it, expect } from 'vitest';
import { printCss } from '../src/print';
import type { SheetMetrics } from '../src/layout';

/**
 * The stylesheet that turns a paginated document into paper.
 *
 * Printing is not a second pagination — it is the one already done, honoured.
 * What can be expressed in CSS is asserted here; what cannot is recorded in the
 * browser tests, where it can be measured rather than argued about.
 */
const metrics = (over: Partial<SheetMetrics> = {}): SheetMetrics =>
  ({
    // US Letter at 96dpi, one-inch margins.
    width: 816,
    height: 1056,
    marginTop: 96,
    marginBottom: 96,
    marginLeft: 96,
    marginRight: 96,
    columnCount: 1,
    columnGap: 0,
    columnWidth: 624,
    gap: 24,
    contentHeight: 864,
    ...over
  }) as SheetMetrics;

describe('the page box', () => {
  it('is the paper the section describes, in the printer unit', () => {
    // Points, not pixels: a printer works in points, and 816px is 612pt only
    // because the screen was assumed to be 96dpi. Printing the pixel figure
    // would put the text on paper eight and a half *points* wide.
    expect(printCss(metrics())).toContain('size: 612pt 792pt');
  });

  it('asks for no margins of its own', () => {
    // Each printed page holds a copy of the document clipped to a whole sheet,
    // margins included. A page box that added its own would inset the text
    // twice, and the copy would no longer line up with the page it was cut for.
    expect(printCss(metrics())).toMatch(/@page \{[\s\S]*?margin: 0;/);
    expect(printCss(metrics({ marginTop: 48, marginBottom: 144 }))).toMatch(
      /@page \{[\s\S]*?margin: 0;/
    );
  });

  it('has nothing to say before anything has been measured', () => {
    // The first paint happens before the layout exists, and a page box guessed
    // then would be a page size the document never had.
    expect(printCss(undefined)).toBe('');
  });
});

describe('what reaches the paper', () => {
  const css = printCss(metrics());

  it('prints the pages that were built, not the flow they came from', () => {
    // The document on screen is one continuous flow with sheets drawn behind
    // it. Printing shows one box per page instead, each holding a copy of the
    // document clipped to that page — which is the only way a break *inside* a
    // paragraph can reach paper, since CSS has no way to ask for one.
    expect(css).toMatch(/\.w-print-page\s*\{[\s\S]*?overflow: hidden/);
    expect(css).toMatch(/\.w-print-page\s*\{[\s\S]*?break-after: page/);
    // The last page must not push a blank one after it.
    expect(css).toMatch(/\.w-print-page:last-child\s*\{[\s\S]*?break-after: auto/);
  });

  it('drops the application and the on-screen document, and nothing inside a copy', () => {
    expect(css).toContain('.w-toolbar');
    expect(css).toContain('.w-document:not(.w-print-copy)');
    // Hiding anything inside a copy would reflow it, and every offset that
    // clips a page was measured against the document as it stands.
    // A descendant of a copy, not the copy itself — `:not(.w-print-copy)` is
    // how the on-screen document is told apart from the copies, and that
    // mentions the class without hiding anything in one.
    expect(css).not.toMatch(/\.w-print-copy\s+\.[^{]*\{[^}]*display: none/);
  });

  it('lets the page box be the paper, so nothing is inset twice', () => {
    // The copy inside a page is clipped to a whole sheet, margins included, so
    // the page box asks for none of its own.
    expect(css).toContain('margin: 0;');
  });

  it('keeps the sheets in the copies, because the page furniture is on them', () => {
    // Headers, footers, page numbers and footnotes are drawn per page on the
    // sheet layer, and clipping shows each page the ones that belong to it —
    // which is how they reach paper in the right places. Only the paper itself
    // goes, since the page box is the paper now.
    expect(css).toMatch(/\.w-print-copy \.w-sheet\s*\{[\s\S]*?background: transparent/);
    expect(css).not.toMatch(/\.w-print-copy \.w-sheets\s*\{[^}]*display: none/);
  });
});
