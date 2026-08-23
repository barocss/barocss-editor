import type { Box } from './geometry';
import { twipToPx } from './geometry';

/**
 * A path a shape travels: what the document stores, and the CSS it becomes.
 *
 * ## Why a kind of step and not an effect
 *
 * Every effect in the table is *frames*: a list of property values the browser
 * interpolates. A path is not — it needs a **style written before the animation
 * starts** (`offset-path`, and `offset-rotate` if the shape is to face the way it
 * is going), and then an animation of one property (`offset-distance`). No effect
 * has a prerequisite, and giving the table one would give it to all twelve.
 *
 * ## Why `offset-path` and not animated x and y
 *
 * A list of `translate` keyframes cannot curve — it corners at every point — and
 * cannot turn the shape to follow the curve. CSS Motion Path does both, and
 * measured, it composes with everything this product already animates:
 *
 * ```
 * offset-path: path("M 0 0 L 200 -100"), offset-distance 0% → 100%
 *   at   0%: (80, 180)     the element's *centre* lands on the path's start
 *   at 100%: (280, 80)
 * + a translate animation of 0 → −60px:  (280, 20)   ← added, not replaced
 * + the shape's own transform: rotate(45deg)          ← kept
 * inside a scale(0.5) stage: scales with it
 * ```
 *
 * This corrects what `docs/specs/motion-model.md` §5 first claimed — that a path
 * would collide with `translate` and would have to own the slot. It does not, so
 * a shape can travel a path *and* fade, pulse or grow at the same time.
 *
 * ## What the document stores: points, not a `path()` string
 *
 * Twips, relative to where the shape already is, as a list of points. Three
 * reasons, and the third is the one that decided it:
 *
 * 1. **A path has to be editable.** A reader drags its points; a `path()` string
 *    would have to be parsed back into points every time, and a parser for the
 *    whole SVG path grammar is a liability for a feature that only ever writes
 *    lines and curves.
 * 2. **The units are the model's.** Everything else on a slide is twips, and a
 *    path in CSS pixels would be the one measurement that changed meaning when a
 *    deck was resized.
 * 3. **Relative to the shape**, so moving the shape moves its path with it —
 *    which is what a reader means by "this shape's path" and what CSS does anyway
 *    (the path's origin is the element's own static position).
 *
 * So `(0, 0)` is *where the shape already is*, and a path that starts anywhere
 * else starts by jumping there.
 */

export interface PathPoint {
  /** Twips right of where the shape rests. */
  x: number;
  /** Twips below where the shape rests. */
  y: number;
}

/** Whether the shape turns to face the way it is travelling. */
export const FACINGS = ['fixed', 'path'] as const;
export type Facing = (typeof FACINGS)[number];

export const FACING_LABELS: Record<Facing, string> = {
  fixed: '방향 유지',
  path: '경로 방향으로'
};

/**
 * The paths a reader starts from.
 *
 * Nobody draws a path from nothing — every tool that has motion paths ships a
 * handful, and PowerPoint's list of sixty-four is the same six ideas at different
 * angles. These are the six, in twips, sized so they are visible on a 16:9 slide
 * (a slide is 20160 × 11340 twips) and small enough not to leave it.
 */
export const PATH_PRESETS = [
  {
    id: 'right',
    label: '오른쪽으로',
    smooth: true,
    points: [
      { x: 0, y: 0 },
      { x: 4800, y: 0 }
    ]
  },
  {
    id: 'up',
    label: '위로',
    points: [
      { x: 0, y: 0 },
      { x: 0, y: -3000 }
    ]
  },
  {
    // The one that makes a path worth having: a curve a straight `translate`
    // cannot draw at all.
    id: 'arc',
    label: '호를 그리며',
    points: [
      { x: 0, y: 0 },
      { x: 2400, y: -2400 },
      { x: 4800, y: 0 }
    ]
  },
  {
    id: 'sCurve',
    label: 'S자로',
    points: [
      { x: 0, y: 0 },
      { x: 1800, y: -1800 },
      { x: 3600, y: 1800 },
      { x: 5400, y: 0 }
    ]
  },
  {
    // The one preset that is entirely about its corners: smoothed, it is a wave.
    id: 'zigzag',
    label: '지그재그',
    smooth: false,
    points: [
      { x: 0, y: 0 },
      { x: 1500, y: -1200 },
      { x: 3000, y: 1200 },
      { x: 4500, y: -1200 },
      { x: 6000, y: 0 }
    ]
  },
  {
    id: 'loop',
    label: '한 바퀴 돌아',
    points: [
      { x: 0, y: 0 },
      { x: 2400, y: -2400 },
      { x: 4800, y: 0 },
      { x: 2400, y: 2400 },
      { x: 0, y: 0 }
    ]
  }
] as const;

