/**
 * A line that remembers **what it joins**.
 *
 * A `line` remembers a place: two coordinates, and moving a shape beside it changes
 * nothing. A connector remembers the pair, so moving either shape moves the line —
 * which is the whole feature, because a flowchart, an org chart or an architecture
 * diagram is mostly the work of re-drawing lines after moving a box.
 *
 * ## Why the arithmetic is here
 *
 * In `office-word` for the same reason `canvas-layout.ts` is: the canvas is Word's —
 * `shapes.ts`, `canvasBlock` and the shape renderers live here and Slides overrides
 * them — and a connector is a scene node reachable in a Word document through
 * `canvasBlock`. Two products with two answers for where a line leaves a circle would
 * be one document drawn two ways.
 *
 * ## Why it is all pure
 *
 * Every decision below draws a *plausible* wrong picture when it is wrong: a straight
 * line to a side's midpoint that cuts through its own shape, a curve whose handle
 * length bulges it over the neighbours, a clip on a rectangle where the shape is a
 * circle. None of those throw and none of them look like a fault in a screenshot, so
 * they are unit tests — see `docs/specs/canvas-model.md` §8 for the decisions.
 *
 * Twips throughout, like every other length in this model.
 */

/** Where a shape is, as this needs it. `rotation` is degrees, clockwise. */
export interface ConnectorBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  /**
   * The shape's outline, when it is not a rectangle.
   *
   * `ellipse`, `diamond`, `triangle` — anything else is clipped as a rectangle. A
   * rectangle's corner is outside all three, so a line clipped there stops short of
   * the shape and floats.
   */
  outline?: string;
}

export interface Point {
  x: number;
  y: number;
}

/** A magnet: a side's midpoint, the centre, or "wherever is nearest". */
export type ConnectorSide = 'auto' | 'n' | 'e' | 's' | 'w' | 'c';

/** The route a connector takes. */
export type ConnectorKind = 'straight' | 'elbow' | 'curve' | 'arc';

/** One end of a connector, as the document holds it. */
export interface ConnectorEnd {
  /** The shape it holds, or nothing for an end pinned to the canvas. */
  nodeId?: string;
  /** Where it is — kept even while attached, so a deleted shape leaves the line. */
  x: number;
  y: number;
  side: ConnectorSide;
  /**
   * How far along, when what it holds is **another line** — a flowchart's branch off
   * the middle of a flow.
   *
   * A fraction of the held line's *length*, and it has to be: a line has no sides to
   * be a magnet of, and "halfway along" means the halfway a reader can see rather than
   * the second of three corners. Absent for an end that holds a shape.
   */
  t?: number;
}

export interface ConnectorSpec {
  start: ConnectorEnd;
  end: ConnectorEnd;
  kind: ConnectorKind;
  /** How far the route bows, in twips. Signed. */
  bend?: number;
}

const SIDES: ConnectorSide[] = ['n', 'e', 's', 'w'];

/** 28px and 190px, the two ends of a curve handle that neither kinks nor balloons. */
const HANDLE_MIN = 420;
const HANDLE_MAX = 2850;

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

/** Degrees, clockwise, about a centre — the same convention the shapes are drawn with. */
export function rotateAround(point: Point, centre: Point, degrees: number): Point {
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

export function centreOf(box: ConnectorBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Where a magnet is, rotation included.
 *
 * `auto` and `c` are both the centre: `auto` means "nobody has chosen", and until
 * somebody does, the pair of sides is worked out by `nearestSides` — asking for the
 * centre is the honest answer for a single end on its own.
 */
export function sidePoint(box: ConnectorBox, side: ConnectorSide): Point {
  const centre = centreOf(box);
  const half = { x: box.width / 2, y: box.height / 2 };
  const raw =
    side === 'n'
      ? { x: centre.x, y: centre.y - half.y }
      : side === 's'
        ? { x: centre.x, y: centre.y + half.y }
        : side === 'w'
          ? { x: centre.x - half.x, y: centre.y }
          : side === 'e'
            ? { x: centre.x + half.x, y: centre.y }
            : centre;
  return rotateAround(raw, centre, box.rotation ?? 0);
}

/**
 * The direction a side faces, as a unit vector — rotated with the shape.
 *
 * What a curve's handles are pulled along and what tells an elbow which axis to leave
 * on. The centre faces nowhere, and a caller decides what that means.
 */
export function normalOf(side: ConnectorSide, rotation = 0): Point {
  const raw =
    side === 'n'
      ? { x: 0, y: -1 }
      : side === 's'
        ? { x: 0, y: 1 }
        : side === 'w'
          ? { x: -1, y: 0 }
          : side === 'e'
            ? { x: 1, y: 0 }
            : { x: 0, y: 0 };
  if (!rotation || (raw.x === 0 && raw.y === 0)) return raw;
  return rotateAround(raw, { x: 0, y: 0 }, rotation);
}

/**
 * The pair of sides whose magnets are closest together.
 *
 * Which is what `auto` means, and it is worth the sixteen comparisons: the alternative
 * — picking by the angle between the two centres — puts a line on the east side of a
 * box whose neighbour is barely to the right and mostly below, and the line then runs
 * back across the shape it came from.
 */
export function nearestSides(a: ConnectorBox, b: ConnectorBox): [ConnectorSide, ConnectorSide] {
  let best: [ConnectorSide, ConnectorSide] = ['e', 'w'];
  let shortest = Infinity;
  for (const sa of SIDES) {
    for (const sb of SIDES) {
      const pa = sidePoint(a, sa);
      const pb = sidePoint(b, sb);
      const distance = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (distance < shortest) {
        shortest = distance;
        best = [sa, sb];
      }
    }
  }
  return best;
}

/** The side a free end faces, given where the other end is. */
export function sideTowards(from: Point, to: Point): ConnectorSide {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'e' : 'w';
  return dy >= 0 ? 's' : 'n';
}

/** A shape's outline as a polygon, or nothing for a rectangle. */
function outlinePoints(box: ConnectorBox): Point[] | null {
  const centre = centreOf(box);
  const turn = (points: Point[]) =>
    points.map((point) => rotateAround(point, centre, box.rotation ?? 0));

  if (box.outline === 'diamond') {
    return turn([
      { x: centre.x, y: box.y },
      { x: box.x + box.width, y: centre.y },
      { x: centre.x, y: box.y + box.height },
      { x: box.x, y: centre.y }
    ]);
  }
  if (box.outline === 'triangle') {
    return turn([
      { x: centre.x, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height }
    ]);
  }
  return null;
}

/** Where two segments cross, or nothing. */
function crossing(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + (a2.x - a1.x) * t, y: a1.y + (a2.y - a1.y) * t };
}

/**
 * Where a line from the shape's centre towards a point leaves the shape.
 *
 * Outline-aware, and that is the point of it: an ellipse is solved on the ellipse, a
 * diamond and a triangle on their edges, and everything else on the rectangle. Clip a
 * circle as a rectangle and the line stops at a corner that is outside the circle, so
 * it visibly floats — the commonest thing wrong with hand-drawn connector code.
 */
export function borderPoint(box: ConnectorBox, towards: Point): Point {
  const centre = centreOf(box);
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;
  if (dx === 0 && dy === 0) return centre;

  const rotation = box.rotation ?? 0;
  // Solved in the shape's own frame, where its sides are axis-aligned, then turned
  // back. A rotated ellipse has no closed form in screen coordinates.
  const local = rotateAround(towards, centre, -rotation);
  const lx = local.x - centre.x;
  const ly = local.y - centre.y;
  const half = { x: box.width / 2, y: box.height / 2 };

  if (box.outline === 'ellipse') {
    const scale = Math.hypot(lx / (half.x || 1), ly / (half.y || 1));
    if (scale < 1e-9) return centre;
    return rotateAround(
      { x: centre.x + lx / scale, y: centre.y + ly / scale },
      centre,
      rotation
    );
  }

  const polygon = outlinePoints(box);
  if (polygon) {
    // Far enough to leave any of these outlines, then the first edge it crosses.
    const reach = Math.hypot(box.width, box.height) * 2;
    const length = Math.hypot(dx, dy) || 1;
    const far = { x: centre.x + (dx / length) * reach, y: centre.y + (dy / length) * reach };
    for (let at = 0; at < polygon.length; at += 1) {
      const hit = crossing(centre, far, polygon[at], polygon[(at + 1) % polygon.length]);
      if (hit) return hit;
    }
    return centre;
  }

  const scale = Math.max(Math.abs(lx) / (half.x || 1), Math.abs(ly) / (half.y || 1));
  if (scale < 1e-9) return centre;
  return rotateAround({ x: centre.x + lx / scale, y: centre.y + ly / scale }, centre, rotation);
}

/** Both ends resolved: where they are, and which way each faces. */
export interface ResolvedEnds {
  start: Point;
  end: Point;
  startSide: ConnectorSide;
  endSide: ConnectorSide;
  startNormal: Point;
  endNormal: Point;
}

/**
 * Where the line actually starts and ends.
 *
 * The rule that matters is the straight one: unless a reader has chosen a magnet, a
 * straight connector joins the two **centres** and is clipped at each outline. Drawn
 * to a side's midpoint instead, it cuts through its own shape the moment the two boxes
 * are offset — which is why the centre magnet is the only one a straight line uses
 * (§8.3), and Figma draws the same distinction.
 */
export function resolveEnds(
  spec: ConnectorSpec,
  boxes: { start?: ConnectorBox; end?: ConnectorBox },
  /**
   * An end already placed by the caller, which is how an end attached to **another
   * line** arrives here.
   *
   * The point rather than the line: resolving the held line means routing it, routing
   * it means knowing what *it* holds, and a document walk in here would make this file
   * depend on a document. The caller owns the walk (and the cycle it has to refuse) and
   * hands over the answer — see `connectorRouteOf` in `office-slides`.
   */
  pinned: { start?: Point; end?: Point } = {}
): ResolvedEnds {
  const free = (end: ConnectorEnd): Point =>
    pinned.start && end === spec.start
      ? pinned.start
      : pinned.end && end === spec.end
        ? pinned.end
        : { x: finite(end.x), y: finite(end.y) };
  // An end held by a line has no box: its place is the point the caller resolved, and
  // clipping it to an outline would pull it off the line it is attached to.
  const a = pinned.start ? undefined : boxes.start;
  const b = pinned.end ? undefined : boxes.end;

  // Straight, and nobody has chosen: centre to centre, clipped where it leaves.
  const chosen = spec.start.side !== 'auto' || spec.end.side !== 'auto';
  if (spec.kind === 'straight' && !chosen) {
    const from = a ? centreOf(a) : free(spec.start);
    const to = b ? centreOf(b) : free(spec.end);
    const start = a ? borderPoint(a, to) : from;
    const end = b ? borderPoint(b, from) : to;
    return {
      start,
      end,
      startSide: 'c',
      endSide: 'c',
      startNormal: normalOf(sideTowards(start, end)),
      endNormal: normalOf(sideTowards(end, start))
    };
  }

  let startSide = spec.start.side;
  let endSide = spec.end.side;
  if (a && b && startSide === 'auto' && endSide === 'auto') {
    [startSide, endSide] = nearestSides(a, b);
  }

  const start = a ? sidePoint(a, startSide) : free(spec.start);
  const end = b ? sidePoint(b, endSide) : free(spec.end);


  // A side nobody chose, on an end with no shape: it faces the other end.
  if (startSide === 'auto') startSide = sideTowards(start, end);
  if (endSide === 'auto') endSide = sideTowards(end, start);

  return {
    start,
    end,
    startSide,
    endSide,
    startNormal: normalOf(startSide, a?.rotation ?? 0),
    endNormal: normalOf(endSide, b?.rotation ?? 0)
  };
}

/**
 * The corners of an elbow.
 *
 * Two sides on the same axis bend **twice**, at the midpoint, and `bend` slides that
 * midpoint — which is how two connectors between the same pair of shapes are told
 * apart. Two sides on different axes bend **once**, at the only corner there is, and
 * `bend` has nothing to slide: it is ignored rather than applied somewhere it would
 * pull the line off its own magnet.
 */
export function elbowPoints(ends: ResolvedEnds, bend = 0): Point[] {
  const { start, end } = ends;
  const acrossA = ends.startSide === 'e' || ends.startSide === 'w';
  const acrossB = ends.endSide === 'e' || ends.endSide === 'w';

  if (acrossA && acrossB) {
    const middle = (start.x + end.x) / 2 + bend;
    return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end];
  }
  if (!acrossA && !acrossB) {
    const middle = (start.y + end.y) / 2 + bend;
    return [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end];
  }
  return acrossA
    ? [start, { x: end.x, y: start.y }, end]
    : [start, { x: start.x, y: end.y }, end];
}

