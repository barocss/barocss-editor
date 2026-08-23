/**
 * A box mirrored — the gesture every drawing tool has and this one did not.
 *
 * ## Why it is two attributes and not a negative size
 *
 * A width below zero is the other way to say this, and it is the way that breaks
 * everything else: every reader of a box — the overlay's handles, the align
 * arithmetic, a frame's layout, the conformance harness — assumes a size is a
 * size. `manipulate.ts` already learned the neighbouring lesson, sorting a
 * dragged box's sides rather than letting them cross, and its comment says why:
 * "flipping is a real and useful thing to do while resizing" *and* the model that
 * comes out of it has to stay a rectangle.
 *
 * So a flip is a fact about how the box is *drawn*, kept beside the rotation it
 * composes with, and the geometry stays a geometry.
 *
 * ## Why it is Slides' and not the office schema's
 *
 * A deck draws a shape as an HTML box, so a mirror is `scaleX(-1)` in the same
 * `transform` the rotation is already in. Word draws its shapes as SVG, where a
 * mirror is a different implementation — so this is declared where it is read,
 * the same rule the gradients, the corners and the crop follow.
 *
 * ## What it composes with, and the one thing to be careful about
 *
 * The renderer writes `transform: rotate(30deg) scaleX(-1)`, and the *order*
 * matters: rotating a mirrored box and mirroring a rotated one are different
 * pictures. Rotation first is what every tool shows — the shape turns as the
 * reader set it, and the mirror is applied to the result — and it is also what
 * keeps a flip from changing the rotation a reader typed.
 *
 * Motion is unaffected, and that is not luck: an animation composes through the
 * *individual* `translate`/`rotate`/`scale` properties (see
 * `docs/specs/motion-model.md` §1), which apply outside `transform` — so a
 * mirrored shape still flies in from the left of the **screen**.
 */

/** The two mirrors a box can carry, on top of whatever the office schema says. */
export const FLIP_ATTRS = {
  /** Mirrored left-to-right. */
  flipX: { type: 'boolean' as const, default: false },
  /** Mirrored top-to-bottom. */
  flipY: { type: 'boolean' as const, default: false }
};

export type FlipAxis = 'x' | 'y';

interface FlipAttrs {
  flipX?: unknown;
  flipY?: unknown;
}

/** Whether a box is mirrored on an axis, read the way every attribute is read. */
export function flipped(attrs: FlipAttrs | undefined, axis: FlipAxis): boolean {
  return (axis === 'x' ? attrs?.flipX : attrs?.flipY) === true;
}

/**
 * The box's mirror, as the CSS functions that go *after* the rotation.
 *
 * Empty when there is nothing to mirror, so a shape nobody has flipped carries
 * no `scale` at all — the same rule the rest of `placementCss` follows, and worth
 * keeping because `transform` creates a containing block and a shape that has one
 * for no reason is a shape that positions its children differently.
 */
export function flipCss(attrs: FlipAttrs | undefined): string {
  const parts: string[] = [];
  if (flipped(attrs, 'x')) parts.push('scaleX(-1)');
  if (flipped(attrs, 'y')) parts.push('scaleY(-1)');
  return parts.join(' ');
}

/**
 * What flipping *this* box on an axis writes — a toggle, per box.
 *
 * Per box rather than per selection, and that is the interesting decision: with
 * one mirrored shape and one not, a reader pressing 좌우 뒤집기 could mean "make
 * them both mirrored" or "mirror each of them". Every tool means the second, and
 * so does the word: the gesture is *flip*, not *set flipped*. Which also makes it
 * its own undo of itself, pressed twice.
 */
export function flipChange(attrs: FlipAttrs | undefined, axis: FlipAxis): Record<string, boolean> {
  return axis === 'x' ? { flipX: !flipped(attrs, 'x') } : { flipY: !flipped(attrs, 'y') };
}
