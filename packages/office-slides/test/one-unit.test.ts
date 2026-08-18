import { describe, it, expect } from 'vitest';
import { canvasCss } from '@barocss/office-word';
import { twipToPx, SLIDE_16_9 } from '../src/geometry';

/**
 * One model, two products, one size.
 *
 * The two read the same attribute as two different lengths and neither was
 * disobeying the schema, which declares both as plain numbers and says nothing
 * about the unit. Word wrote a canvas shape's numbers straight into SVG user
 * units and sized the canvas `${width}px`, so one unit was one pixel; Slides
 * converts every length through `twipToPx`, so one unit was one twip. Fifteen
 * apart, on the same node types, in the same document model.
 *
 * That is settled — twips, everywhere — in `docs/specs/canvas-model.md`, and a
 * paragraph is not what holds it. This is: it fails the day a length is written
 * out raw again, in either product, which is the only form of "one unit" that
 * cannot go stale.
 *
 * Lives here rather than in `office-word` because this package is the one that
 * can see both. That is also the honest shape of the claim — it is about the
 * two agreeing, so it belongs where the disagreement would be visible.
 */
describe('both products measure the model in twips', () => {
  /** An inch, in the unit everything the engine measures is kept in. */
  const INCH = 1440;

  it('agrees on what an inch is', () => {
    expect(twipToPx(INCH)).toBe(96);
  });

  it('draws a canvas the size Slides would place a box of the same numbers', () => {
    const attrs = { width: 4 * INCH, height: 3 * INCH };

    // Word's canvas: the CSS size of the <svg> that holds the shapes.
    const word = canvasCss(attrs);

    // Slides' equivalent: the same numbers through its own conversion.
    expect(word.width).toBe(`${twipToPx(attrs.width)}px`);
    expect(word.height).toBe(`${twipToPx(attrs.height)}px`);
    expect(word.width).toBe('384px');
    expect(word.height).toBe('288px');
  });

  it('makes a 16:9 slide the size a deck says it is', () => {
    // 13.33in by 7.5in, which is 1280 by 720 pixels exactly — the number the
    // whole product's geometry is checked against, restated here so that a
    // change to the unit fails in both directions.
    expect(twipToPx(SLIDE_16_9.width)).toBe(1280);
    expect(twipToPx(SLIDE_16_9.height)).toBe(720);
  });

  it('leaves the canvas view box in the model’s own units', () => {
    // The shapes inside carry raw numbers, so the view box has to be raw too.
    // If this ever converted, every shape on a canvas would be drawn fifteen
    // times too small inside a correctly sized box.
    const attrs = { width: 4 * INCH, height: 3 * INCH };
    expect(canvasCss(attrs).width).toBe('384px');
    // A canvas of one inch is 96 pixels and its view box still says 1440.
    expect(canvasCss({ width: INCH, height: INCH }).width).toBe('96px');
  });
});
