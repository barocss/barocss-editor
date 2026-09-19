/**
 * **A turn, read as a direction** — and the negative zero that four copies of it kept catching
 * separately.
 *
 * ## One sentence, four transcriptions
 *
 * `{ x: sin θ, y: −cos θ }`, θ in degrees clockwise from *up*. It is CSS's convention for a gradient
 * and PowerPoint's for a shadow, and it is written out in four places across two products:
 *
 * | | |
 * |---|---|
 * | `office-slides/svg-paint.ts:76` | a gradient's axis, as two points in a box's proportions |
 * | `office-slides/gradient-axis.ts:60` | the same axis, in twips, for the handle a reader drags |
 * | `office-slides/paints.ts:543` | a drop shadow's offset, written into the **document** |
 * | `office-site/paint.ts:179` | a card's shadow, as `box-shadow` — *"The deck's arithmetic, exactly … Copied rather than reinvented"* |
 *
 * The site's copy says why it was copied: *two products where `shadowAngle: 45` means two different
 * directions would be one document drawn two ways*. That reasoning is right and it is the argument
 * for one function rather than for a careful copy — which is what this is.
 *
 * ## The trap, and which of the four already knew about it
 *
 * `cos(90°)` is 6.1e-17, not 0, and `sin(180°)` is −1.2e-16. So a shadow thrown straight sideways or
 * a gradient running straight down produces a value that rounds to **`-0`**. Three of the four guard
 * it; `svg-paint.ts` does not, and gets away with it only because its numbers are offsets from 0.5.
 *
 * `-0` is not a display problem. `office-slides/paints.ts:530` states the sharp version: in a shadow
 * the number is written *into the document*, so it survives saving and appears in every diff of that
 * file for ever. And `-0 === 0` is true while `Object.is(-0, 0)` is false, so it is a difference two
 * checks disagree about.
 *
 * So the rounding is part of the function rather than left to the caller: every caller wanted it,
 * three of them wrote it, and the one that would have needed it next is the one that had not.
 */

/** A direction as a unit vector, from an angle in degrees clockwise from up. */
export interface Direction {
  x: number;
  y: number;
}

/** Never `-0`. See the note above for why this is arithmetic rather than presentation. */
export const notMinusZero = (value: number): number => (value === 0 ? 0 : value);

/**
 * The unit vector an angle points along.
 *
 * `y` is negated because the angle is a compass bearing — 0° is up — and the screen's y grows down.
 * A gradient at 180° runs down the shape and a shadow at 180° falls below it, which is the test both
 * products state.
 *
 * Unrounded: a unit vector's components are proportions, and a caller that is about to multiply by a
 * distance wants the noise still in it. `offsetAt` is the rounded one.
 */
export function directionOf(angle: number): Direction {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
}

/**
 * How far and which way — a distance thrown along an angle, rounded and free of `-0`.
 *
 * `round` is handed in because the two callers measure in different things and neither is the
 * other's default: a shadow written into the document is whole twips (`Math.round`), and one written
 * into a style attribute is pixels to two decimals. Passing the rounding in is what lets one
 * function serve both without either of them rounding twice.
 */
export function offsetAt(
  angle: number,
  distance: number,
  round: (value: number) => number = Math.round
): Direction {
  const along = directionOf(angle);
  return {
    x: notMinusZero(round(distance * along.x)),
    y: notMinusZero(round(distance * along.y))
  };
}

/**
 * **A point turned about a centre** — degrees, clockwise, with the screen's y growing down.
 *
 * The other angle this package reads. It was written twice *inside* this package while the door
 * was being narrowed: `canvas-connector.ts`'s `rotateAround` and `canvas-manipulate.ts`'s
 * `unrotate`, which is this same matrix with the sign flipped and the centre taken from a box. The
 * two are the same arithmetic asked from opposite ends — a connector asks *where is the magnet on
 * a shape that has been turned*, and a hit test asks *where is the pointer in the shape's own
 * frame* — and `unrotate(box, r, p)` is exactly `rotatePoint(p, centre(box), −r)`.
 *
 * Not on the package's door: nothing outside asks for it by name, and both callers are exported
 * under the names their own readers already use.
 *
 * `!degrees` returns the point untouched rather than passing it through `cos 0 = 1`, which keeps a
 * shape that was never turned bit-identical instead of merely equal — the same reason the `-0`
 * above is arithmetic rather than presentation.
 */
export function rotatePoint(
  point: { x: number; y: number },
  centre: { x: number; y: number },
  degrees: number
): { x: number; y: number } {
  if (!degrees) return point;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return {
    x: centre.x + dx * cos - dy * sin,
    y: centre.y + dx * sin + dy * cos
  };
}
