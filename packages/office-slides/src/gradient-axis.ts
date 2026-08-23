import type { Box } from './geometry';
import type { GradientPoint, Paint, PaintStop } from './paints';

/**
 * A gradient's axis on the shape itself: where its ends are, and where each stop
 * sits along it.
 *
 * The angle was a number in a box. Nobody aims a gradient by typing 135 — they
 * point at the corner they want it to come from, which is why every design tool
 * draws the axis *on the shape* and lets it be dragged. Figma, Sketch and
 * Illustrator all do; the number is what the tool writes down afterwards.
 *
 * ## The line is CSS's line, not a guess at one
 *
 * A CSS linear gradient runs along a line through the centre of the box, and its
 * length is `|w·sin a| + |h·cos a|` — chosen so the gradient's first and last
 * stops land exactly on the corners the direction points at. Drawing handles at
 * *any other* length would mean the reader dragging a stop to the end of the
 * line and watching the colour stop somewhere else.
 *
 * That formula is the whole of why this is a module with tests rather than four
 * lines in the overlay: it is the one thing here that cannot be checked by
 * looking at the screen, because being wrong by a few per cent looks like
 * nothing.
 *
 * ## Zero degrees is up
 *
 * CSS's convention, and a compass's: `0deg` runs *up* the box and the angle
 * grows clockwise. The trap is that a screen's y grows downwards, so the
 * direction vector's y is negated — the same sign that was wrong in the shadow
 * and in the slide transitions.
 */

export interface GradientAxis {
  /** Where the first stop is, in the shape's own coordinates. */
  from: { x: number; y: number };
  /** Where the last stop is. */
  to: { x: number; y: number };
  /** Each stop's point along the line, in the order the paint holds them. */
  stops: Array<{ x: number; y: number; offset: number }>;
}

/**
 * Whole twips, and never `-0`.
 *
 * `sin(180°)` is not zero but -1.2e-16, so a gradient running straight down puts
 * its handle at y = -2.8e-14 and its first stop at `-0`. Both draw in the right
 * place and both are noise: the model measures in twips, so a fraction of one
 * says nothing, and a `-0` in a comparison is the kind of difference that makes
 * a test fail for a reason nobody can see.
 */
const twip = (value: number): number => {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
};

const direction = (angle: number): { x: number; y: number } => {
  const radians = (angle * Math.PI) / 180;
  // y is negated: the angle is a compass bearing and the screen's y grows down.
  return { x: Math.sin(radians), y: -Math.cos(radians) };
};

/**
 * The length CSS gives the gradient line for a box at this angle.
 *
 * `|w·sin a| + |h·cos a|`, which is the projection of the box onto the
 * direction — the distance from one corner-perpendicular to the other.
 */
export function axisLength(box: Box, angle: number): number {
  const radians = (angle * Math.PI) / 180;
  return Math.abs(box.width * Math.sin(radians)) + Math.abs(box.height * Math.cos(radians));
}

/**
 * The axis for a paint on a box, or nothing for a paint that has no direction.
 *
 * A radial gradient's axis is a radius — drawn to the right, because a circle
 * has no direction of its own and a reader dragging a stop needs *a* line. A
 * solid and an image have none at all.
 */
