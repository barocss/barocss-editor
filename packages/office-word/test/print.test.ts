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
    const css = printCss(metrics());
    expect(css).toContain('size: 612pt 792pt');
    expect(css).toContain('margin: 72pt 72pt 72pt 72pt');
  });

  it('carries margins that are not all the same', () => {
    const css = printCss(metrics({ marginTop: 48, marginBottom: 144 }));
    expect(css).toContain('margin: 36pt 72pt 108pt 72pt');
  });

  it('has nothing to say before anything has been measured', () => {
    // The first paint happens before the layout exists, and a page box guessed
    // then would be a page size the document never had.
    expect(printCss(undefined)).toBe('');
  });
});

describe('what reaches the paper', () => {
  const css = printCss(metrics());

  it('breaks where the paginator put the top of a page', () => {
    expect(css).toContain("[data-page-open='true']");
    expect(css).toContain('break-before: page');
    // The push that moved the block down to meet its sheet goes with it: the
    // break has already put it at the top, and the push would print as a gap.
    expect(css).toMatch(/\[data-page-open='true'\][\s\S]*?margin-top: 0/);
  });

  it('drops the paper and the application, which only exist on screen', () => {
    for (const onScreenOnly of ['.w-toolbar', '.w-sheet', '.w-furniture', '.w-page-break']) {
      expect(css).toContain(onScreenOnly);
    }
  });

  it('keeps the footnotes, which are the document', () => {
    // They are drawn inside the layer the sheets live in. Dropping that layer
    // wholesale would take the note text off the printout entirely — losing
    // content, which is worse than placing it imperfectly.
    expect(css).toMatch(/\.w-footnotes\s*\{[^}]*position: static/);
    expect(css).not.toMatch(/\.w-footnotes[^{]*\{[^}]*display: none/);
  });

  it('puts blocks placed by coordinate back into the flow', () => {
    // A column is a box the paginator fills, and filling it takes every block
    // out of the flow. Paper has no such boxes, and blocks left out of the flow
    // print on top of one another.
    expect(css).toMatch(/\[data-positioned='true'\][\s\S]*?position: static/);
  });

  it('stops the section supplying margins the page box now supplies', () => {
    // Otherwise the text is inset twice, and the section's minimum height —
    // which came from the layout — prints as a blank page at the end.
    expect(css).toMatch(/\.w-surface\s*\{[\s\S]*?padding: 0/);
    expect(css).toMatch(/\.w-surface\s*\{[\s\S]*?min-height: 0/);
  });
});