/**
 * A cubic's four points: the two ends and a handle pulled along each normal.
 *
 * The handle's length is the distance **projected onto that normal**, not the
 * straight-line distance between the ends. Two boxes one above the other are far apart
 * along the normal and close across it; using the straight distance there balloons the
 * curve out over whatever is beside them. A little of the across-distance is mixed in
 * so a line that leaves sideways still leaves smoothly.
 */
export function curvePoints(ends: ResolvedEnds, bend = 0): Point[] {
  const { start, end } = ends;
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const handle = (normal: Point): number => {
    if (normal.x === 0 && normal.y === 0) return Math.max(HANDLE_MIN, Math.hypot(dx, dy) * 0.4);
    const along = Math.abs(normal.x * dx + normal.y * dy);
    const across = Math.abs(-normal.y * dx + normal.x * dy);
    return Math.max(HANDLE_MIN, Math.min(HANDLE_MAX, along * 0.55 + across * 0.12));
  };

  // The bow is across the line between the ends, so a bend separates two curves
  // between the same pair rather than lengthening one of them.
  const length = Math.hypot(dx, dy) || 1;
  const bowX = (-dy / length) * bend;
  const bowY = (dx / length) * bend;
  const first = handle(ends.startNormal);
  const second = handle(ends.endNormal);

  return [
    start,
    {
      x: start.x + ends.startNormal.x * first + bowX,
      y: start.y + ends.startNormal.y * first + bowY
    },
    { x: end.x + ends.endNormal.x * second + bowX, y: end.y + ends.endNormal.y * second + bowY },
    end
  ];
}

/**
 * The bow of an arc: how far it swings out, in twips, for a given span.
 *
 * Grows with distance — a short arc is nearly straight and a long one has room to bend —
 * which is what makes a page of them look drawn rather than generated. The numbers are
 * this coordinate system's: a slide is 14400 twips across.
 */
const BOW_MIN = 330;
const BOW_MAX = 1650;
const STRETCH_MAX = 6300;
/** The gap between a shape's edge and the arc's end: a cap touching the edge looks blunt. */
const ARC_PAD = 75;
/** Within this many degrees of an axis, an arc is drawn straight. */
const STRAIGHT_DEG = 4;

/**
 * A single-control-point arc between two shapes — the fourth route.
 *
 * ## What makes it different from `curve`
 *
 * A curve leaves along a **side's normal**: it is a route between two magnets. An arc
 * has no magnets at all. The control point is placed first — out to one side of the line
 * between the two *centres* — and each end is then found by clipping the shape's outline
 * **towards that control point**. So the line always points *at* the shape, whatever
 * angle the shape is turned to, and the cap sits along the tangent there. On a rotated
 * shape the difference is obvious.
 *
 * ## Straight when the shapes are lined up
 *
 * Within four degrees of an axis and with no bow asked for, it is drawn straight: a
 * diagram laid out on a grid with faintly bent lines looks untidy rather than organic.
 *
 * ## The gap at each end
 *
 * The end is stepped back out of the shape by `ARC_PAD`, because a cap whose tip is
 * exactly on the edge reads as blunt — drawn *into* the border rather than at it.
 */
export function arcPoints(
  boxes: { start?: ConnectorBox; end?: ConnectorBox },
  ends: { start: Point; end: Point },
  bend = 0,
  bow?: number
): Point[] {
  const from = boxes.start ? centreOf(boxes.start) : ends.start;
  const to = boxes.end ? centreOf(boxes.end) : ends.end;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy) || 1;

  const degrees = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 90;
  const lined = bend === 0 && (degrees < STRAIGHT_DEG || 90 - degrees < STRAIGHT_DEG);
  const stretch = Math.min(1, span / STRETCH_MAX);
  const swing = bow ?? (lined ? 0 : BOW_MIN + (BOW_MAX - BOW_MIN) * stretch + bend);

  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const control = { x: middle.x + (-dy / span) * swing, y: middle.y + (dx / span) * swing };

  const back = (point: Point, towards: Point, by: number): Point => {
    const ox = towards.x - point.x;
    const oy = towards.y - point.y;
    const length = Math.hypot(ox, oy) || 1;
    return { x: point.x + (ox / length) * by, y: point.y + (oy / length) * by };
  };

  const start = boxes.start ? back(borderPoint(boxes.start, control), control, ARC_PAD) : ends.start;
  const finish = boxes.end ? back(borderPoint(boxes.end, control), control, ARC_PAD) : ends.end;
  return swing === 0 ? [start, finish] : [start, control, finish];
}

/**
 * An arc **bowed further** to get past something, which is all an arc can do.
 *
 * Its own maker, because an arc's bow is not its `bend`: the bow is computed from the
 * span and the bend is added to it, so avoiding has to set the bow directly. The least
 * bowed clean answer wins, as with a curve.
 */
export function avoidArc(
  boxes: { start?: ConnectorBox; end?: ConnectorBox },
  ends: { start: Point; end: Point },
  bend: number,
  obstacles: ConnectorBox[]
): Point[] {
  const base = arcPoints(boxes, ends, bend);
  if (obstacles.length === 0 || crossCount(flattenCurve(base), obstacles) === 0) return base;

  const span = Math.hypot(ends.end.x - ends.start.x, ends.end.y - ends.start.y);
  const step = Math.max(450, span * 0.25);
  const tries: number[] = [];
  for (let round = 1; round <= 5; round += 1) tries.push(step * round, -step * round);

  const found = tries
    .map((bow) => ({ bow, points: arcPoints(boxes, ends, bend, bow) }))
    .filter((item) => crossCount(flattenCurve(item.points), obstacles) === 0);
  if (found.length === 0) return base;
  return found.reduce((best, item) => (Math.abs(item.bow) < Math.abs(best.bow) ? item : best)).points;
}

