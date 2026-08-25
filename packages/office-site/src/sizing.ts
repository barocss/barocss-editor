/**
 * What a stack's child means to do with the space along the axis.
 *
 * ## Why this had to be said, when nothing else did
 *
 * Every other question a site builder asks was already answered somewhere in this repository. This
 * one was not, and the reason is worth writing down: **silence already means two different things.**
 * A `<div>` with no width hugs its content; the same `<div>` as a flex child fills the axis if it is
 * told to grow and hugs if it is not. So "no width stated" cannot be read as an intent — it is the
 * absence of one, and the browser's default depends on where the box happens to be.
 *
 * Three answers, which is what every layout tool offers because there are three:
 *
 * - **fill** — take the space the stack has left. `flex: 1` along the axis, plus `min-width: 0` so a
 *   long word cannot push a row wider than its container, which is the single most common way a
 *   flex row breaks and the reason `minWidth` is a separate attribute rather than this.
 * - **hug** — be as wide as what is inside. `width: fit-content`, and `flex: 0 0 auto` so a stack
 *   does not stretch it back.
 * - **fixed** — the width the node states, which is what a placed box has always meant. Written as
 *   `flex: none` so the stack leaves it alone.
 *
 * Silence keeps meaning silence: a node that says nothing gets no sizing CSS at all, and the page
 * draws exactly as it did before this attribute existed.
 *
 * ## Twips, here as everywhere
 *
 * `minWidth` and `maxWidth` are lengths in the model's own unit, converted once. A site builder is
 * the first product where a reader types a *pixel* — the web's unit — and that conversion belongs in
 * the panel that reads it, not here: one unit in the document is what has kept a slide, a page and a
 * card able to hold each other's boxes.
 */

/** Pixels per twip at 96dpi — exact, which is why placement never drifts. */
const PX_PER_TWIP = 96 / 1440;

const px = (twips: number): string => `${Math.round(twips * PX_PER_TWIP * 100) / 100}px`;

export interface Sized {
  sizing?: unknown;
  minWidth?: unknown;
  maxWidth?: unknown;
}

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** The CSS a child's own intent becomes. Empty when it states none. */
export function sizingCss(attrs: Sized | undefined): Record<string, string> {
  const css: Record<string, string> = {};

  switch (attrs?.sizing) {
    case 'fill':
      css.flex = '1 1 0%';
      /*
       * The line that makes a row of cards survive a long word. A flex item's `min-width` is `auto`,
       * which means "at least as wide as my content" — so one unbreakable string in one card pushes
       * every other card narrower and the row past its container. Every layout tool sets this and
       * none of them mentions it.
       */
      css.minWidth = '0';
      break;
    case 'hug':
      css.flex = '0 0 auto';
      css.width = 'fit-content';
      break;
    case 'fixed':
      // The width the node already states; the stack is told not to stretch or shrink it.
      css.flex = 'none';
      break;
    default:
      break;
  }

  const min = number(attrs?.minWidth);
  const max = number(attrs?.maxWidth);
  if (min !== undefined) css.minWidth = px(min);
  if (max !== undefined) css.maxWidth = px(max);

  return css;
}
