import { twipToPx } from '@barocss/office-word';
import type { CssStyle } from './geometry';

/**
 * How round each corner of a box is.
 *
 * One `cornerRadius` for all four is what a diagram needs; a card with two
 * rounded corners at the top and square ones at the bottom is what a designer
 * asks for, and Canva, Figma and Keynote all give four numbers. This is the
 * fourth of the design vocabulary — after the gradient, the shadow and the dash
 * — and the last of the ones a shape carries on its own.
 *
 * ## Unset, not zero
 *
 * A corner with no number of its own follows `cornerRadius`, so the single
 * field still rounds the whole box and the four fields are an override. That is
 * the reason these are `required: false` and not `default: 0`: a default would
 * make every corner say "square" the moment the schema was read, and the
 * document's own `cornerRadius` would be shadowed by four zeroes nobody wrote.
 *
 * ## Slides', not the office schema's
 *
 * Word draws its shapes as SVG, where a rectangle is `<rect rx ry>` and has
 * exactly one radius for all four corners — four would mean drawing a `<path>`
 * instead. Declaring these in the shared schema would give Word four attributes
 * it cannot read, which is the fault this repository keeps finding in itself.
 * The same reasoning as `paint.ts`, and it applies to `cornerRadius` on a text
 * frame or a picture too: a rounded photograph is one line of CSS here and a
 * different piece of work in a word processor.
 */

/** The corners a deck's boxes carry, on top of whatever the office schema says. */
export const CORNER_ATTRS = {
  /**
   * `cornerRadius` is re-declared here because the nodes that gain corners are
   * not only the rectangle: a text frame, a frame, a sticky and a picture are
   * all boxes a reader rounds, and only the rectangle had a radius at all.
   */
  cornerRadius: { type: 'number' as const, default: 0 },
  cornerTopLeft: { type: 'number' as const, required: false },
  cornerTopRight: { type: 'number' as const, required: false },
  cornerBottomRight: { type: 'number' as const, required: false },
  cornerBottomLeft: { type: 'number' as const, required: false }
};

interface CornerAttrs {
  cornerRadius?: unknown;
  cornerTopLeft?: unknown;
  cornerTopRight?: unknown;
  cornerBottomRight?: unknown;
  cornerBottomLeft?: unknown;
}

const length = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Two decimals: a corner is a length on screen, not a fraction of anything. */
const px = (twips: number): number => Math.round(twipToPx(twips) * 100) / 100;

/**
 * The radius of each corner, in the order CSS reads them.
 *
 * `border-radius` takes them clockwise from the top left, which is also the
 * order every design tool lists them in — so a document, a panel and a
 * stylesheet all say the same four numbers in the same order.
 *
 * Nothing at all when every corner is square, rather than `0px`: an empty style
 * keeps the common case out of the DOM and out of every diff of a saved deck.
 */
export function cornerCss(attrs: CornerAttrs | undefined): CssStyle {
  const all = length(attrs?.cornerRadius) ?? 0;
  const corners = [
    length(attrs?.cornerTopLeft) ?? all,
    length(attrs?.cornerTopRight) ?? all,
    length(attrs?.cornerBottomRight) ?? all,
    length(attrs?.cornerBottomLeft) ?? all
  ];

  if (corners.every((corner) => corner <= 0)) return {};

  /*
    No `calc` and no variable here, which was tried.

    A motion that rounds a shape's corners needs "however much more than the
    document drew", and `border-radius` gets that from the Web Animations API
    itself: it is in `MUST_ADD`, so an additive keyframe of 0 → 16px on a static 8px
    ends at 24px. A custom property would have bought nothing and put a `calc()` in
    the style attribute of every rounded shape in the deck.
  */
  // One value when they agree, which is what a reader who set the single field
  // wrote and what they would expect to find in the file afterwards.
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  if (corners.every((corner) => corner === topLeft)) {
    return { borderRadius: `${px(topLeft)}px` };
  }

  return {
    borderRadius: `${px(topLeft)}px ${px(topRight)}px ${px(bottomRight)}px ${px(bottomLeft)}px`
  };
}