/**
 * Every point of the route, in the container's coordinates.
 *
 * `obstacles` are the other shapes on the slide, and each route avoids them in the way
 * that keeps it the route it is: an elbow goes **around**, a straight line moves to
 * another **magnet**, and a curve **bows further**. Bending a curve into right angles
 * to get past a box would throw away the reason a reader chose a curve.
 *
 * The two shapes the line joins are not obstacles — it is there to reach them — and a
 * caller that includes them gets a line that refuses to touch its own ends.
 */
export function connectorPoints(
  spec: ConnectorSpec,
  boxes: { start?: ConnectorBox; end?: ConnectorBox },
  obstacles: ConnectorBox[] = [],
  pinned: { start?: Point; end?: Point } = {},
  /**
   * The points a reader has told the line to go through.
   *
   * With any of these, **nothing routes around anything**: they have said where the line
   * goes, and a router moving it would be a control that does not work — the same rule as
   * a magnet a reader chose.
   */
  waypoints: Point[] = []
): Point[] {
  const ends = resolveEnds(spec, boxes, pinned);

  if (waypoints.length > 0) return throughWaypoints(ends, waypoints, spec.kind);
  if (spec.kind === 'elbow') {
    return avoidObstacles(elbowPoints(ends, spec.bend ?? 0), ends, spec.bend ?? 0, obstacles);
  }
  if (spec.kind === 'curve') return avoidCurve(ends, spec.bend ?? 0, obstacles);
  if (spec.kind === 'arc') {
    // Its own ends: an arc leaves towards its control point rather than from a magnet,
    // so the points `resolveEnds` worked out are only where it starts looking.
    return avoidArc(boxes, ends, spec.bend ?? 0, obstacles);
  }
  return avoidStraight(spec, ends, boxes, obstacles);
}

/** How much of a corner is rounded off: 10px. */
export const CORNER = 150;

/** How wide a hop over another line is: 8px, which is a hop a reader sees and a line a reader still reads. */
export const JUMP = 120;

/**
 * How near an end a crossing may be before it stops counting: ⅓ inch.
 *
 * Two lines arriving at the same shape meet *at the shape*, and a hop drawn there reads as
 * a mistake rather than as a crossing — it is not one, they are both simply arriving. So a
 * crossing within this of either line's own ends is left alone.
 */
const CROSS_CLEAR = 480;

/**
 * Where one line's route crosses another's, as points.
 *
 * ## Why a diagram needs this at all
 *
 * Two lines drawn across each other are ambiguous: a reader cannot tell whether the paths
 * *meet* — one flow branching into another — or merely pass. Every drawing convention for
 * schematics answers it the same way, with a small hop, and it is the same argument as the
 * fan (§8.8): what is prevented is not a look but a picture nobody can read correctly.
 *
 * ## Straight runs only
 *
 * A crossing on a curve would have to be a hop cut into a Bézier, which cannot be
 * expressed as one arc and would need the curve split — and the routes readers cross most
 * are elbows and straight lines. So a curve's crossings are not reported: better a plain
 * crossing than a wrong one.
 *
 * Collinear overlap is not a crossing either. Two lines running along each other do not
 * pass at a point, and hopping somewhere along the shared stretch would put a bump in the
 * middle of nothing.
 */
export function segmentCrossings(a: Point[], b: Point[], clear = CROSS_CLEAR): Point[] {
  if (a.length < 2 || b.length < 2) return [];

  const found: Point[] = [];
  const endsOf = (points: Point[]) => [points[0], points[points.length - 1]];
  const nearAnEnd = (point: Point) =>
    [...endsOf(a), ...endsOf(b)].some(
      (end) => Math.hypot(point.x - end.x, point.y - end.y) < clear
    );

  for (let one = 0; one < a.length - 1; one += 1) {
    const p = a[one];
    const r = { x: a[one + 1].x - p.x, y: a[one + 1].y - p.y };
    for (let two = 0; two < b.length - 1; two += 1) {
      const q = b[two];
      const s = { x: b[two + 1].x - q.x, y: b[two + 1].y - q.y };

      const denominator = r.x * s.y - r.y * s.x;
      // Parallel, which includes running along each other: no single point to hop at.
      if (denominator === 0) continue;

      const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / denominator;
      const u = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / denominator;
      // Strictly inside both runs. A touch at an end is one line *arriving*, not crossing.
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;

      const at = { x: p.x + r.x * t, y: p.y + r.y * t };
      if (nearAnEnd(at)) continue;
      if (found.some((was) => Math.hypot(was.x - at.x, was.y - at.y) < JUMP * 2)) continue;
      found.push({ x: Math.round(at.x), y: Math.round(at.y) });
    }
  }
  return found;
}

/**
 * The route as SVG path data, with **rounded corners**.
 *
 * ## Why an elbow is not drawn with square corners
 *
 * Two reasons, and neither is taste. A hard right angle sits badly against shapes that
 * have rounded corners themselves — which is every default in this product — and where
 * two lines cross, square corners make it genuinely hard to see which line goes which
 * way. Every diagram tool rounds them.
 *
 * ## The radius shrinks to fit
 *
 * Clamped to **half of each adjoining segment**, so two corners close together cannot
 * eat into each other: without that, a short middle leg becomes two arcs meeting in a
 * kink that reads as a mistake. `corner: 0` draws the square angles, which is what a
 * caller wants for a route it is measuring rather than drawing.
 *
 * A curve is one cubic and needs none of this — its four points *are* the cubic.
 */
export function connectorPath(
  points: Point[],
  kind: ConnectorKind,
  corner = CORNER,
  /**
   * Where this line **hops over** another, from `segmentCrossings`.
   *
   * Points rather than a flag, because which line hops is not a fact about either line
   * on its own: it is decided once, for the pair, by whoever can see both — the layout
   * pass. See `connector-pass.ts`.
   */
  jumps: Point[] = [],
  jump = JUMP
): string {
  if (points.length < 2) return '';
  const at = (point: Point) => `${Math.round(point.x)} ${Math.round(point.y)}`;

  if ((kind === 'curve' || kind === 'arc') && points.length === 4) {
    return `M ${at(points[0])} C ${at(points[1])} ${at(points[2])} ${at(points[3])}`;
  }
  /**
   * Several cubics: a curve through a reader's waypoints.
   *
   * One `C` per span, sharing each end point — which is what makes it one path a stroke
   * runs along rather than several lines that happen to touch.
   */
  if ((kind === 'curve' || kind === 'arc') && points.length > 4 && (points.length - 1) % 3 === 0) {
    let d = `M ${at(points[0])}`;
    for (let span = 1; span + 2 < points.length; span += 3) {
      d += ` C ${at(points[span])} ${at(points[span + 1])} ${at(points[span + 2])}`;
    }
    return d;
  }
  // A quadratic, which is what an arc is: one control point between the two ends.
  if ((kind === 'curve' || kind === 'arc') && points.length === 3) {
    return `M ${at(points[0])} Q ${at(points[1])} ${at(points[2])}`;
  }

  /**
   * One straight run, with a little arc at each line it passes over.
   *
   * The hop is a **semicircle** of the same radius every time: a hop that grew with the
   * run would be a different size at each crossing of the same line, and the convention
   * this borrows from — schematics, and every diagram tool that draws it — is one shape
   * repeated. `sweep` is fixed for the same reason: hops that bulged either way at random
   * read as a drawing mistake rather than as a convention.
   *
   * A crossing too near either end of the run is skipped, because the arc would run into
   * the rounded corner there and the two would meet in a kink.
   */
  const run = (from: Point, to: Point): string => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (jumps.length === 0 || length <= jump * 3) return ` L ${at(to)}`;

    const along = { x: dx / length, y: dy / length };
    const over = jumps
      .map((point) => ({
        point,
        // How far along the run it is, and how far off it: a crossing belongs to the run
        // it actually lies on.
        t: (point.x - from.x) * along.x + (point.y - from.y) * along.y,
        off: Math.abs((point.x - from.x) * -along.y + (point.y - from.y) * along.x)
      }))
      .filter((one) => one.off <= jump / 2)
      .filter((one) => one.t > corner + jump && one.t < length - corner - jump)
      .sort((one, other) => one.t - other.t);

    let out = '';
    for (const one of over) {
      const before = { x: from.x + along.x * (one.t - jump), y: from.y + along.y * (one.t - jump) };
      const after = { x: from.x + along.x * (one.t + jump), y: from.y + along.y * (one.t + jump) };
      out += ` L ${at(before)} A ${jump} ${jump} 0 0 0 ${at(after)}`;
    }
    return `${out} L ${at(to)}`;
  };

  if (points.length === 2 || corner <= 0) {
    let plain = `M ${at(points[0])}`;
    for (let index = 1; index < points.length; index += 1) {
      plain += run(points[index - 1], points[index]);
    }
    return plain;
  }

  let d = `M ${at(points[0])}`;
  // Where the path currently is: the runs are between the corners' arcs, so each one
  // starts where the last arc left off rather than at a point of the route.
  let cursor = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index - 1];
    const here = points[index];
    const after = points[index + 1];
    const inLength = Math.hypot(here.x - before.x, here.y - before.y) || 1;
    const outLength = Math.hypot(after.x - here.x, after.y - here.y) || 1;
    const radius = Math.min(corner, inLength / 2, outLength / 2);
    const from = {
      x: here.x - ((here.x - before.x) / inLength) * radius,
      y: here.y - ((here.y - before.y) / inLength) * radius
    };
    const to = {
      x: here.x + ((after.x - here.x) / outLength) * radius,
      y: here.y + ((after.y - here.y) / outLength) * radius
    };
    // Into the corner, round it with the corner itself as the control point, out again.
    d += `${run(cursor, from)} Q ${at(here)} ${at(to)}`;
    cursor = to;
  }
  return `${d}${run(cursor, points[points.length - 1])}`;
}

