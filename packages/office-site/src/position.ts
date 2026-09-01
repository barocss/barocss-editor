/**
 * **Where a block is**, when it is not simply the next thing in the column.
 *
 * ## The largest thing this product could not say
 *
 * A page here was a column of boxes and nothing else: no sticky header, no overlap, no badge hanging
 * off a card's corner, no portrait lifted into the band above it. Every other gap measured in this
 * package was an attribute nobody read; this one was a *category* of design with no vocabulary at
 * all, and it is the thing a reader tries in the first minute — every site on the web has a header
 * that follows you down the page.
 *
 * ## Two answers, because there are two
 *
 * - **sticky** — in the flow until the page scrolls past it, then held at an edge. A header, a
 *   sidebar that follows, a table's first row. The block keeps its space, so nothing under it moves.
 * - **absolute** — out of the flow, placed against the nearest stack. A badge on a corner, a scrim
 *   over a picture, a caption inside a banner. The block takes no space, so what it overlaps is what
 *   the reader put it over.
 *
 * `fixed` is deliberately absent. It positions against the *window*, which in this editor is the
 * tool's own chrome — a sticky banner would sit over the panel — and on a phone it is the single
 * commonest way a page becomes unusable, because a fixed bar plus a browser bar plus a keyboard is
 * most of a small screen. The day a cookie bar needs it, it needs it with an argument.
 *
 * ## The inset a sticky header forgets
 *
 * `position: sticky` with no `top` never sticks. It is the most-made mistake with this property —
 * the rule is valid, the browser accepts it, and nothing happens — so a sticky block that states no
 * inset is given `top: 0`, which is what every reader who typed 고정 meant. An absolute block with
 * no inset gets the top-left corner of its stack, for the same reason: a block that vanished into
 * `auto`/`auto` would look like the property had failed.
 *
 * ## Negative is allowed, and is the point
 *
 * `insetTop: -240` lifts a card into the band above it. Every layout tool has this and the reason
 * it is worth saying out loud is that the schema's other lengths are all sizes, where a negative
 * number is nonsense. These are **offsets**, so the panel takes one.
 *
 * ## Why every stack is `position: relative`
 *
 * An absolutely positioned block is placed against its nearest positioned ancestor, and if no stack
 * is positioned that is the page — so a badge meant for a card's corner would fly to the corner of
 * the document. Rather than a `positionsChildren` switch for a reader to remember to turn on, every
 * stack is `relative`: it changes no layout whatever, does **not** make a stacking context on its
 * own (that needs a `z-index` other than `auto`), and makes *the block you put it in* the thing it
 * is placed against, which is the only answer a reader ever means.
 */

/** Pixels per twip at 96dpi — exact, which is why placement never drifts. */
const PX_PER_TWIP = 96 / 1440;

const px = (twips: number): string => `${Math.round(twips * PX_PER_TWIP * 100) / 100}px`;

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export interface Placed {
  position?: unknown;
  insetTop?: unknown;
  insetRight?: unknown;
  insetBottom?: unknown;
  insetLeft?: unknown;
  zOrder?: unknown;
}

/** The two a page has. See the header for why `fixed` is not one of them. */
export const POSITIONS = ['sticky', 'absolute'] as const;

/**
 * The CSS a block's placement becomes — nothing at all when it states none, which is the ordinary
 * case and is why this could be added without moving a single existing page.
 *
 * `zOrder` is answered even without a position, because a **sticky** block and an ordinary one can
 * both need to be over or under something: a header that scrolls under a hero picture is one number.
 */
export function positionCss(attrs: Placed | undefined): Record<string, string> {
  const css: Record<string, string> = {};

  const order = number(attrs?.zOrder);
  if (order !== undefined) css.zIndex = String(Math.round(order));

  const said = attrs?.position;
  if (said !== 'sticky' && said !== 'absolute') return css;

  css.position = said;

  const sides = {
    top: number(attrs?.insetTop),
    right: number(attrs?.insetRight),
    bottom: number(attrs?.insetBottom),
    left: number(attrs?.insetLeft)
  };
  let any = false;
  for (const [side, value] of Object.entries(sides)) {
    if (value === undefined) continue;
    css[side] = px(value);
    any = true;
  }

  // The inset a sticky header forgets, and the corner an absolute block would otherwise vanish from.
  if (!any) {
    css.top = '0px';
    if (said === 'absolute') css.left = '0px';
  }

  return css;
}