export function gradientAxis(paint: Paint, box: Box): GradientAxis | undefined {
  if (paint.kind !== 'linear' && paint.kind !== 'radial' && paint.kind !== 'angular') {
    return undefined;
  }

  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const stops = paint.stops ?? [];
  if (stops.length < 2) return undefined;

  if (paint.kind === 'radial') {
    /**
     * The reader's own ellipse, when they have placed one.
     *
     * Horizontally, because that is the radius CSS lists first and the one the
     * stops are drawn along — and because a rotated radial is the thing CSS
     * refuses, so there is no other direction to honour.
     */
    const shaped = radialShape(paint);
    if (shaped) {
      const centre = { x: box.x + shaped.cx * box.width, y: box.y + shaped.cy * box.height };
      const edge = { x: centre.x + shaped.rx * box.width, y: centre.y };
      return {
        from: { x: twip(centre.x), y: twip(centre.y) },
        to: { x: twip(edge.x), y: twip(edge.y) },
        stops: stops.map((stop) => ({
          x: twip(centre.x + (edge.x - centre.x) * stop.offset),
          y: twip(centre.y),
          offset: stop.offset
        }))
      };
    }

    // From the centre outwards: a circle's stops run along any radius, and the
    // one a reader can point at is the one drawn.
    const radius = Math.max(box.width, box.height) / 2;
    const to = { x: twip(centre.x + radius), y: twip(centre.y) };
    return {
      from: { x: twip(centre.x), y: twip(centre.y) },
      to,
      stops: stops.map((stop) => ({
        x: twip(centre.x + radius * stop.offset),
        y: twip(centre.y),
        offset: stop.offset
      }))
    };
  }

  /**
   * The reader's own two points, when there are two.
   *
   * Which is what makes the handles say the truth: before this, the *from* handle
   * was wherever the centred axis happened to begin, so dragging it could only
   * turn the gradient. Now it is where the reader put it, and the axis drawn is
   * the segment the colours actually run along.
   */
  const held = gradientPoints(paint);
  if (held) {
    const from = { x: box.x + held.from.x * box.width, y: box.y + held.from.y * box.height };
    const to = { x: box.x + held.to.x * box.width, y: box.y + held.to.y * box.height };
    return {
      from: { x: twip(from.x), y: twip(from.y) },
      to: { x: twip(to.x), y: twip(to.y) },
      stops: stops.map((stop) => ({
        x: twip(from.x + (to.x - from.x) * stop.offset),
        y: twip(from.y + (to.y - from.y) * stop.offset),
        offset: stop.offset
      }))
    };
  }

  const angle = paint.angle ?? 180;
  const unit = direction(angle);
  const length = axisLength(box, angle);
  const half = length / 2;

  const from = { x: centre.x - unit.x * half, y: centre.y - unit.y * half };
  const to = { x: centre.x + unit.x * half, y: centre.y + unit.y * half };

  return {
    from: { x: twip(from.x), y: twip(from.y) },
    to: { x: twip(to.x), y: twip(to.y) },
    stops: stops.map((stop) => ({
      x: twip(from.x + unit.x * length * stop.offset),
      y: twip(from.y + unit.y * length * stop.offset),
      offset: stop.offset
    }))
  };
}

/**
 * The angle that points a gradient at a given place on the shape.
 *
 * What a reader means by dragging the far handle: the direction from the centre
 * to where they let go. Rounded to a whole degree, because a gradient at 134.7°
 * is a number nobody typed and everybody has to read afterwards.
 */
export function angleTowards(box: Box, point: { x: number; y: number }): number {
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;

  // `atan2(x, -y)`, not `atan2(y, x)`: zero is up and the angle grows clockwise.
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.round((degrees + 360) % 360);
}

/**
 * Where along the axis a point falls, as an offset from 0 to 1.
 *
 * The projection onto the line, which is what "drag a stop" means: a reader
 * moving a stop sideways off the axis has still moved it *along* the axis by
 * however much of their movement was in that direction, which is the behaviour
 * every gradient editor has and the only one that does not feel sticky.
 */
export function offsetAlong(axis: GradientAxis, point: { x: number; y: number }): number {
  const dx = axis.to.x - axis.from.x;
  const dy = axis.to.y - axis.from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return 0;

  const along = ((point.x - axis.from.x) * dx + (point.y - axis.from.y) * dy) / lengthSquared;
  return Math.min(1, Math.max(0, Math.round(along * 1000) / 1000));
}

/**
 * A stop added where a reader pointed.
 *
 * Shared by the panel's bar and the canvas's axis, because they are one gesture
 * in two places: a double-click on the gradient, wherever the gradient is drawn.
 * Written here rather than twice for the reason this repository keeps finding —
 * the second copy is the one that stops being fixed.
 *
 * **The nearest stop's colour**, not the colour the gradient shows at that point.
 * Interpolating would be better and cannot be done: a stop may hold
 * `theme:accent1`, and there is no midpoint between two *names*. So the new stop
 * matches its neighbour, which is a visible change only where the neighbours
 * differ — and it is the neighbour a reader is most likely to have meant.
 */
export function addStop(stops: PaintStop[], offset: number): PaintStop[] {
  const at = Math.min(1, Math.max(0, offset));
  const nearest = [...stops].sort(
    (a, b) => Math.abs(a.offset - at) - Math.abs(b.offset - at)
  )[0];
  const added = [...stops, { offset: at, color: nearest?.color ?? '#ffffff' }];
  /**
   * Sorted, because the *order* of the list is what CSS paints and a reader who
   * adds a stop in the middle means it to be in the middle. The panel's bar and
   * the canvas both number the dots from this list, so an unsorted one would
   * renumber every stop after the new one.
   */
  return added.sort((a, b) => a.offset - b.offset);
}

/**
 * A stop taken away, unless it is one of the last two.
 *
 * Two is the least a gradient can be: taking one more away would leave a colour
 * pretending to be a gradient, and the reading that keeps the document drawable
 * is to refuse. The caller gets the list back unchanged, which is what lets a
 * panel disable its button and a canvas ignore the key with the same check.
 */