/**
 * The box the drawing needs, with room for the line and its ends.
 *
 * `pad` is that room: half a stroke would clip the line itself, and an arrowhead
 * reaches further than the path does. A flat box for a horizontal line is the other
 * half — an SVG of zero height draws nothing at all, whatever is in it.
 */
export function connectorBounds(
  points: Point[],
  pad = 0
): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(1, Math.round(Math.max(...xs) + pad - left)),
    height: Math.max(1, Math.round(Math.max(...ys) + pad - top))
  };
}

/**
 * The attachments a connector still has, given which shapes exist.
 *
 * An end whose shape is gone keeps its **place** and loses its hold: the line stays
 * where it last was rather than vanishing with the shape. A diagram that quietly
 * dropped a line would be one a reader cannot see the hole in — §8.2.
 */
export function withoutMissing(
  spec: ConnectorSpec,
  exists: (nodeId: string) => boolean
): ConnectorSpec {
  const held = (end: ConnectorEnd): ConnectorEnd =>
    end.nodeId && !exists(end.nodeId) ? { ...end, nodeId: undefined } : end;
  return { ...spec, start: held(spec.start), end: held(spec.end) };
}

/**
 * The ends' places, written back so they are there when a shape goes.
 *
 * Rounded, because these are twips in a document and a document full of
 * `1234.5678000001` is a diff nobody can read.
 */
export function withEndPlaces(spec: ConnectorSpec, ends: ResolvedEnds): ConnectorSpec {
  return {
    ...spec,
    start: { ...spec.start, x: Math.round(ends.start.x), y: Math.round(ends.start.y) },
    end: { ...spec.end, x: Math.round(ends.end.x), y: Math.round(ends.end.y) }
  };
}

/** What a cap draws as: a shape and whether it is filled. */
export type ConnectorCap =
  | 'none'
  | 'arrow'
  | 'open'
  | 'triangle'
  | 'hollow'
  | 'circle'
  | 'diamond'
  | 'bar'
  | 'cross';

export type CapDrawing =
  | { shape: 'path'; d: string; filled: boolean }
  | { shape: 'circle'; cx: number; cy: number; r: number; filled: boolean }
  | null;

/**
 * The shape at one end of a line, pointing the way the line arrives.
 *
 * ## Why there are eight
 *
 * Because a diagram's end shape **means** something, and the meanings are not this
 * product's to invent: a flow is an arrow, an association a dot, and UML's inheritance
 * and composition are a hollow triangle and a diamond. Ship one and readers stack
 * shapes on the line's end to fake the rest — and the fake drifts out of place every
 * time the line moves, which is the whole thing a connector exists to prevent.
 *
 * ## Filled and unfilled are not a style
 *
 * `hollow` and `open` are unfilled **on purpose** — that is what distinguishes
 * inheritance from composition, and an aggregation from a flow. A hollow cap the
 * renderer fills is a different symbol, not a prettier one; and the line must be drawn
 * *to* the cap's base rather than through it, or it shows through the middle.
 *
 * `angle` is where the line arrives from, in radians — `Math.atan2` of the last
 * segment. `size` is the cap's length in twips.
 */
export function capDrawing(
  cap: ConnectorCap,
  tip: Point,
  angle: number,
  size: number
): CapDrawing {
  if (cap === 'none' || size <= 0) return null;

  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const across = { x: -along.y, y: along.x };
  const at = (back: number, side: number): string =>
    `${Math.round(tip.x - along.x * back + across.x * side)} ${Math.round(
      tip.y - along.y * back + across.y * side
    )}`;

  const half = size / 2;

  switch (cap) {
    case 'arrow':
      // A filled head with a notch, which reads as an arrow at small sizes where a
      // plain triangle reads as a blob.
      return {
        shape: 'path',
        d: `M ${at(0, 0)} L ${at(size, half)} L ${at(size * 0.72, 0)} L ${at(size, -half)} Z`,
        filled: true
      };
    case 'open':
      // Two strokes, the classic "line arrow". Not closed, so it is a stroke rather
      // than a fill — the caller strokes what this returns.
      return {
        shape: 'path',
        d: `M ${at(size, half)} L ${at(0, 0)} L ${at(size, -half)}`,
        filled: false
      };
    case 'triangle':
      return {
        shape: 'path',
        d: `M ${at(0, 0)} L ${at(size, half)} L ${at(size, -half)} Z`,
        filled: true
      };
    case 'hollow':
      // Inheritance. Unfilled, and the difference from `triangle` is the meaning.
      return {
        shape: 'path',
        d: `M ${at(0, 0)} L ${at(size, half)} L ${at(size, -half)} Z`,
        filled: false
      };
    case 'diamond':
      // Composition when filled; an aggregation is the same shape unfilled, which is
      // a fill a reader chooses rather than a ninth cap.
      return {
        shape: 'path',
        d: `M ${at(0, 0)} L ${at(half, half)} L ${at(size, 0)} L ${at(half, -half)} Z`,
        filled: true
      };
    case 'bar':
      // A stop: the line ends *at* something rather than pointing at it.
      return { shape: 'path', d: `M ${at(0, half)} L ${at(0, -half)}`, filled: false };
    case 'cross':
      /**
       * A crossing-out: "blocked", "not this way", "no".
       *
       * A vocabulary item like the rest, and the one nobody draws with a shape stacked
       * on the end — they draw it by *deleting* the arrow, which loses the fact that
       * the relationship exists and is refused. Two strokes through the end, set back
       * by half its size so the X is centred on the line rather than hanging off it.
       */
      return {
        shape: 'path',
        d:
          `M ${at(half - half, half)} L ${at(half + half, -half)} ` +
          `M ${at(half - half, -half)} L ${at(half + half, half)}`,
        filled: false
      };
    case 'circle':
      return {
        shape: 'circle',
        cx: Math.round(tip.x - along.x * (size / 2)),
        cy: Math.round(tip.y - along.y * (size / 2)),
        r: Math.round(size / 2),
        filled: true
      };
    default:
      return null;
  }
}

/**
 * Which way the line arrives at an end, in radians.
 *
 * The **last segment** rather than the two ends: an elbow arrives along its final leg
 * and a cap turned to face the far end would sit across the line. A curve's last
 * segment is its second handle to its end point, which is the tangent there.
 */
export function capAngle(points: Point[], at: 'start' | 'end'): number {
  if (points.length < 2) return 0;
  const [tip, from] =
    at === 'start' ? [points[0], points[1]] : [points[points.length - 1], points[points.length - 2]];
  return Math.atan2(tip.y - from.y, tip.x - from.x);
}

/**
 * How far to stop short of the tip, so a filled cap is not drawn over by the line.
 *
 * A stroke drawn to the tip shows through an unfilled cap and thickens a filled one.
 * Nothing to trim for a cap that is a bar or absent — those sit *on* the end.
 */
/**
 * The smallest an arrowhead may be drawn: an eighth of an inch.
 *
 * A cap scaled from the stroke alone disappears on a hairline, and an arrowhead nobody
 * can see is a line whose direction nobody can read.
 */
export const CAP_MIN = 180;

/**
 * How big a line's cap is, from the line's own weight.
 *
 * Here rather than in the renderer that draws it, because the *layout* needs the same
 * number: the gap between two ranks of a tidied diagram has to hold the arrowhead, and a
 * second copy of `max(180, width * 4)` is exactly the restatement this repository keeps
 * finding — right until one of the two is changed.
 */
export function capSizeOf(strokeWidth: number): number {
  return Math.max(CAP_MIN, (Number.isFinite(strokeWidth) ? strokeWidth : 0) * 4);
}

export function capInset(cap: ConnectorCap, size: number): number {
  if (cap === 'none' || cap === 'bar' || cap === 'cross') return 0;
  if (cap === 'open') return 0; // two strokes meeting the line: no gap wanted
  return Math.round(size * (cap === 'circle' ? 1 : 0.72));
}

/** A point moved back from the tip along the line, for `capInset`. */
export function pulledBack(points: Point[], at: 'start' | 'end', by: number): Point[] {
  if (by <= 0 || points.length < 2) return points;
  const moved = [...points];
  const index = at === 'start' ? 0 : moved.length - 1;
  const other = at === 'start' ? 1 : moved.length - 2;
  const dx = moved[other].x - moved[index].x;
  const dy = moved[other].y - moved[index].y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9 || by >= length) return points;
  moved[index] = {
    x: moved[index].x + (dx / length) * by,
    y: moved[index].y + (dy / length) * by
  };
  return moved;
}

/** As much of a node as this reads. */
interface NodeLike {
  stype?: string;
  attributes?: Record<string, unknown>;
}

const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const SIDE_VALUES: ConnectorSide[] = ['auto', 'n', 'e', 's', 'w', 'c'];
const KIND_VALUES: ConnectorKind[] = ['straight', 'elbow', 'curve', 'arc'];
const CAP_VALUES: ConnectorCap[] = [
  'none',
  'arrow',
  'open',
  'triangle',
  'hollow',
  'circle',
  'diamond',
  'bar',
  'cross'
];