export type PathPresetId = (typeof PATH_PRESETS)[number]['id'];

/**
 * A preset's path, and whether it turns sharply.
 *
 * Both, because they are one answer: 지그재그 with its corners rounded off is a
 * wave, which is a different path rather than a different drawing of the same one.
 */
export function pathPreset(
  id: string | undefined
): { points: PathPoint[]; smooth: boolean } | undefined {
  const found = PATH_PRESETS.find((preset) => preset.id === id);
  if (!found) return undefined;
  return {
    points: found.points.map((point) => ({ ...point })),
    smooth: (found as { smooth?: boolean }).smooth !== false
  };
}

/**
 * A stored path, read back — and refused when it is not one.
 *
 * A path of one point is not a path: the shape would travel nowhere and the step
 * would be a bar on the timeline that does nothing. Sixty-four points is more
 * than any reader has placed by hand and the point at which a `path()` string
 * stops being something a person can read in a file.
 */
export function pathPointsOf(value: unknown): PathPoint[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > 64) return undefined;

  const points: PathPoint[] = [];
  for (const entry of value) {
    const x = (entry as PathPoint | undefined)?.x;
    const y = (entry as PathPoint | undefined)?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    points.push({ x: Math.round(x as number), y: Math.round(y as number) });
  }
  return points;
}

/**
 * A smooth curve through the points, as an SVG path.
 *
 * Catmull-Rom converted to cubic beziers, which is the standard answer to "draw a
 * curve through these points" and the one every drawing tool uses for a smoothed
 * polyline: the curve *passes through* every point the reader placed, rather than
 * being pulled towards it. A reader who drops a point on a spot expects the shape
 * to go over that spot.
 *
 * Two points are a straight line, because a curve through two points is one.
 *
 * The tension is a sixth, which is the conversion that makes a Catmull-Rom
 * segment and a cubic bezier the same curve. Written as a constant with its name
 * rather than as `/6` in three places, because a wrong tension looks like a
 * slightly wobbly path and nothing else.
 */
const CATMULL_ROM = 1 / 6;