export function removeStop(stops: PaintStop[], index: number): PaintStop[] {
  if (stops.length <= 2 || index < 0 || index >= stops.length) return stops;
  return stops.filter((_, at) => at !== index);
}

/**
 * The two points a gradient runs between — the thing an angle cannot say.
 *
 * ## What was wrong with an angle
 *
 * A `linear-gradient(45deg, …)` runs across the *whole box*, centred, with its
 * length derived from the box: `|w·sin a| + |h·cos a|`. So "this gradient starts a
 * quarter of the way in and ends past the shape's edge" — which is most of what a
 * reader does with a gradient in Figma — cannot be said at all. It could only be
 * approximated by moving the stops, which is a different thing: it changes where
 * the *colours* are and not where the gradient *is*, and the two come apart the
 * moment the shape is resized.
 *
 * ## Why fractions of the box and not twips
 *
 * Because the gradient has to survive a resize the way Figma's does. A point at
 * `{ x: 0.25, y: 0.5 }` is a quarter across and halfway down *whatever size the
 * shape becomes*; a point in twips would slide out of the shape the first time it
 * was made smaller. The motion path made the opposite choice for the opposite
 * reason — a path is a journey of a certain distance, not a proportion of a box.
 *
 * ## How it reaches CSS, which has no such syntax
 *
 * Measured, and the first idea was wrong: a gradient painted into a *smaller
 * background layer* (`background-size` + `position`) gives the axis exactly and is
 * transparent outside that layer, where CSS — and Figma — hold the end colour.
 *
 * What does work is arithmetic. CSS's own axis, for the direction the two points
 * imply, is longer than the reader's segment; the segment projects onto it as a
 * sub-range, so the *stops* are remapped into that range. Beyond the outer stops
 * CSS holds their colours, which is exactly the behaviour wanted. So the picture
 * is right and the declaration stays one `linear-gradient`.
 */

const clamp = (value: number): number => Math.min(1.5, Math.max(-0.5, value));

/**
 * A point the document may hold, from a point a drag produced.
 *
 * Exported because **writing** has to clamp too, not only reading. Measured: the
 * overlay wrote the raw fraction and a drag to the far side of the slide put
 * `x: 2.48` in the document — two and a half box-widths out. Drawing survived it
 * (the read clamps) and the *document* did not: the number round-trips through a
 * file, and the next reader to resize that shape inherits a gradient aimed into
 * the middle of nowhere.
 *
 * Half a box outside is the allowance, and it is deliberate: a gradient that
 * begins off the shape is the reason to hold points at all.
 */
export function gradientPoint(point: GradientPoint): GradientPoint {
  return { x: clamp(point.x), y: clamp(point.y) };
}

/** The two points a paint holds, in the box's proportions, or nothing. */
export function gradientPoints(paint: Paint): { from: GradientPoint; to: GradientPoint } | undefined {
  const from = paint.from;
  const to = paint.to;
  if (!from || !to) return undefined;
  if (![from.x, from.y, to.x, to.y].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return undefined;
  }
  // Half a box outside is allowed on purpose — a gradient that begins off the
  // shape is the whole point of holding points — and anything beyond that is a
  // drag nobody meant.
  return { from: gradientPoint(from), to: gradientPoint(to) };
}

/**
 * The angle two points imply, as CSS reads angles: 0° points up, clockwise.
 *
 * The same convention `angleTowards` uses, so a paint that holds points and one
 * that holds an angle mean the same thing by the same number.
 */
export function angleBetween(from: GradientPoint, to: GradientPoint, box: Box): number {
  const dx = (to.x - from.x) * box.width;
  const dy = (to.y - from.y) * box.height;
  if (dx === 0 && dy === 0) return 180;
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.round(((degrees % 360) + 360) % 360);
}

/**
 * Where the reader's two points fall on the axis CSS will actually paint.
 *
 * `0` and `1` for a segment that happens to span the whole box; usually something
 * inside, which is what the stops are remapped into. Returned as a pair rather
 * than a length so a caller cannot get the direction wrong: `t0` is the *from*
 * point even when the gradient runs up and to the left.
 */