const oneOf = <T extends string>(value: unknown, allowed: T[], fallback: T): T =>
  typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback;

/**
 * The connector a node describes.
 *
 * Read the way every other attribute in this model is read — a value the schema does
 * not declare falls back to the default rather than reaching the arithmetic, because a
 * document is a file anybody can write and a `kind` of `"wibble"` should draw a line
 * rather than nothing at all.
 */
export function connectorSpecOf(node: NodeLike | undefined | null): ConnectorSpec {
  const attrs = node?.attributes ?? {};
  const end = (prefix: 'start' | 'end'): ConnectorEnd => {
    const along = attrs[`${prefix}T`];
    return {
      nodeId:
        typeof attrs[`${prefix}NodeId`] === 'string' ? (attrs[`${prefix}NodeId`] as string) : undefined,
      x: number(attrs[`${prefix}X`]),
      y: number(attrs[`${prefix}Y`]),
      side: oneOf(attrs[`${prefix}Side`], SIDE_VALUES, 'auto'),
      // Only when it is one: a `t` on an end that holds a shape would say the shape is
      // a line, and every reader of this would have to decide which to believe.
      ...(typeof along === 'number' && Number.isFinite(along)
        ? { t: Math.min(1, Math.max(0, along)) }
        : {})
    };
  };
  return {
    start: end('start'),
    end: end('end'),
    kind: oneOf(attrs.kind, KIND_VALUES, 'elbow'),
    bend: number(attrs.bend)
  };
}

/** The caps a connector draws, read the same way. */
export function connectorCapsOf(node: NodeLike | undefined | null): {
  start: ConnectorCap;
  end: ConnectorCap;
} {
  const attrs = node?.attributes ?? {};
  return {
    start: oneOf(attrs.startCap, CAP_VALUES, 'none'),
    end: oneOf(attrs.endCap, CAP_VALUES, 'arrow')
  };
}

/**
 * The box a joined shape presents to a connector.
 *
 * The **outline** is the shape's own: an ellipse is clipped on the ellipse, and
 * everything the canvas has is otherwise a rectangle. `diamond` and `triangle` are in
 * `borderPoint` for the shape presets this canvas does not have yet, and a caller with
 * one says so here.
 */
export function connectorBoxOf(node: NodeLike | undefined | null): ConnectorBox | undefined {
  const attrs = node?.attributes;
  if (!attrs) return undefined;
  const width = number(attrs.width);
  const height = number(attrs.height);
  if (width === 0 && height === 0) return undefined;

  const x = number(attrs.x);
  const y = number(attrs.y);
  return {
    // Normalised, because a negative width is how a line says it runs right to left.
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
    rotation: number(attrs.rotation),
    outline: node?.stype === 'ellipse' ? 'ellipse' : text(attrs.outline, 'rect')
  };
}

/**
 * The attribute changes that bring a connector's stored ends up to date.
 *
 * Empty when it already agrees, which is what lets a reaction run on every document
 * change without feeding itself — the same property `layoutChildren` relies on, and
 * the reason neither needs a "this change was mine" flag.
 *
 * Two things are written: the **place** of each end, so a line whose shape is deleted
 * stays where it was (§8.2), and the release of an attachment whose shape is gone.
 */
export function connectorChanges(
  node: NodeLike | undefined | null,
  /**
   * The boxes it joins, **already in this connector's coordinate space**, and the points
   * for any end held by another line.
   *
   * Resolved by the caller rather than here, because both are questions about the
   * document: which container a shape sits in, and where another line goes. This took a
   * bug to settle — the drawing resolved coordinate spaces and this did not, so a line
   * drawn correctly to a shape inside a group *stored* an end at the corner of the
   * slide. And the stored end is exactly what a deleted shape leaves behind, so the
   * error only showed up later, in the one case it was there for.
   */
  resolved: {
    boxes: { start?: ConnectorBox; end?: ConnectorBox };
    pinned?: { start?: Point; end?: Point };
  },
  holds: (nodeId: string) => boolean
): Record<string, unknown> {
  const spec = connectorSpecOf(node);
  const held = withoutMissing(spec, holds);
  const ends = resolveEnds(held, resolved.boxes, resolved.pinned ?? {});

  const changes: Record<string, unknown> = {};
  if (Math.round(ends.start.x) !== spec.start.x) changes.startX = Math.round(ends.start.x);
  if (Math.round(ends.start.y) !== spec.start.y) changes.startY = Math.round(ends.start.y);
  if (Math.round(ends.end.x) !== spec.end.x) changes.endX = Math.round(ends.end.x);
  if (Math.round(ends.end.y) !== spec.end.y) changes.endY = Math.round(ends.end.y);
  /**
   * `null`, which **removes** the attribute — see `setAttrs`.
   *
   * Not `''`. A blank is not a value: every reader of `startNodeId` would have to know
   * that an empty string is this product's word for "holds nothing", and the schema
   * already has a word for it — the attribute is not there. Written as `''` first, and
   * it is the same fault as the one that made a number impossible to clear.
   */
  if (held.start.nodeId === undefined && spec.start.nodeId !== undefined) changes.startNodeId = null;
  if (held.end.nodeId === undefined && spec.end.nodeId !== undefined) changes.endNodeId = null;
  return changes;
}

/** How near a pointer has to be to a magnet to take it: 8px. */
export const MAGNET_SNAP = 120;

/** Every magnet a shape offers, with the side each one is. */
export function magnetPoints(box: ConnectorBox): Array<{ side: ConnectorSide; point: Point }> {
  return (['n', 'e', 's', 'w', 'c'] as ConnectorSide[]).map((side) => ({
    side,
    point: sidePoint(box, side)
  }));
}

/**
 * The magnet a pointer is on, or nothing.
 *
 * `nothing` matters as much as the answer: an end dropped in the middle of a shape but
 * not near any magnet means **auto** — "attach it wherever looks best" — and that is
 * the commonest thing a reader wants. Snapping to the nearest magnet regardless would
 * make every drop a choice they did not make and cannot undo without knowing the
 * control exists.
 *
 * The centre is offered too, because a straight connector uses it (§8.3) — and it is
 * the hardest one to hit by accident, being surrounded by the shape.
 */
export function nearestMagnet(
  box: ConnectorBox,
  point: Point,
  snap = MAGNET_SNAP
): ConnectorSide | null {
  let best: ConnectorSide | null = null;
  let shortest = snap;
  for (const magnet of magnetPoints(box)) {
    const distance = Math.hypot(magnet.point.x - point.x, magnet.point.y - point.y);
    if (distance <= shortest) {
      shortest = distance;
      best = magnet.side;
    }
  }
  return best;
}

/**
 * Room left around an obstacle when routing past it: 24px.
 *
 * A line that grazes a shape's edge reads as touching it, and a diagram's whole job is
 * to show what is joined to what.
 */
export const ROUTE_GAP = 360;

/** How close a line may come to a shape before it counts as crossing it: 4px. */
const CROSS_MARGIN = 60;

/** The axis-aligned box a shape covers, rotation included. */
function coveredBox(box: ConnectorBox): ConnectorBox {
  const rotation = box.rotation ?? 0;
  if (!rotation) return { ...box, rotation: 0 };
  const centre = centreOf(box);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height }
  ].map((corner) => rotateAround(corner, centre, rotation));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    rotation: 0
  };
}

/**
 * Whether a segment passes through a shape.
 *
 * An endpoint **inside** the shape counts: a segment that starts in a box has already
 * crossed it, and the edge test alone would miss exactly the case where a line begins
 * behind something.
 */
export function crossesBox(a: Point, b: Point, box: ConnectorBox, margin = CROSS_MARGIN): boolean {
  const grown: ConnectorBox = {
    ...box,
    x: box.x - margin,
    y: box.y - margin,
    width: box.width + margin * 2,
    height: box.height + margin * 2
  };
  const rotation = grown.rotation ?? 0;
  const centre = centreOf(grown);
  const inside = (point: Point): boolean => {
    const local = rotation ? rotateAround(point, centre, -rotation) : point;
    return (
      local.x >= grown.x &&
      local.x <= grown.x + grown.width &&
      local.y >= grown.y &&
      local.y <= grown.y + grown.height
    );
  };
  if (inside(a) || inside(b)) return true;

  const outline =
    outlinePoints(grown) ??
    [
      { x: grown.x, y: grown.y },
      { x: grown.x + grown.width, y: grown.y },
      { x: grown.x + grown.width, y: grown.y + grown.height },
      { x: grown.x, y: grown.y + grown.height }
    ].map((corner) => rotateAround(corner, centre, rotation));

  return outline.some(
    (corner, at) => !!crossing(a, b, corner, outline[(at + 1) % outline.length])
  );
}

/** How many times a route passes through anything. */
export function crossCount(points: Point[], obstacles: ConnectorBox[]): number {
  let count = 0;
  for (let at = 0; at < points.length - 1; at += 1) {
    for (const box of obstacles) {
      if (crossesBox(points[at], points[at + 1], box)) count += 1;
    }
  }
  return count;
}

/** How long a route is, for choosing between two that both avoid everything. */
export function pathLength(points: Point[]): number {
  let length = 0;
  for (let at = 0; at < points.length - 1; at += 1) {
    length += Math.hypot(points[at + 1].x - points[at].x, points[at + 1].y - points[at].y);
  }
  return length;
}

