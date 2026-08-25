import { boxOf, type Box, type Placement } from './canvas-box';

/**
 * Dragging a box, as arithmetic.
 *
 * Every one of these is a pure function from a box and a pointer movement to a
 * new box, and that is deliberate: a resize handle is the kind of thing that is
 * *almost* right in a hundred subtle ways — the corner drifts, the aspect lock
 * pulls the wrong axis, dragging past the far edge flips it inside out — and
 * every one of those is a browser session to find and a browser session to
 * confirm. Here they are a millisecond each.
 *
 * Nothing here knows about the DOM, the pointer, or twips-to-pixels. The caller
 * converts a pointer movement into a model-space delta once, and everything
 * after that is numbers.
 */

/** Which handle is being dragged. `move` is the box itself. */
export type Handle =
  | 'move'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

export const RESIZE_HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** How far the pointer has moved, in the model's units. */
export interface Delta {
  dx: number;
  dy: number;
}

export interface ResizeOptions {
  /**
   * Keep the box's proportions.
   *
   * Shift, in every drawing tool there is. Applied to the *corner* handles only:
   * an edge handle moves one axis by definition, and "keep the proportions while
   * dragging one edge" has no meaning a reader could predict.
   */
  keepAspect?: boolean;
  /**
   * Resize about the centre rather than about the opposite corner.
   *
   * Alt, in every drawing tool there is.
   */
  fromCentre?: boolean;
  /**
   * The smallest a box may be dragged to.
   *
   * Not zero: a box with no width cannot be grabbed again, so a reader who
   * overshoots has destroyed the thing rather than resized it. In twips —
   * 120 is a hundredth of an inch, small enough never to be in the way.
   */
  minimum?: number;
}

const MINIMUM = 120;

/**
 * Move a box. The simplest one, and the one every drag starts as.
 *
 * Rounded, like every other result here. A pointer delta is a screen distance
 * divided by the scale, so it arrives as a fraction almost every time — a drag
 * in the browser put `x: 8977.777777777777` in the document, which is a
 * sixteenth of a pixel of meaning and a lifetime of approximate comparisons
 * afterwards.
 */
export function moveBox(placement: Placement | undefined, delta: Delta): Box {
  const box = boxOf(placement);
  return { ...box, x: Math.round(box.x + delta.dx), y: Math.round(box.y + delta.dy) };
}

/**
 * Resize a box by dragging one of its handles.
 *
 * The edge or corner being dragged moves with the pointer and the opposite one
 * stays put — which is the whole of what a resize handle means, and is why this
 * is written as "move these edges" rather than as "add the delta to the width".
 * The latter is the version that drifts: dragging the west handle right must
 * move `x` *and* shrink `width`, and a caller that only changed the width would
 * grow the box leftwards from a corner nobody grabbed.
 */