export function axisRange(
  from: GradientPoint,
  to: GradientPoint,
  box: Box
): { t0: number; t1: number } {
  const angle = angleBetween(from, to, box);
  const unit = direction(angle);
  const length = axisLength(box, angle);
  if (length === 0) return { t0: 0, t1: 1 };

  const centre = { x: box.width / 2, y: box.height / 2 };
  const start = { x: centre.x - (unit.x * length) / 2, y: centre.y - (unit.y * length) / 2 };
  const along = (point: GradientPoint) => {
    const dx = point.x * box.width - start.x;
    const dy = point.y * box.height - start.y;
    return (dx * unit.x + dy * unit.y) / length;
  };
  return { t0: along(from), t1: along(to) };
}

/**
 * The stops as CSS has to receive them: the reader's offsets, squeezed into the
 * part of the box's own axis that their two points cover.
 *
 * A segment covering half the box turns `0 → 1` into `t0 → t1`, so the colours
 * change where the reader put them and hold outside — which is what CSS does past
 * an outer stop and what Figma draws.
 *
 * A zero-length segment is refused rather than divided by: two points in the same
 * place is a drag in progress, and the honest reading is the gradient it had.
 */
export function remapStops(
  stops: PaintStop[],
  range: { t0: number; t1: number }
): PaintStop[] {
  const span = range.t1 - range.t0;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-6) return stops;
  return stops.map((stop) => ({
    ...stop,
    offset: range.t0 + stop.offset * span
  }));
}

/**
 * A radial gradient's shape: where its centre is and how far it reaches.
 *
 * ## What CSS gives, measured
 *
 * ```
 * radial-gradient(circle at 30% 60%, …)              ✓ a centre a reader can move
 * radial-gradient(ellipse 80px 30px at 30% 60%, …)   ✓ two radii
 * radial-gradient(ellipse 40% 25% at 30% 60%, …)     ✓ radii as *percentages*
 * radial-gradient(… at 50% 50% / 30deg, …)           ✗ rejected — no rotation
 * ```
 *
 * So a radial gets a centre and two radii and stops there. A **rotated** ellipse
 * is what Figma draws and CSS cannot say: Figma stores a transform, and
 * `radial-gradient` has no syntax for one. That is the wall, and it is CSS's
 * rather than this model's — worth stating so nobody looks for the bug.
 *
 * ## Why the radii come out of the same two points
 *
 * `from` is the centre and `to` is the corner of the radii — so `|to − from|` on
 * each axis *is* the pair, and a radial needs no attribute a linear does not have.
 * Which keeps one shape of paint rather than two, and means a reader switching a
 * gradient from linear to radial keeps the placement they had.
 *
 * The percentages are of the box, so the ellipse survives a resize the way the
 * linear axis does.
 */
export function radialShape(
  paint: Paint
): { cx: number; cy: number; rx: number; ry: number } | undefined {
  const held = gradientPoints(paint);
  if (!held) return undefined;
  return {
    cx: held.from.x,
    cy: held.from.y,
    /**
     * A floor rather than a refusal.
     *
     * A radius of zero is a gradient with no gradient in it — CSS draws the last
     * colour flat — and a reader dragging a handle onto the centre has not asked
     * for that, they have overshot. One per cent of the box is small enough to
     * read as "as tight as it goes" and big enough to still be a gradient.
     */
    rx: Math.max(0.01, part(held.to.x - held.from.x)),
    ry: Math.max(0.01, part(held.to.y - held.from.y))
  };
}

/**
 * A distance along one axis, without the noise.
 *
 * `0.8 − 0.5` is `0.30000000000000004`, and the difference reaches nothing that
 * draws — the CSS output is two decimals of a per cent — but it reaches every
 * *comparison*, which is the same reason `twip` above rounds. Four decimals is a
 * ten-thousandth of the box, which is exactly the precision the percentage keeps.
 */
const part = (value: number): number => Math.round(Math.abs(value) * 10000) / 10000;

/** Two decimals of a per cent: a gradient's radius is not a measurement. */
const pc = (fraction: number): number => Math.round(fraction * 10000) / 100;

/**
 * The `radial-gradient` prelude — the part before the stops.
 *
 * Without points this is what it always was, `circle at 50% 50%`, because that is
 * what every document written before this means and a document may not change its
 * mind on being opened.
 */
export function radialCss(paint: Paint, box?: Box): string {
  // The box is not in the arithmetic — the radii are already proportions of it —
  // and is taken all the same: a caller with no box is a caller that cannot know
  // whether the shape has been placed, and the old `circle` is the right answer
  // for it. See `paintCss`, which is the one caller.
  const shape = box ? radialShape(paint) : undefined;
  if (!shape) return 'circle at 50% 50%';
  return `${pc(shape.rx)}% ${pc(shape.ry)}% at ${pc(shape.cx)}% ${pc(shape.cy)}%`;
}
