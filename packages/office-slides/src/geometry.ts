/**
 * Where a thing sits on a slide.
 *
 * A page and a slide differ in exactly one way that matters to rendering: a
 * page *flows* and a slide *places*. Word's whole layout problem is deciding
 * where a paragraph ends up, because nothing says — it depends on what came
 * before it, how wide the column is, and where the page ran out. A slide says.
 * Every scene node carries `x`, `y`, `width`, `height`, and that is the answer.
 *
 * Which is why this file is small and pure, and why it is the whole layout
 * engine for the product. There is no measurement feedback loop here, nothing
 * to converge, and no second pass: the model already holds the positions, so
 * drawing is a coordinate conversion. The hard-won machinery in
 * `office-word/pagination` has no counterpart here and needs none.
 *
 * ## The unit
 *
 * Twips, like everything else in this engine. A slide is a physical surface —
 * 13.33in by 7.5in — that gets printed and exported to PDF, so it belongs in
 * the same unit as a page rather than in the pixels `canvasBlock` uses for a
 * drawing embedded in flow. At 96dpi a twip is exactly 1/15 of a pixel, so the
 * default 16:9 slide is 1280x720 and the conversion is exact rather than
 * approximate — no rounding drift between the model and the screen.
 *
 * The two disagree today and the schema does not say which is which. That is
 * noted in `docs/BACKLOG.md`; the honest answer is that `geometry` needs a unit
 * in the schema rather than in two files' comments.
 */

/** Pixels per twip at 96dpi: exact, which is why placement never drifts. */
const PX_PER_TWIP = 96 / 1440;

export const twipToPx = (twip: number): number => twip * PX_PER_TWIP;
export const pxToTwip = (px: number): number => px / PX_PER_TWIP;

/** A rectangle in twips, with the origin at the slide's top left. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a scene node carries about where it is and how it looks. */
export interface Placement {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
}

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * A box from whatever the node actually carries.
 *
 * Two things are normalised because a drag produces both and neither is worth
 * pushing into every reader:
 *
 * - A **negative extent**, which is what dragging a resize handle past the
 *   opposite edge means. `x: 100, width: -40` is the box from 60 to 100, and
 *   saying so here means no renderer, hit test or alignment has to think about
 *   it. CSS would simply drop a negative width and draw nothing.
 * - A **missing extent**, which is a shape whose size nothing set. Zero, not a
 *   guess: an invisible box in the right place is debuggable and a 100x100
 *   default in the wrong place is a mystery.
 */
export function boxOf(placement: Placement | undefined): Box {
  const x = finite(placement?.x, 0);
  const y = finite(placement?.y, 0);
  const width = finite(placement?.width, 0);
  const height = finite(placement?.height, 0);

  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height)
  };
}

/** Whether anything should be drawn for this node at all. */
export function isVisible(placement: Placement | undefined): boolean {
  return placement?.visible !== false;
}

export type CssStyle = Record<string, string>;

/**
 * The CSS that puts a scene node where the model says it is.
 *
 * Absolute against the slide, which is the only positioning scheme that says
 * what the model says. The alternative — a flow with margins — would mean the
 * browser deciding positions the document has already decided, and every
 * subsequent question ("what is under the pointer", "do these two overlap")
 * would have to ask the DOM instead of the model.
 *
 * **Rotation turns about the centre**, matching every drawing tool there is and
 * matching `office-word/shapes`, which had to say the same thing for SVG. A
 * shape that rotated about the slide's origin would fly off it.
 *
 * **No z-index.** Paint order is document order, because the model is a tree
 * and a tree is ordered. Bring-to-front is `moveNode`, an operation that
 * already exists and already has an inverse — where a `zOrder` attribute would
 * be a second ordering to keep agreeing with the first.
 */
export function placementCss(placement: Placement | undefined): CssStyle {
  const box = boxOf(placement);
  const css: CssStyle = {
    position: 'absolute',
    left: `${twipToPx(box.x)}px`,
    top: `${twipToPx(box.y)}px`,
    width: `${twipToPx(box.width)}px`,
    height: `${twipToPx(box.height)}px`
  };

  const rotation = finite(placement?.rotation, 0);
  if (rotation !== 0) css.transform = `rotate(${rotation}deg)`;

  // Only when it is not 1: an opacity of 1 still makes the element its own
  // compositing layer, and a slide is made of dozens of these.
  const opacity = finite(placement?.opacity, 1);
  if (opacity !== 1) css.opacity = String(opacity);

  if (!isVisible(placement)) css.display = 'none';

  return css;
}

/** 16:9 in twips — 13.33in x 7.5in, which is 1280x720 CSS pixels exactly. */
export const SLIDE_16_9: Readonly<{ width: number; height: number }> = {
  width: 19200,
  height: 10800
};

/** 4:3, for a deck that wants it — 960x720 CSS pixels. */
export const SLIDE_4_3: Readonly<{ width: number; height: number }> = {
  width: 14400,
  height: 10800
};

