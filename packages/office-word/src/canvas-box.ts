/**
 * A box on a canvas, and what a node carries about where it is.
 *
 * ## Why this is in the shared layer
 *
 * It was in two places. `office-slides/geometry.ts` had `Box`, `Placement` and `boxOf`; and
 * `canvas-layout.ts` had a **second `boxOf`** with the same normalisation and a comment explaining
 * that it was written again rather than imported, because the dependency runs this way. Two copies
 * of one rule, and the rule is not a taste: a negative extent is what dragging a handle past the
 * opposite edge means, and every reader that forgot it would draw nothing where a shape is.
 *
 * `docs/SHARED-LAYER.md`'s test: "a rectangle in the model's units, with the origin at the top left
 * of what holds it" names no product, and a page's drawing and a slide both hold shapes this way.
 */

/** A rectangle in the model's units, with the origin at the top left of what holds it. */
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
  /** Mirrored, which composes with the rotation. */
  flipX?: boolean;
  flipY?: boolean;
}

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * A box from whatever the node actually carries.
 *
 * Two things are normalised because a drag produces both and neither is worth pushing into every
 * reader:
 *
 * - A **negative extent**, which is what dragging a resize handle past the opposite edge means.
 *   `x: 100, width: -40` is the box from 60 to 100, and saying so here means no renderer, hit test
 *   or alignment has to think about it. CSS would simply drop a negative width and draw nothing.
 * - A **missing extent**, which is a shape whose size nothing set. Zero, not a guess: an invisible
 *   box in the right place is debuggable and a 100×100 default in the wrong place is a mystery.
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