export function resizeBox(
  placement: Placement | undefined,
  handle: Handle,
  delta: Delta,
  options: ResizeOptions = {}
): Box {
  const box = boxOf(placement);
  if (handle === 'move') return moveBox(placement, delta);

  const minimum = Math.max(0, options.minimum ?? MINIMUM);
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.startsWith('n');
  const south = handle.startsWith('s');

  let { dx, dy } = delta;

  /**
   * Proportions, on a corner.
   *
   * The larger movement wins, so the box follows the pointer on the axis the
   * reader is actually dragging along and the other one is computed. Taking the
   * horizontal always would make a mostly-vertical drag feel dead.
   */
  if (options.keepAspect && (west || east) && (north || south) && box.width > 0 && box.height > 0) {
    const ratio = box.height / box.width;
    const wantWidth = (east ? dx : -dx);
    const wantHeight = (south ? dy : -dy);

    if (Math.abs(wantWidth) * ratio > Math.abs(wantHeight)) {
      const height = wantWidth * ratio;
      dy = south ? height : -height;
    } else {
      const width = wantHeight / ratio;
      dx = east ? width : -width;
    }
  }

  // The centre variant moves both sides by the same amount in opposite
  // directions, which is what Alt does everywhere and is one line rather than a
  // separate code path.
  const mirror = options.fromCentre ? 1 : 0;

  let left = box.x + (west ? dx : 0) - (east ? dx * mirror : 0);
  let right = box.x + box.width + (east ? dx : 0) - (west ? dx * mirror : 0);
  let top = box.y + (north ? dy : 0) - (south ? dy * mirror : 0);
  let bottom = box.y + box.height + (south ? dy : 0) - (north ? dy * mirror : 0);

  /**
   * Dragged past the far edge.
   *
   * Sorting the two sides rather than clamping, because flipping is a real and
   * expected outcome — a reader dragging the west handle past the east one is
   * mirroring the box, which is what every drawing tool does. What must not
   * happen is a negative width reaching the model, where CSS would draw nothing.
   */
  const flippedX = left > right;
  const flippedY = top > bottom;
  if (flippedX) [left, right] = [right, left];
  if (flippedY) [top, bottom] = [bottom, top];

  /**
   * After a flip, the sides have swapped jobs.
   *
   * The handle being dragged is still called `w`, but it is now the *right*
   * side of the box and the anchored edge is on the left. A floor applied to
   * the original roles would hold the side the reader is dragging and push the
   * one they are not, which is the anchor moving on its own.
   */
  const dragWest = flippedX ? east : west;
  const dragEast = flippedX ? west : east;
  const dragNorth = flippedY ? south : north;
  const dragSouth = flippedY ? north : south;

  /**
   * Then the floor — on the axis being dragged, and only there.
   *
   * The "only there" is not a refinement. Applied to both axes it silently
   * resizes the axis nobody touched: dragging the east handle of a box shorter
   * than the minimum made it *taller*, because the height was under the floor
   * and the floor did not care that the drag was horizontal. Caught by a test
   * whose box happened to be 100 twips tall.
   *
   * Within the dragged axis it is applied to the side being dragged, so the box
   * stops rather than pushing its anchored side along with it.
   */
  if ((west || east) && right - left < minimum) {
    if (dragWest && !dragEast) left = right - minimum;
    else if (dragEast && !dragWest) right = left + minimum;
    else {
      const centre = (left + right) / 2;
      left = centre - minimum / 2;
      right = centre + minimum / 2;
    }
  }
  if ((north || south) && bottom - top < minimum) {
    if (dragNorth && !dragSouth) top = bottom - minimum;
    else if (dragSouth && !dragNorth) bottom = top + minimum;
    else {
      const centre = (top + bottom) / 2;
      top = centre - minimum / 2;
      bottom = centre + minimum / 2;
    }
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  };
}

/**
 * The angle a rotate handle is pointing at.
 *
 * Measured from the box's centre, with zero pointing up — which is where a
 * rotate handle sits and what `rotate(0deg)` means. `atan2` gives zero pointing
 * *right*, so the quarter turn is the whole of the conversion and getting it
 * wrong rotates everything by ninety degrees, which is the kind of bug that
 * looks like a bad handle position.
 */
export function angleOf(box: Box, pointer: { x: number; y: number }): number {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const degrees = (Math.atan2(pointer.y - cy, pointer.x - cx) * 180) / Math.PI + 90;
  return ((degrees % 360) + 360) % 360;
}

/**
 * Rotation, snapped when asked.
 *
 * Fifteen degrees, which is what Shift does in a drawing tool and which covers
 * every angle a reader actually wants — the diagonals and the right angles.
 */
export function snapAngle(degrees: number, step = 15): number {
  const snapped = Math.round(degrees / step) * step;
  return ((snapped % 360) + 360) % 360;
}

/**
 * The smallest box containing all of them.
 *
 * What a multiple selection draws its outline around, and what aligning and
 * distributing measure against.
 */
export function unionOf(boxes: Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const box of boxes) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Whether a point is inside a box — the hit test, before rotation. */
export function contains(box: Box, point: { x: number; y: number }): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