/**
 * How big this slide is.
 *
 * A slide carries its own size because a deck may mix them — a wide diagram
 * slide in a 4:3 deck is a real thing — and because the alternative is a
 * document-level setting that every reader has to reach up for.
 */
export function slideSize(attrs: { width?: unknown; height?: unknown } | undefined): {
  width: number;
  height: number;
} {
  return {
    width: finite(attrs?.width, SLIDE_16_9.width),
    height: finite(attrs?.height, SLIDE_16_9.height)
  };
}

/**
 * The scale that fits a slide in the space available.
 *
 * `transform: scale`, applied by the app to the slide box. Not CSS `zoom`: zoom
 * is a *layout* operation, so the browser re-lays-out at the zoomed size and
 * rounds at every box, and measured positions drift from computed ones. Scale
 * is visual and exact — the same lesson Word's ruler had to learn about reading
 * a scaled element's size back.
 *
 * Clamped at 1 by default so a slide never grows past its natural size in an
 * editor, where drawing text at 3x makes every hinting and subpixel decision
 * different from the one the reader will see. Pass `max: Infinity` to lift the
 * cap, which is what presenting does.
 */
export function fitScale(
  slide: { width: number; height: number },
  viewport: { width: number; height: number },
  options: { padding?: number; max?: number } = {}
): number {
  const padding = finite(options.padding, 0);
  /**
   * `Infinity` is a real answer here, and `finite` refuses it.
   *
   * "No cap" is exactly what presenting asks for — a projector is the one case
   * where a slide should be drawn above its natural size — and passing
   * `Infinity` silently became `1`, so the presented slide stayed 1280px wide
   * in the middle of a 1600px screen with nothing reporting a problem.
   */
  const max = options.max === Infinity ? Infinity : finite(options.max, 1);

  const available = {
    width: viewport.width - padding * 2,
    height: viewport.height - padding * 2
  };

  const natural = { width: twipToPx(slide.width), height: twipToPx(slide.height) };
  if (natural.width <= 0 || natural.height <= 0) return max;
  // A viewport too small to hold anything is not a reason to return a negative
  // scale, which would draw the slide mirrored.
  if (available.width <= 0 || available.height <= 0) return 0;

  return Math.min(max, available.width / natural.width, available.height / natural.height);
}

/**
 * Zooming, and the reason it is arithmetic rather than a CSS property.
 *
 * A reader zooming in is not asking for a bigger number in a box: they are
 * asking to look more closely *at the thing under the pointer*. If the scale
 * changes and the scroll does not, the thing they were looking at slides away —
 * which is what makes a naive zoom feel like the tool is dodging them.
 *
 * So a zoom is two changes that have to happen together, and this computes the
 * second from the first.
 */

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;

/** What the steppers offer, which is what a reader reaches for by name. */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export const clampZoom = (zoom: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

/**
 * Which point of the content is under the pointer, as a fraction of it.
 *
 * A fraction rather than a distance, because it is the one description that
 * survives the content being redrawn at a different size — which is the whole
 * of what zooming does.
 */
export function anchorOf(
  pointer: { x: number; y: number },
  content: { left: number; top: number; width: number; height: number }
): { x: number; y: number } {
  return {
    x: content.width > 0 ? (pointer.x - content.left) / content.width : 0.5,
    y: content.height > 0 ? (pointer.y - content.top) / content.height : 0.5
  };
}

/**
 * How far to scroll so that fraction lands back under the pointer.
 *
 * Measured after the fact rather than predicted, and that is the correction
 * this replaced: the first version computed the new scroll from the old one,
 * assuming the content's origin was `-scrollLeft`. It is not — the stage
 * centres the slide while it is smaller than the pane, so the origin also
 * carries a margin that changes as the zoom crosses the point where the slide
 * stops fitting. Measured drift on a four-notch zoom: 12% of the slide's width.
 *
 * Reading where the content actually ended up asks no question about how it got
 * there, so centring, padding and scrollbars are all already accounted for.
 */
export function anchorShift(
  pointer: { x: number; y: number },
  content: { left: number; top: number; width: number; height: number },
  anchor: { x: number; y: number }
): { dx: number; dy: number } {
  return {
    dx: content.left + anchor.x * content.width - pointer.x,
    dy: content.top + anchor.y * content.height - pointer.y
  };
}

/**
 * The next zoom up or down the ladder.
 *
 * A ladder rather than a multiplier, so the steppers land on the round numbers
 * a reader recognises — 50%, 100%, 200% — instead of wherever repeated
 * multiplication happens to put them.
 */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const steps = ZOOM_STEPS;
  if (direction > 0) {
    const next = steps.find((step) => step > zoom + 0.001);
    return clampZoom(next ?? zoom * 1.25);
  }
  const previous = [...steps].reverse().find((step) => step < zoom - 0.001);
  return clampZoom(previous ?? zoom / 1.25);
}