/**
 * Touching obstacles, merged into one.
 *
 * ## Why this exists
 *
 * Candidate routes are generated *around a box*. Two boxes side by side and a route
 * that clears one of them lands in the other, so no candidate is ever clean and the
 * line gives up and goes straight through both. What looks like "a maze the router
 * cannot solve" is almost always this — a **clump**, not a maze.
 *
 * ## And why crossings are still counted against the originals
 *
 * A clump covers the gap between its members, and a gap can be a perfectly good way
 * through. So the merged boxes decide *where to try*, and the real boxes decide whether
 * a try worked.
 */
export function clusterBoxes(obstacles: ConnectorBox[], gap = ROUTE_GAP): ConnectorBox[] {
  const near = (one: ConnectorBox, two: ConnectorBox): boolean =>
    one.x - gap < two.x + two.width &&
    two.x - gap < one.x + one.width &&
    one.y - gap < two.y + two.height &&
    two.y - gap < one.y + one.height;

  const merged: ConnectorBox[] = [];
  for (const box of obstacles.map(coveredBox)) {
    let grown = box;
    // Absorbing makes it bigger, which can bring it into reach of one it did not touch
    // before — so this goes round again until nothing else is near.
    for (let again = true; again; ) {
      again = false;
      for (let at = merged.length - 1; at >= 0; at -= 1) {
        if (!near(grown, merged[at])) continue;
        const other = merged.splice(at, 1)[0];
        const x = Math.min(grown.x, other.x);
        const y = Math.min(grown.y, other.y);
        grown = {
          x,
          y,
          width: Math.max(grown.x + grown.width, other.x + other.width) - x,
          height: Math.max(grown.y + grown.height, other.y + other.height) - y,
          rotation: 0
        };
        again = true;
      }
    }
    merged.push(grown);
  }
  return merged;
}

/**
 * An elbow that goes **around** what is in the way, or the one it started with.
 *
 * ## How the candidates are made
 *
 * Two kinds. Pushing the bend to just outside each edge of the obstacle solves the
 * common case — two shapes at different heights with something between them. It cannot
 * solve the other one: ends at the *same* height make a straight run whatever the bend
 * is, so there are also explicit six-point detours that step out, along, and back.
 *
 * ## Chosen by "clean and shortest", not by "fewer crossings"
 *
 * A crossing count depends on how many segments a route has, so a route with fewer
 * segments can look better while being more blocked. Only routes that cross **nothing**
 * are considered, and the shortest of those wins.
 *
 * ## And if nothing is clean, the original stands
 *
 * A line that detours across the whole slide is harder to read than one that crosses a
 * box: the reader can see a line passing over a shape and understand it, and cannot
 * follow a line that wanders. Every editor that routes gives up in the same place.
 */
export function avoidObstacles(
  base: Point[],
  ends: ResolvedEnds,
  bend: number,
  obstacles: ConnectorBox[]
): Point[] {
  if (obstacles.length === 0) return base;
  if (crossCount(base, obstacles) === 0) return base;

  const { start, end } = ends;
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const swapped: ResolvedEnds = {
    ...ends,
    startSide: ends.endSide,
    endSide: ends.startSide
  };
  const candidates: Point[][] = [base, elbowPoints(swapped, bend)];

  const clusters = clusterBoxes(obstacles);
  const hit = clusters.filter((box) => crossCount(base, [box]) > 0);
  // Two clumps out of line with each other can close the way between them; the box
  // around both is the candidate that opens it.
  const whole: ConnectorBox[] =
    hit.length > 1
      ? [
          {
            x: Math.min(...hit.map((box) => box.x)),
            y: Math.min(...hit.map((box) => box.y)),
            width:
              Math.max(...hit.map((box) => box.x + box.width)) - Math.min(...hit.map((box) => box.x)),
            height:
              Math.max(...hit.map((box) => box.y + box.height)) -
              Math.min(...hit.map((box) => box.y)),
            rotation: 0
          }
        ]
      : [];

  for (const box of [...clusters, ...whole]) {
    const left = box.x - ROUTE_GAP;
    const right = box.x + box.width + ROUTE_GAP;
    const top = box.y - ROUTE_GAP;
    const bottom = box.y + box.height + ROUTE_GAP;

    for (const pushed of [left - middle.x, right - middle.x, top - middle.y, bottom - middle.y]) {
      candidates.push(elbowPoints(ends, pushed));
      candidates.push(elbowPoints(swapped, pushed));
    }

    for (const dodge of [top, bottom]) {
      candidates.push([
        start,
        { x: left, y: start.y },
        { x: left, y: dodge },
        { x: right, y: dodge },
        { x: right, y: end.y },
        end
      ]);
    }
    for (const dodge of [left, right]) {
      candidates.push([
        start,
        { x: start.x, y: top },
        { x: dodge, y: top },
        { x: dodge, y: bottom },
        { x: end.x, y: bottom },
        end
      ]);
    }
  }

  const clean = candidates.filter((points) => crossCount(points, obstacles) === 0);
  if (clean.length === 0) return base;
  return clean.reduce((best, points) => (pathLength(points) < pathLength(best) ? points : best));
}

/**
 * A straight line moved to a **different magnet** to get past something.
 *
 * A straight line has nothing to bend, so the only thing that can change is where it
 * leaves and arrives — and a magnet the reader *chose* is not moved: they said which
 * side, and a router overruling that is a control that does not work.
 */
export function avoidStraight(
  spec: ConnectorSpec,
  ends: ResolvedEnds,
  boxes: { start?: ConnectorBox; end?: ConnectorBox },
  obstacles: ConnectorBox[]
): Point[] {
  const base = [ends.start, ends.end];
  if (obstacles.length === 0 || crossCount(base, obstacles) === 0) return base;

  const placesFor = (box: ConnectorBox | undefined, side: ConnectorSide, fallback: Point): Point[] =>
    !box || side !== 'auto'
      ? [fallback]
      : [fallback, ...(['n', 'e', 's', 'w'] as ConnectorSide[]).map((at) => sidePoint(box, at))];

  const candidates: Point[][] = [];
  for (const from of placesFor(boxes.start, spec.start.side, ends.start)) {
    for (const to of placesFor(boxes.end, spec.end.side, ends.end)) candidates.push([from, to]);
  }

  const clean = candidates.filter((points) => crossCount(points, obstacles) === 0);
  if (clean.length === 0) return base;
  return clean.reduce((best, points) => (pathLength(points) < pathLength(best) ? points : best));
}

/**
 * A curve **bowed further** to get past something.
 *
 * What makes a curve a curve is the size and side of its bow, so those are the two
 * things to try: bending it into right angles would throw away the reason a reader
 * chose a curve. The **least** bowed clean answer wins — a curve that loops far out is
 * one whose two ends are hard to see the relation between.
 *
 * A cubic is flattened before it is measured: four control points are not the shape,
 * and the middle of the curve is where an obstacle usually is.
 */
export function avoidCurve(
  ends: ResolvedEnds,
  bend: number,
  obstacles: ConnectorBox[]
): Point[] {
  const base = curvePoints(ends, bend);
  if (obstacles.length === 0 || crossCount(flattenCurve(base), obstacles) === 0) return base;

  const span = Math.hypot(ends.end.x - ends.start.x, ends.end.y - ends.start.y);
  const step = Math.max(450, span * 0.25);
  const tries: number[] = [];
  for (let round = 1; round <= 5; round += 1) {
    tries.push(bend + step * round, -(Math.abs(bend) + step * round));
  }

  const found = tries
    .map((bow) => ({ bow, points: curvePoints(ends, bow) }))
    .filter((item) => crossCount(flattenCurve(item.points), obstacles) === 0);
  if (found.length === 0) return base;
  return found.reduce((best, item) => (Math.abs(item.bow) < Math.abs(best.bow) ? item : best))
    .points;
}

/**
 * A cubic as a chain of straight segments.
 *
 * For measuring only. Its four control points are not its shape — the two handles are
 * usually well off the curve — so counting crossings against them would report an
 * obstacle the curve misses and miss one it hits.
 */
export function flattenCurve(points: Point[], steps = 14): Point[] {
  /**
   * More than one cubic: a spline through a reader's waypoints (`splineThrough`).
   *
   * Flattened span by span, because the *measured* line has to be the drawn one — a label
   * or a hit test walking the control points instead would be off the curve by exactly the
   * amount that makes a label sit beside its own line.
   */
  if (points.length > 4 && (points.length - 1) % 3 === 0) {
    const out: Point[] = [];
    for (let span = 0; span + 3 < points.length; span += 3) {
      const piece = flattenCurve(points.slice(span, span + 4), steps);
      out.push(...(span === 0 ? piece : piece.slice(1)));
    }
    return out;
  }
  if (points.length !== 3 && points.length !== 4) return points;
  const out: Point[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const u = 1 - t;
    if (points.length === 3) {
      // A quadratic, which is what an arc is: one control point.
      const [a, c, b] = points;
      out.push({
        x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * b.y
      });
      continue;
    }
    const [a, b, c, d] = points;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y
    });
  }
  return out;
}

/**
 * The **track**: the route as something to measure along.
 *
 * A route is what is *drawn* — for a curve or an arc that is control points, and the
 * straight lines between them are the triangle the curve sits inside rather than the
 * curve itself. Anything that measures *along* the line — where the label goes, where an
 * end attached at a fraction lands, which point on it a drop is nearest — has to walk
 * the curve.
 *
 * Two words because they are two things, and using one for both is how a label ends up
 * beside its own line.
 */