/**
 * A point in a rotated box's own coordinates.
 *
 * A rotated box is still a rectangle; it is the *pointer* that is in the wrong
 * frame. Turning the point back by the box's angle about its centre and then
 * testing the unrotated rectangle is exact, where testing the axis-aligned
 * bounding box would catch clicks on the corners of a diamond that are not on
 * the diamond.
 */
export function unrotate(
  box: Box,
  rotation: number,
  point: { x: number; y: number }
): { x: number; y: number } {
  if (!rotation) return point;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radians = (-rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - cx;
  const dy = point.y - cy;

  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * Whether two boxes touch at all — the marquee test.
 *
 * *Intersects*, not *contains*: a reader dragging a marquee across a slide
 * expects to catch what they dragged over. Requiring full containment means a
 * marquee that visibly crosses three shapes selects one, which reads as the
 * selection being broken rather than as a rule.
 */
export function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Lining boxes up, and spreading them out.
 *
 * Both are pure functions from boxes to boxes, returning only what *moved* —
 * so a command can commit exactly the changes it made and an alignment that
 * changes nothing commits nothing.
 */

export type Align = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Where each box goes when they are lined up.
 *
 * Against the union of them all, which is what a reader means by "align left"
 * with three shapes selected: the leftmost stays and the others come to it. A
 * caller aligning to the *slide* passes the slide's box as `within`, which is
 * the other thing that word can mean and the reason it is a parameter rather
 * than a decision made in here.
 *
 * One box aligns against `within` or not at all — aligning something to itself
 * is a command that reports success and does nothing.
 */
export function alignBoxes(
  boxes: Box[],
  align: Align,
  within?: Box
): Map<number, Box> {
  const frame = within ?? unionOf(boxes);
  const moved = new Map<number, Box>();
  if (!frame) return moved;

  boxes.forEach((box, index) => {
    let { x, y } = box;

    if (align === 'left') x = frame.x;
    else if (align === 'right') x = frame.x + frame.width - box.width;
    else if (align === 'centre') x = Math.round(frame.x + (frame.width - box.width) / 2);
    else if (align === 'top') y = frame.y;
    else if (align === 'bottom') y = frame.y + frame.height - box.height;
    else if (align === 'middle') y = Math.round(frame.y + (frame.height - box.height) / 2);

    if (x !== box.x || y !== box.y) moved.set(index, { ...box, x, y });
  });

  return moved;
}

/**
 * Even gaps between boxes, along one axis.
 *
 * The two outermost stay where they are and everything between them is spread
 * so the *gaps* are equal — not the centres. Equal centres is the other
 * plausible reading and it is wrong for boxes of different sizes: three shapes
 * of different widths with evenly spaced centres look unevenly spaced, because
 * what a reader sees is the white between them.
 *
 * Fewer than three boxes have nothing to distribute: with two, the gaps are
 * already equal by definition.
 */
export function distributeBoxes(boxes: Box[], axis: 'x' | 'y'): Map<number, Box> {
  const moved = new Map<number, Box>();
  if (boxes.length < 3) return moved;

  const size = axis === 'x' ? 'width' : ('height' as const);
  const order = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => a.box[axis] - b.box[axis]);

  const first = order[0].box;
  const last = order[order.length - 1].box;
  const span = last[axis] + last[size] - first[axis];
  const filled = order.reduce((total, entry) => total + entry.box[size], 0);
  const gap = (span - filled) / (order.length - 1);

  let at = first[axis] + first[size] + gap;
  for (let index = 1; index < order.length - 1; index += 1) {
    const entry = order[index];
    const value = Math.round(at);
    if (value !== entry.box[axis]) {
      moved.set(entry.index, { ...entry.box, [axis]: value } as Box);
    }
    at += entry.box[size] + gap;
  }

  return moved;
}

/**
 * Moving a box between coordinate spaces.
 *
 * A frame's children are placed against *it*, not against the slide — that is
 * the whole reason a frame is worth having, since moving the frame moves
 * everything in it and nothing rewrites a coordinate. Which means grouping and
 * ungrouping are, arithmetically, exactly this: the boxes do not move on screen
 * and every number describing them changes.
 *
 * Getting it backwards is invisible until a group is somewhere other than the
 * slide's origin, which is why it is here with a test rather than inline.
 */

/** A box's coordinates as its new parent sees them. */
export function intoFrame(box: Box, frame: Box): Box {
  return { ...box, x: box.x - frame.x, y: box.y - frame.y };
}

/** And back out, as the frame's own parent sees them. */
export function outOfFrame(box: Box, frame: Box): Box {
  return { ...box, x: box.x + frame.x, y: box.y + frame.y };
}

/**
 * Snapping, and the lines that explain it.
 *
 * A drag that lands a shape one twip off another's edge looks like a mistake
 * and is one — a reader aiming at an edge means the edge. So a drag in progress
 * is pulled onto the nearest interesting line, and a line it was pulled onto is
 * *drawn*, because a shape that jumps without saying why reads as the tool
 * fighting the reader.
 *
 * Both halves are here so they cannot disagree: the guide shown is computed
 * from the same candidate that moved the box, rather than being a second guess
 * at what happened.
 */

/** A line a box can snap to, and what makes it interesting. */
export interface Guide {
  axis: 'x' | 'y';
  /** Where the line is, in model units. */
  at: number;
}

/**
 * The lines worth snapping to on a canvas.
 *
 * Each box's two edges and its middle, plus the canvas's edges and centre. The
 * centres matter as much as the edges: "centred on the page" is the single
 * most common thing an author is aiming at, and it is the one position they
 * cannot hit by eye.
 */
export function guidesFor(others: Box[], canvas?: Box): Guide[] {
  const guides: Guide[] = [];

  const add = (box: Box) => {
    guides.push({ axis: 'x', at: box.x });
    guides.push({ axis: 'x', at: box.x + box.width / 2 });
    guides.push({ axis: 'x', at: box.x + box.width });
    guides.push({ axis: 'y', at: box.y });
    guides.push({ axis: 'y', at: box.y + box.height / 2 });
    guides.push({ axis: 'y', at: box.y + box.height });
  };

  for (const box of others) add(box);
  if (canvas) add(canvas);

  return guides;
}

/**
 * Pull a box onto the nearest guide, if one is close enough.
 *
 * The box's own three lines per axis are all candidates — a reader lining up
 * left edges and a reader centring two shapes are doing the same thing to
 * different lines — and the *closest* match on each axis wins independently, so
 * a box can snap horizontally without being dragged vertically.
 *
 * `within` is in model units and is the caller's, because what counts as "close
 * enough" depends on the zoom: eight screen pixels at half size is sixteen
 * slide pixels, and a threshold fixed in model units would feel sticky when
 * zoomed out and dead when zoomed in.
 */
export function snapBox(
  box: Box,
  guides: Guide[],
  within: number
): { box: Box; hit: Guide[] } {
  /**
   * Nothing to snap to is still a box the model can hold.
   *
   * Returning the box untouched here made one function keep two contracts: the
   * snapping path rounded and the early-out did not, so whether a fraction of a
   * twip reached the document depended on whether anything happened to be
   * nearby.
   */
  const whole = { ...box, x: Math.round(box.x), y: Math.round(box.y) };
  if (within <= 0 || guides.length === 0) return { box: whole, hit: [] };

  const edges = {
    x: [box.x, box.x + box.width / 2, box.x + box.width],
    y: [box.y, box.y + box.height / 2, box.y + box.height]
  };

  const best: { x?: { guide: Guide; shift: number }; y?: { guide: Guide; shift: number } } = {};

  for (const guide of guides) {
    for (const edge of edges[guide.axis]) {
      const shift = guide.at - edge;
      if (Math.abs(shift) > within) continue;

      const held = best[guide.axis];
      if (!held || Math.abs(shift) < Math.abs(held.shift)) {
        best[guide.axis] = { guide, shift };
      }
    }
  }

  const hit: Guide[] = [];
  if (best.x) hit.push(best.x.guide);
  if (best.y) hit.push(best.y.guide);

  return {
    box: {
      ...box,
      x: Math.round(box.x + (best.x?.shift ?? 0)),
      y: Math.round(box.y + (best.y?.shift ?? 0))
    },
    hit
  };
}

/**
 * Pull the edge a resize is dragging onto the nearest guide.
 *
 * The sibling of `snapBox`, and deliberately not the same function: a move
 * shifts the whole box, so snapping *any* of its six lines means adding one
 * offset to `x` and `y`. A resize holds the opposite edge still — that is what
 * makes it a resize — so only the lines the handle actually moves are
 * candidates, and pulling them changes the size rather than the position.
 *
 * Dragging the east handle onto a guide changes the width alone. Dragging the
 * west handle changes `x` *and* width together, by the same amount in opposite
 * directions, so the east edge does not move. That asymmetry is the whole
 * content of this function.
 *
 * ## The centre line is not a candidate
 *
 * `snapBox` snaps a box's middle as readily as its edges, because a reader
 * centring two shapes is doing the same thing as a reader lining up their left
 * edges. A resize is different: the middle moves as a *consequence* of the edge
 * moving, and snapping it would mean the edge lands somewhere the reader did
 * not put it in order to make the middle land somewhere they were not aiming
 * at.
 *
 * ## Modifiers win, and this is not called
 *
 * Holding a key for proportions or for resize-from-centre is a reader asking
 * for an exact relationship, and a snap is an inexact one. The two genuinely
 * fight — a snap that respects the aspect has to move the other axis, which
 * breaks the guide it just snapped to — so the caller does not snap while a
 * modifier is held. That is the honest resolution rather than a rule about
 * which wins by how much.
 */
export function snapResize(
  box: Box,
  handle: Handle,
  guides: Guide[],
  within: number
): { box: Box; hit: Guide[] } {
  const whole = {
    ...box,
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height)
  };
  if (handle === 'move' || within <= 0 || guides.length === 0) return { box: whole, hit: [] };

  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.startsWith('n');
  const south = handle.startsWith('s');

  /** The moving edge on each axis, or nothing when the handle does not move it. */
  const moving = {
    x: west ? box.x : east ? box.x + box.width : undefined,
    y: north ? box.y : south ? box.y + box.height : undefined
  };

  const best: { x?: { guide: Guide; shift: number }; y?: { guide: Guide; shift: number } } = {};

  for (const guide of guides) {
    const edge = moving[guide.axis];
    if (edge === undefined) continue;

    const shift = guide.at - edge;
    if (Math.abs(shift) > within) continue;

    const held = best[guide.axis];
    if (!held || Math.abs(shift) < Math.abs(held.shift)) {
      best[guide.axis] = { guide, shift };
    }
  }

  const hit: Guide[] = [];
  if (best.x) hit.push(best.x.guide);
  if (best.y) hit.push(best.y.guide);

  const dx = best.x?.shift ?? 0;
  const dy = best.y?.shift ?? 0;

  /**
   * A snap must never turn a box inside out.
   *
   * The guide nearest a dragged edge can sit past the opposite one when a box
   * has been pulled small, and a width of less than nothing is not a box the
   * model should hold. The snap is refused on that axis rather than clamped,
   * because a clamped snap lands on a line the reader cannot see.
   */
  const width = west ? box.width - dx : east ? box.width + dx : box.width;
  const height = north ? box.height - dy : south ? box.height + dy : box.height;

  const keepX = width >= 0;
  const keepY = height >= 0;

  return {
    box: {
      x: Math.round(west && keepX ? box.x + dx : box.x),
      y: Math.round(north && keepY ? box.y + dy : box.y),
      width: Math.round(keepX ? width : box.width),
      height: Math.round(keepY ? height : box.height)
    },
    hit: hit.filter((guide) => (guide.axis === 'x' ? keepX : keepY))
  };
}