export function pathData(
  points: PathPoint[],
  offset: PathPoint = { x: 0, y: 0 },
  /**
   * Whether the corners are rounded off.
   *
   * Every path was smoothed, which drew the zigzag preset as a *wave* — the one
   * shape of travel that is entirely about its corners. A flag rather than a
   * per-point one because a reader means it about the path: "this route turns
   * sharply" is one decision, and a path with three smooth corners and one sharp
   * is a curve nobody has asked for yet.
   */
  smooth = true
): string {
  const at = (index: number): PathPoint => {
    const point = points[Math.min(points.length - 1, Math.max(0, index))];
    return { x: point.x + offset.x, y: point.y + offset.y };
  };

  const round = (value: number) => Math.round(value * 100) / 100;
  const start = at(0);

  if (!smooth) {
    // A polyline: the corners are where the reader put them.
    return points
      .map((_, index) => {
        const point = at(index);
        return `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`;
      })
      .join(' ');
  }

  if (points.length === 2) {
    const end = at(1);
    return `M ${round(start.x)} ${round(start.y)} L ${round(end.x)} ${round(end.y)}`;
  }

  let data = `M ${round(start.x)} ${round(start.y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = at(index - 1);
    const from = at(index);
    const to = at(index + 1);
    const after = at(index + 2);

    const c1 = {
      x: from.x + (to.x - before.x) * CATMULL_ROM,
      y: from.y + (to.y - before.y) * CATMULL_ROM
    };
    const c2 = {
      x: to.x - (after.x - from.x) * CATMULL_ROM,
      y: to.y - (after.y - from.y) * CATMULL_ROM
    };
    data += ` C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(to.x)} ${round(to.y)}`;
  }
  return data;
}

/**
 * The `offset-path` a shape gets, in CSS pixels.
 *
 * Two conversions, and the second is the one that is easy to miss.
 *
 * **Twips to pixels**, because the model measures a slide physically and CSS does
 * not — the same conversion every placement makes.
 *
 * **Plus half the shape**, because `offset-anchor` defaults to the transform
 * origin: the element's *centre* is placed on the path, while the path's own
 * origin is the element's static top-left. Measured — a 40×40 box at (100, 200)
 * with a path starting at `0 0` drew at (80, 180). So a point of `(0, 0)` only
 * means "where the shape already is" if the path is shifted by half the shape,
 * which is what this does.
 *
 * The alternative is `offset-anchor: 0 0`, and it is worse: a shape facing along
 * its path would then turn about its top-left corner and swing.
 */
export function pathCss(
  points: PathPoint[],
  box: Pick<Box, 'width' | 'height'>,
  smooth = true
): string {
  const centre = {
    x: twipToPx(box.width) / 2,
    y: twipToPx(box.height) / 2
  };
  const asPixels = points.map((point) => ({ x: twipToPx(point.x), y: twipToPx(point.y) }));
  return `path("${pathData(asPixels, centre, smooth)}")`;
}

/** What CSS is told about facing: `auto` turns the shape, `0deg` does not. */
export function facingCss(facing: Facing | undefined): string {
  return facing === 'path' ? 'auto' : '0deg';
}

/**
 * How far the path goes, in twips — the length of the polyline through its
 * points.
 *
 * Not the curve's arc length, which needs sampling: the polyline is within a few
 * per cent of it for the paths a reader draws, and what this is *for* is telling
 * a reader how far the shape travels so they can choose a duration. A number that
 * is right to the twip would not change any decision.
 */
export function pathLength(points: PathPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index].x - points[index - 1].x;
    const dy = points[index].y - points[index - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return Math.round(total);
}

/**
 * A point moved, with the path kept inside the range a step may hold.
 *
 * Dragging a point is the whole authoring gesture, and the arithmetic is here
 * rather than in the overlay for the same reason the gradient axis's is: it is the
 * one part that cannot be checked by looking at the screen, because being wrong by
 * a little looks like nothing.
 */
export function movePoint(points: PathPoint[], index: number, to: PathPoint): PathPoint[] {
  if (index < 0 || index >= points.length) return points;
  const next = points.map((point) => ({ ...point }));
  // A slide is 20160 × 11340 twips; twice that in either direction is a path
  // that leaves the slide and comes back, which is a real thing to want, and ten
  // times it is a drag that got away.
  next[index] = {
    x: Math.max(-40000, Math.min(40000, Math.round(to.x))),
    y: Math.max(-40000, Math.min(40000, Math.round(to.y)))
  };
  return next;
}

/** A point added between two others, which is how a path gains a bend. */
export function addPoint(points: PathPoint[], after: number): PathPoint[] {
  if (points.length >= 64 || after < 0 || after >= points.length - 1) return points;
  const from = points[after];
  const to = points[after + 1];
  const middle = { x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2) };
  return [...points.slice(0, after + 1), middle, ...points.slice(after + 1)];
}

/** A point removed, unless it is one of the two a path cannot do without. */
export function removePoint(points: PathPoint[], index: number): PathPoint[] {
  if (points.length <= 2 || index < 0 || index >= points.length) return points;
  return points.filter((_, at) => at !== index);
}