export function connectorTrack(points: Point[], kind: ConnectorKind): Point[] {
  return kind === 'curve' || kind === 'arc' ? flattenCurve(points) : points;
}

/**
 * A point a fraction of the way **along** a route.
 *
 * By length, not by how many corners there are: the middle of an elbow whose first leg
 * is twice the second is not its second corner, and a reader dropping a line "halfway
 * along" means the halfway they can see. Measured on the flattened route, so a curve
 * behaves the same way.
 */
export function pointOnPath(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const total = pathLength(points);
  if (total === 0) return points[0];

  let want = Math.min(1, Math.max(0, t)) * total;
  for (let at = 0; at < points.length - 1; at += 1) {
    const dx = points[at + 1].x - points[at].x;
    const dy = points[at + 1].y - points[at].y;
    const segment = Math.hypot(dx, dy);
    if (want <= segment || at === points.length - 2) {
      const along = segment ? want / segment : 0;
      return { x: points[at].x + dx * along, y: points[at].y + dy * along };
    }
    want -= segment;
  }
  return points[points.length - 1];
}

/**
 * The place on a route nearest a point, and how far along it is.
 *
 * What a drop lands on: a reader aiming at a line hits somewhere *near* it, and the end
 * has to attach to the line rather than to the pointer. `t` is by length for the same
 * reason as above, and `distance` is what a caller uses to decide whether the drop was
 * close enough to mean the line at all.
 */
export function nearestOnPath(
  points: Point[],
  point: Point
): { t: number; point: Point; distance: number } {
  if (points.length < 2) {
    const only = points[0] ?? { x: 0, y: 0 };
    return { t: 0, point: only, distance: Math.hypot(point.x - only.x, point.y - only.y) };
  }

  const total = pathLength(points);
  let walked = 0;
  let best = { t: 0, point: points[0], distance: Infinity };

  for (let at = 0; at < points.length - 1; at += 1) {
    const dx = points[at + 1].x - points[at].x;
    const dy = points[at + 1].y - points[at].y;
    const segment = Math.hypot(dx, dy);
    // How far along this segment the perpendicular from the point falls, clamped to
    // the segment: a point beyond either end attaches to that end.
    const along = segment
      ? Math.min(
          1,
          Math.max(0, ((point.x - points[at].x) * dx + (point.y - points[at].y) * dy) / (segment * segment))
        )
      : 0;
    const on = { x: points[at].x + dx * along, y: points[at].y + dy * along };
    const distance = Math.hypot(point.x - on.x, point.y - on.y);
    if (distance < best.distance) {
      best = { t: total ? (walked + segment * along) / total : 0, point: on, distance };
    }
    walked += segment;
  }
  return best;
}

/** A label's own size: 13px of type with 5px of air round it, in twips. */
export const LABEL_SIZE = 195;
const LABEL_PAD = 75;

/** The most characters a label carries — a word on a line, not a paragraph. */
export const LABEL_MAX = 24;

/**
 * How big the pill behind a label has to be, **estimated**.
 *
 * ## Why an estimate rather than a measurement
 *
 * The label is drawn in SVG so it travels with the line, and SVG cannot measure text
 * before it has drawn it. The alternative — an HTML box measured by the browser — means
 * a layout pass, a second element per line, and a number that arrives one frame after
 * the drawing.
 *
 * So the width is counted from the characters, and the rule is the one that matters:
 * **a CJK character is about as wide as the type is tall** and a Latin one is a little
 * over half that. Getting it the other way round makes a Korean label overflow its own
 * pill, which is the commonest way this looks broken.
 *
 * Generous rather than tight: a pill a few twips too wide is invisible, and one too
 * narrow has letters hanging out of it.
 */
export function labelBox(label: string, size = LABEL_SIZE): { width: number; height: number } {
  const text = label.trim();
  if (!text) return { width: 0, height: 0 };

  const characters = [...text];
  // Anything above U+2E80 is CJK, Hangul, or the punctuation that comes with them.
  const wide = characters.filter((character) => character.charCodeAt(0) > 0x2e80).length;
  const narrow = characters.length - wide;

  return {
    width: Math.round(wide * size + narrow * size * 0.55) + LABEL_PAD * 2,
    height: Math.round(size * 1.25) + LABEL_PAD * 2
  };
}

/**
 * The label a connector carries, cut to what a line can hold.
 *
 * Cut here rather than in the drawing, so every reader of it agrees: a pill sized for
 * twenty-four characters with forty in it is a label with letters hanging off the end.
 * An ellipsis, because a label that stops mid-word looks like a fault rather than a
 * limit.
 */
export function labelOf(node: { attributes?: Record<string, unknown> } | undefined | null): string {
  const raw = node?.attributes?.label;
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (text.length <= LABEL_MAX) return text;
  return `${[...text].slice(0, LABEL_MAX - 1).join('')}…`;
}

/**
 * Where a label sits: the middle of the route, by length.
 *
 * By length rather than at the middle corner, for the same reason `pointOnPath` is —
 * the middle of an elbow whose first leg is twice its second is on that leg, and a
 * label parked on the corner reads as belonging to neither half.
 */
export function labelAt(points: Point[]): Point {
  return pointOnPath(points, 0.5);
}

/** How far in from an end a role or a multiplicity sits: ⅔ inch. */
export const LABEL_INSET = 960;

/**
 * Where a word that belongs to **one end** of a line goes.
 *
 * ## Why a line needs three words and not one
 *
 * The label in the middle names the relationship; a word at an end says something about
 * *that* end. UML's multiplicity is the case everyone knows — `1` at one end and `0..*` at
 * the other, which is the difference between "an order has items" and "an order has many
 * items" — and a scenario editor's arrows carry the same shape of information: which
 * actor, on what condition.
 *
 * Two more attributes rather than a list of `{ t, text }`, for the reason the whole
 * connector is flat (§8.1): the schema can declare them and the harness can probe them. A
 * list of objects is a value nothing checks, and the notation readers actually draw is
 * *these three*.
 *
 * ## Where it sits, and the two things that had to be right
 *
 * A fixed distance in from the end, **offset to one side** so it neither sits on the line
 * nor overlaps the shape the line arrives at. The offset is always to the left of the
 * direction of travel, for the reason the hop always bulges one way: words that jumped
 * from one side to the other along a diagram read as a mistake.
 *
 * The inset is clamped to a third of the line, or on a short line the two end words meet
 * in the middle — each other and the label already there.
 */
export function labelNear(
  points: Point[],
  which: 'start' | 'end',
  size = LABEL_SIZE,
  inset = LABEL_INSET
): Point {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };

  const total = pathLength(points) || 1;
  const along = Math.min(inset, total / 3) / total;
  const at = pointOnPath(points, which === 'start' ? along : 1 - along);

  // The direction *there*, taken from a short step along the line, so an elbow's word is
  // offset from the run it is actually on rather than from the line between the ends.
  const step = Math.min(0.05, along / 2 || 0.05);
  const before = pointOnPath(points, Math.max(0, (which === 'start' ? along : 1 - along) - step));
  const after = pointOnPath(points, Math.min(1, (which === 'start' ? along : 1 - along) + step));
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;

  // Clear of the line by half the type's height and a little: a pill drawn *on* the line
  // has the line running through the word.
  const clear = size * 1.1;
  return {
    x: Math.round(at.x + (-dy / length) * clear),
    y: Math.round(at.y + (dx / length) * clear)
  };
}

/** The word at one end of a line, trimmed the way the middle one is. */
export function endLabelOf(
  node: { attributes?: Record<string, unknown> } | undefined | null,
  which: 'start' | 'end'
): string {
  const raw = node?.attributes?.[which === 'start' ? 'startLabel' : 'endLabel'];
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (text.length <= LABEL_MAX) return text;
  return `${[...text].slice(0, LABEL_MAX - 1).join('')}…`;
}

/** How far apart two lines between the same pair of shapes are fanned: 32px. */
export const SEPARATION = 480;

/**
 * How far to bow the *n*th line between the same two shapes, so they are not one line.
 *
 * ## Why this is automatic
 *
 * Two connectors joining the same pair are routed identically, which means they are
 * drawn on top of each other: the reader sees one line, cannot tell there are two, and
 * cannot select the one underneath. That is a **broken state**, not a styling choice —
 * so the drawing separates them and the document says nothing. Nothing is stored, so
 * nothing has to be kept in step.
 *
 * ## Fanned symmetrically, and the cost of that
 *
 * `(index - (count - 1) / 2) * step`: one line is straight, two sit either side of
 * where it would have been, three put one back in the middle. The cost is that adding
 * a third line moves the first two — visible, and the right kind of visible: they fan.
 * The alternative (leave the first where it is and push each new one aside) makes the
 * first line look like the *main* one, which is a claim about the diagram nobody made.
 *
 * ## And a reader's own bow wins
 *
 * A `bend` on the node is not overruled, for the same reason a magnet a reader chose is
 * not: they have said where this line goes.
 */
export function separationBend(index: number, count: number, step = SEPARATION): number {
  if (count <= 1 || index < 0 || index >= count) return 0;
  return Math.round((index - (count - 1) / 2) * step);
}

/** Whether the document says what bow this line has, as opposed to leaving it to us. */
export function hasOwnBend(node: NodeLike | undefined | null): boolean {
  const bend = node?.attributes?.bend;
  return typeof bend === 'number' && Number.isFinite(bend) && bend !== 0;
}

/**
 * The two shapes a line joins, as one name whichever way round they are.
 *
 * A→B and B→A are both "between these two", and two lines drawn one on top of the other
 * are the same problem whichever direction each of them points.
 */
export function pairKeyOf(spec: ConnectorSpec): string | undefined {
  const { start, end } = spec;
  if (!start.nodeId || !end.nodeId) return undefined;
  return [start.nodeId, end.nodeId].sort().join('~');
}

/**
 * The middle of a route, as a **handle** sits on it.
 *
 * Not `pointOnPath(points, 0.5)`, which is the middle by length and is right for a
 * label. A handle has to sit on the part of the line the bow *moves*: an elbow's middle
 * segment, and a curve's actual midpoint — which for a cubic is
 * `(p0 + 3c1 + 3c2 + p3) / 8` and not the average of its ends, because the handles pull
 * it away from that.
 */
export function midHandleOf(points: Point[], kind: ConnectorKind): Point {
  if (points.length < 2) return { x: 0, y: 0 };

  // An arc: the quadratic's own midpoint, `(p0 + 2c + p1) / 4`. Not the control point,
  // which is twice as far out as the curve ever goes.
  if (kind === 'arc' && points.length === 3) {
    return {
      x: (points[0].x + 2 * points[1].x + points[2].x) / 4,
      y: (points[0].y + 2 * points[1].y + points[2].y) / 4
    };
  }

  if ((kind === 'curve' || kind === 'arc') && points.length === 4) {
    const eighth = (a: number, b: number, c: number, d: number) => (a + 3 * b + 3 * c + d) / 8;
    return {
      x: eighth(points[0].x, points[1].x, points[2].x, points[3].x),
      y: eighth(points[0].y, points[1].y, points[2].y, points[3].y)
    };
  }
  // An elbow with two corners: the middle of the segment between them, which is the
  // one the bow slides.
  if (points.length === 4) {
    return { x: (points[1].x + points[2].x) / 2, y: (points[1].y + points[2].y) / 2 };
  }
  if (points.length === 3) return points[1];
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
}

/**
 * Whether dragging that handle can change anything.
 *
 * Asked here rather than in the overlay, because the answer is the route's and every
 * caller has to give the same one: a grip that starts a drag which cannot change the
 * line is worse than no grip, and one missing where the drag *would* work takes away
 * the only way to undo a fan by hand.
 *
 * - A **straight** line has no bow at all — `connectorPoints` never passes `bend` to it
 *   — so a grip on one would be a control wired to nothing.
 * - An **elbow** slides only when it has two corners. One corner is where its two sides
 *   meet and there is nothing between them to move; `elbowPoints` ignores `bend` in that
 *   case, and `bendFromDrag` answers the bend unchanged.
 * - A **curve** and an **arc** always bow, which is the whole shape of them.
 */
export function canBendByDrag(
  points: Point[],
  kind: ConnectorKind,
  /**
   * Whether the reader has placed bends of their own.
   *
   * `connectorPoints` ignores `bend` entirely once there are waypoints — they have said
   * where the line goes — so a bow grip on such a line is a control wired to nothing,
   * which is the exact fault this function exists to prevent.
   */
  hasWaypoints = false
): boolean {
  if (points.length < 2) return false;
  if (hasWaypoints) return false;
  if (kind === 'straight') return false;
  if (kind === 'elbow') return points.length === 4;
  return true;
}

/**
 * The bow a drag of that handle means.
 *
 * A reader pulls the handle wherever they like, and only **one axis** of that can
 * change anything: an elbow's middle segment slides along one axis, and a curve bows
 * across the line between its ends. So the drag is projected onto the axis that moves,
 * and the other half of it is dropped rather than turned into something the route
 * cannot express.
 *
 * An elbow with a single corner has nothing to slide — its corner is where its two
 * sides meet — so a drag there means nothing and answers nothing.
 */
export function bendFromDrag(
  points: Point[],
  kind: ConnectorKind,
  to: Point,
  bend = 0
): number {
  if (points.length < 2) return bend;
  const middle = midHandleOf(points, kind);

  if (kind === 'elbow') {
    if (points.length !== 4) return bend;
    const sideways = Math.abs(points[1].x - points[0].x) > Math.abs(points[1].y - points[0].y);
    return Math.round(bend + (sideways ? to.x - middle.x : to.y - middle.y));
  }

  const from = points[0];
  const at = points[points.length - 1];
  const length = Math.hypot(at.x - from.x, at.y - from.y) || 1;
  // Projected onto the normal of the line between the ends, which is the direction a
  // curve's bow moves in.
  const across =
    ((to.x - middle.x) * -(at.y - from.y)) / length + ((to.y - middle.y) * (at.x - from.x)) / length;
  return Math.round(bend + across);
}

/**
 * The points a reader has told the line to go **through**.
 *
 * ## Why these are in the document when the route is not
 *
 * The route is derived — where a line goes follows from the shapes it joins and what is
 * in the way (§8.11). A waypoint is the opposite: it is a *decision*, and there is
 * nothing to derive it from. A reader who has bent a line around a table they will move
 * later means that bend to stay.
 *
 * Read the way every list in this model is read — anything that is not a pair of finite
 * numbers is dropped rather than trusted, because a document is a file anybody can write
 * and one bad entry would take the whole line with it.
 */
export function readWaypoints(node: NodeLike | undefined | null): Point[] {
  const raw = node?.attributes?.waypoints;
  if (!Array.isArray(raw)) return [];

  const found: Point[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { x, y } = entry as { x?: unknown; y?: unknown };
    if (typeof x !== 'number' || !Number.isFinite(x)) continue;
    if (typeof y !== 'number' || !Number.isFinite(y)) continue;
    found.push({ x: Math.round(x), y: Math.round(y) });
  }
  return found;
}

/**
 * A route that passes through the reader's points.
 *
 * ## The elbow is the interesting one
 *
 * Between two consecutive points a right-angled route has to choose which axis to travel
 * first, and the choice that reads as one line rather than a staircase is to **alternate**
 * — leave along the axis the previous leg did not use. Starting axis comes from the side
 * the line leaves by, so a line out of an east magnet goes across first, as it does with
 * no waypoints at all.
 *
 * Straight and curved routes simply pass through: a curve through hand-placed points is a
 * polyline, because a reader who has placed three points has said where the line goes and
 * a spline would put it somewhere else.
 */
/**
 * A smooth curve **through** a list of points.
 *
 * ## The bug this replaces
 *
 * A curve's points are *control* points — `connectorPath` reads three as a quadratic and
 * four as a cubic — and a curve with waypoints was handing it the reader's own points in
 * that same list. So one waypoint became a *control* point: the line bent towards it and
 * never went through it, which is the one thing a placed bend means. Two waypoints drew a
 * polyline, because five points match no branch.
 *
 * ## Catmull-Rom, converted to Béziers
 *
 * The textbook answer for a curve that passes through every point it is given, and it
 * converts exactly: each span becomes one cubic whose handles are a sixth of the way along
 * the *neighbours'* chord, which is what makes the joins smooth rather than kinked. The
 * ends duplicate themselves, so the first and last spans lean on the points they have.
 *
 * The answer is a flat list of **1 + 3n** points — a start and a handle-handle-end triple
 * per span — which is the shape `connectorPath` and `flattenCurve` already read for one
 * cubic. So a curve's points still mean "control points", whatever their number, and
 * nothing has to guess which kind of list it is holding.
 */
export function splineThrough(stops: Point[]): Point[] {
  if (stops.length < 3) return stops;

  const at = (index: number) => stops[Math.max(0, Math.min(stops.length - 1, index))];
  const out: Point[] = [stops[0]];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const before = at(index - 1);
    const from = at(index);
    const to = at(index + 1);
    const after = at(index + 2);
    out.push(
      { x: from.x + (to.x - before.x) / 6, y: from.y + (to.y - before.y) / 6 },
      { x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6 },
      { x: to.x, y: to.y }
    );
  }
  return out;
}

export function throughWaypoints(
  ends: ResolvedEnds,
  waypoints: Point[],
  kind: ConnectorKind
): Point[] {
  const stops = [ends.start, ...waypoints, ends.end];
  /**
   * A curve goes **through** them, smoothly.
   *
   * Handing the stops back unchanged made the reader's point a *control* point: the line
   * leaned towards it and never reached it. An arc is the same case — its own bow is what
   * a waypoint replaces.
   */
  if (kind === 'curve' || kind === 'arc') return splineThrough(stops);
  if (kind !== 'elbow') return stops;

  const points: Point[] = [ends.start];
  // The first leg leaves along the side's own axis, so a line out of an east magnet goes
  // sideways first — the same as it does with no waypoints.
  let across = ends.startSide === 'e' || ends.startSide === 'w' || ends.startSide === 'c';

  for (let at = 1; at < stops.length; at += 1) {
    const from = points[points.length - 1];
    const to = stops[at];
    if (from.x === to.x || from.y === to.y) {
      // Already square: no corner needed, and inventing one would draw a spur.
      points.push(to);
      // The next leg travels the other way round from this one.
      across = from.y === to.y;
      continue;
    }
    points.push(across ? { x: to.x, y: from.y } : { x: from.x, y: to.y });
    points.push(to);
    across = !across;
  }
  return points;
}
