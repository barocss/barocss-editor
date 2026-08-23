import { describe, it, expect } from 'vitest';
import {
  arcPoints,
  readWaypoints,
  throughWaypoints,
  avoidArc,
  avoidCurve,
  connectorTrack,
  bendFromDrag,
  midHandleOf,
  hasOwnBend,
  pairKeyOf,
  separationBend,
  labelAt,
  labelBox,
  labelOf,
  nearestOnPath,
  pointOnPath,
  avoidObstacles,
  avoidStraight,
  flattenCurve,
  borderPoint,
  clusterBoxes,
  crossCount,
  crossesBox,
  pathLength,
  magnetPoints,
  nearestMagnet,
  connectorBoxOf,
  connectorCapsOf,
  connectorChanges,
  connectorSpecOf,
  capAngle,
  capDrawing,
  capInset,
  pulledBack,
  centreOf,
  connectorBounds,
  connectorPath,
  connectorPoints,
  curvePoints,
  elbowPoints,
  nearestSides,
  normalOf,
  resolveEnds,
  sidePoint,
  sideTowards,
  withEndPlaces,
  withoutMissing,
  type ConnectorBox,
  type ConnectorSpec,
  canBendByDrag,
  segmentCrossings,
  JUMP,
  CORNER,
  labelNear,
  endLabelOf,
  splineThrough,
  LABEL_INSET,
  LABEL_SIZE
} from '../src/canvas-connector';

/**
 * A line that remembers what it joins.
 *
 * Every rule here draws a **plausible** wrong picture when it is wrong — a straight
 * line that cuts through its own shape, a curve that balloons over the neighbours, a
 * clip on a rectangle where the shape is a circle. None of them throw and none of them
 * look like a fault in a screenshot, which is why they are all here and none of them
 * are in a browser.
 *
 * Twips: a 100×100pt box is 2000×2000.
 */
const box = (over: Partial<ConnectorBox> = {}): ConnectorBox => ({
  x: 0,
  y: 0,
  width: 2000,
  height: 1000,
  ...over
});

const spec = (over: Partial<ConnectorSpec> = {}): ConnectorSpec => ({
  start: { x: 0, y: 0, side: 'auto' },
  end: { x: 0, y: 0, side: 'auto' },
  kind: 'elbow',
  ...over
});

describe('a magnet', () => {
  it('is a side midpoint or the middle', () => {
    const shape = box();
    expect(sidePoint(shape, 'n')).toEqual({ x: 1000, y: 0 });
    expect(sidePoint(shape, 'e')).toEqual({ x: 2000, y: 500 });
    expect(sidePoint(shape, 's')).toEqual({ x: 1000, y: 1000 });
    expect(sidePoint(shape, 'w')).toEqual({ x: 0, y: 500 });
    expect(sidePoint(shape, 'c')).toEqual({ x: 1000, y: 500 });
    // `auto` is the centre until a pair is worked out — the honest answer for one end
    // on its own.
    expect(sidePoint(shape, 'auto')).toEqual(centreOf(shape));
  });

  it('turns with the shape', () => {
    // A quarter turn: the north magnet is where the east one was.
    const turned = sidePoint(box({ width: 1000, height: 1000, rotation: 90 }), 'n');
    expect(turned.x).toBeCloseTo(1000, 6);
    expect(turned.y).toBeCloseTo(500, 6);
  });

  it('leaves the middle where it is, whatever the rotation', () => {
    const shape = box({ rotation: 37 });
    expect(sidePoint(shape, 'c')).toEqual(centreOf(shape));
  });

  it('faces the way its side does, rotation included', () => {
    expect(normalOf('n')).toEqual({ x: 0, y: -1 });
    const turned = normalOf('n', 90);
    expect(turned.x).toBeCloseTo(1, 6);
    expect(turned.y).toBeCloseTo(0, 6);
    // The centre faces nowhere, and a caller decides what that means.
    expect(normalOf('c')).toEqual({ x: 0, y: 0 });
  });
});

describe('auto', () => {
  it('is the nearest pair of magnets', () => {
    // Side by side: east to west.
    expect(nearestSides(box(), box({ x: 5000 }))).toEqual(['e', 'w']);
    // One above the other: south to north.
    expect(nearestSides(box(), box({ y: 4000 }))).toEqual(['s', 'n']);
  });

  it('is not the angle between the centres', () => {
    /*
     * Barely to the right and mostly below. By angle this is "east", and the line
     * then leaves rightwards and runs back across the shape it came from; by nearest
     * magnet it is south to north, which is what a reader would draw.
     */
    expect(nearestSides(box(), box({ x: 300, y: 5000 }))).toEqual(['s', 'n']);
  });

  it('gives a free end the side that faces the other one', () => {
    expect(sideTowards({ x: 0, y: 0 }, { x: 900, y: 100 })).toBe('e');
    expect(sideTowards({ x: 0, y: 0 }, { x: -900, y: 100 })).toBe('w');
    expect(sideTowards({ x: 0, y: 0 }, { x: 100, y: 900 })).toBe('s');
    expect(sideTowards({ x: 0, y: 0 }, { x: 100, y: -900 })).toBe('n');
  });
});

describe('where a line leaves a shape', () => {
  it('leaves a rectangle on its edge', () => {
    const hit = borderPoint(box({ width: 2000, height: 2000 }), { x: 9000, y: 1000 });
    expect(hit).toEqual({ x: 2000, y: 1000 });
  });

  it('leaves an ellipse on the ellipse', () => {
    // Diagonally: a rectangle would stop at the corner (2000, 2000), which is outside
    // the circle — the line would visibly float off the shape.
    const circle = box({ width: 2000, height: 2000, outline: 'ellipse' });
    const hit = borderPoint(circle, { x: 9000, y: 9000 });
    const corner = Math.hypot(hit.x - 1000, hit.y - 1000);
    expect(corner).toBeCloseTo(1000, 6);
    expect(hit.x).toBeLessThan(2000);
  });

  it('leaves a diamond and a triangle on their edges', () => {
    const diamond = box({ width: 2000, height: 2000, outline: 'diamond' });
    // Straight right: the diamond's own point.
    expect(borderPoint(diamond, { x: 9000, y: 1000 })).toEqual({ x: 2000, y: 1000 });
    // Diagonally: halfway along the edge, well inside the rectangle's corner.
    const edge = borderPoint(diamond, { x: 9000, y: 9000 });
    expect(edge.x).toBeCloseTo(1500, 3);
    expect(edge.y).toBeCloseTo(1500, 3);

    const triangle = box({ width: 2000, height: 2000, outline: 'triangle' });
    expect(borderPoint(triangle, { x: 1000, y: 9000 })).toEqual({ x: 1000, y: 2000 });
  });

  it('leaves an outline it does not know as a rectangle', () => {
    const odd = box({ width: 2000, height: 2000, outline: 'sunburst' });
    expect(borderPoint(odd, { x: 9000, y: 1000 })).toEqual({ x: 2000, y: 1000 });
  });

  it('leaves a rotated shape on its rotated edge', () => {
    // A square turned 45° is a diamond: straight right is now its corner.
    const turned = box({ width: 2000, height: 2000, rotation: 45 });
    const hit = borderPoint(turned, { x: 9000, y: 1000 });
    expect(hit.y).toBeCloseTo(1000, 3);
    expect(hit.x).toBeCloseTo(1000 + Math.SQRT2 * 1000, 0);
  });

  it('has nowhere to leave from at the centre', () => {
    const shape = box();
    expect(borderPoint(shape, centreOf(shape))).toEqual(centreOf(shape));
  });
});

describe('the two ends of a straight line', () => {
  it('join the centres and clip at the outline', () => {
    /*
     * The rule §8.3 is about: drawn to the side midpoints, this line would leave at
     * (2000, 500) and arrive at (5000, 2500) — cutting visibly through both shapes,
     * because they are offset. Centre to centre, clipped, is what a reader draws.
     */
    const a = box({ width: 2000, height: 1000 });
    const b = box({ x: 5000, y: 2000, width: 2000, height: 1000 });
    const ends = resolveEnds(spec({ kind: 'straight' }), { start: a, end: b });

    expect(ends.startSide).toBe('c');
    expect(ends.start.x).toBe(2000); // out through the east edge
    expect(ends.start.y).toBeGreaterThan(500); // and below its midpoint, towards b
    expect(ends.end.x).toBe(5000);
    expect(ends.end.y).toBeLessThan(2500);
  });

  it('keeps a magnet the reader chose', () => {
    // Chosen means chosen: a straight line from the north side leaves the north side,
    // even though centre-to-centre would look tidier.
    const ends = resolveEnds(
      spec({ kind: 'straight', start: { x: 0, y: 0, side: 'n' } }),
      { start: box(), end: box({ x: 5000 }) }
    );
    expect(ends.startSide).toBe('n');
    expect(ends.start).toEqual({ x: 1000, y: 0 });
  });
});

describe('an elbow', () => {
  const ends = (sa: 'n' | 'e' | 's' | 'w', sb: 'n' | 'e' | 's' | 'w') =>
    resolveEnds(spec({ start: { x: 0, y: 0, side: sa }, end: { x: 0, y: 0, side: sb } }), {
      start: box({ width: 2000, height: 1000 }),
      end: box({ x: 6000, y: 3000, width: 2000, height: 1000 })
    });

  it('bends twice at the middle when both sides face the same axis', () => {
    const points = elbowPoints(ends('e', 'w'));
    expect(points).toHaveLength(4);
    // Out east, across at the midpoint, then in from the west.
    expect(points[1].x).toBe(points[2].x);
    expect(points[1].y).toBe(points[0].y);
    expect(points[3].y).toBe(points[2].y);
  });

  it('slides that middle with the bend, which is how two lines are told apart', () => {
    const straightOn = elbowPoints(ends('e', 'w'));
    const pushed = elbowPoints(ends('e', 'w'), 600);
    expect(pushed[1].x - straightOn[1].x).toBe(600);
    expect(pushed[0]).toEqual(straightOn[0]);
    expect(pushed[3]).toEqual(straightOn[3]);
  });

  it('bends once when the sides face different axes, and ignores the bend', () => {
    const points = elbowPoints(ends('e', 'n'));
    expect(points).toHaveLength(3);
    // The one corner there is; a bend applied here would pull the line off a magnet.
    expect(elbowPoints(ends('e', 'n'), 900)).toEqual(points);
  });
});

describe('a curve', () => {
  const stacked = resolveEnds(
    spec({ kind: 'curve', start: { x: 0, y: 0, side: 's' }, end: { x: 0, y: 0, side: 'n' } }),
    {
      start: box({ width: 2000, height: 1000 }),
      end: box({ x: 0, y: 3000, width: 2000, height: 1000 })
    }
  );

  it('pulls each handle along the side it leaves', () => {
    const points = curvePoints(stacked);
    expect(points).toHaveLength(4);
    // South then north: the handles go down and up, and neither goes sideways.
    expect(points[1].y).toBeGreaterThan(points[0].y);
    expect(points[2].y).toBeLessThan(points[3].y);
    expect(points[1].x).toBeCloseTo(points[0].x, 6);
  });

  it('measures the handle along the normal, not between the ends', () => {
    /*
     * Two boxes one above the other and far apart sideways. The straight-line distance
     * is huge and the distance *along the normal* is small: measuring the wrong one
     * balloons the curve out over whatever is beside them.
     */
    const offset = resolveEnds(
      spec({ kind: 'curve', start: { x: 0, y: 0, side: 's' }, end: { x: 0, y: 0, side: 'n' } }),
      {
        start: box({ width: 2000, height: 1000 }),
        end: box({ x: 40000, y: 2000, width: 2000, height: 1000 })
      }
    );
    const points = curvePoints(offset);
    const reach = points[1].y - points[0].y;
    const across = Math.abs(points[3].x - points[0].x);
    expect(reach).toBeLessThan(across / 4);
  });

  it('keeps the handle between a kink and a balloon', () => {
    const touching = resolveEnds(
      spec({ kind: 'curve', start: { x: 0, y: 0, side: 's' }, end: { x: 0, y: 0, side: 'n' } }),
      {
        start: box({ width: 2000, height: 1000 }),
        end: box({ x: 0, y: 1000, width: 2000, height: 1000 })
      }
    );
    // Touching boxes still get a handle long enough to read as a curve.
    expect(curvePoints(touching)[1].y - curvePoints(touching)[0].y).toBe(420);

    const miles = resolveEnds(
      spec({ kind: 'curve', start: { x: 0, y: 0, side: 's' }, end: { x: 0, y: 0, side: 'n' } }),
      {
        start: box({ width: 2000, height: 1000 }),
        end: box({ x: 0, y: 900000, width: 2000, height: 1000 })
      }
    );
    expect(curvePoints(miles)[1].y - curvePoints(miles)[0].y).toBe(2850);
  });

  it('bows across the line rather than along it', () => {
    const straightOn = curvePoints(stacked);
    const bowed = curvePoints(stacked, 800);
    // Stacked boxes: the bow is sideways, so the handles move in x and the ends do not
    // move at all.
    expect(bowed[1].x - straightOn[1].x).not.toBe(0);
    expect(bowed[0]).toEqual(straightOn[0]);
    expect(bowed[3]).toEqual(straightOn[3]);
  });
});

describe('the route, and the path it draws', () => {
  const boxes = {
    start: box({ width: 2000, height: 1000 }),
    end: box({ x: 6000, y: 0, width: 2000, height: 1000 })
  };

  it('is two points for a straight line', () => {
    expect(connectorPoints(spec({ kind: 'straight' }), boxes)).toHaveLength(2);
  });

  it('draws an elbow as segments and a curve as one cubic', () => {
    const elbow = connectorPoints(spec({ kind: 'elbow' }), boxes);
    expect(connectorPath(elbow, 'elbow')).toMatch(/^M .* L .* L .* L /);

    const curve = connectorPoints(spec({ kind: 'curve' }), boxes);
    expect(connectorPath(curve, 'curve')).toMatch(/^M [\d -]+ C /);
  });

  it('draws nothing from one point', () => {
    expect(connectorPath([{ x: 0, y: 0 }], 'straight')).toBe('');
    expect(connectorPath([], 'curve')).toBe('');
  });

  it('follows the shapes when they move', () => {
    const before = connectorPoints(spec(), boxes);
    const after = connectorPoints(spec(), { ...boxes, end: box({ x: 6000, y: 9000 }) });
    expect(after[after.length - 1]).not.toEqual(before[before.length - 1]);
  });

  it('uses an end’s own place when it holds nothing', () => {
    const free = spec({ kind: 'straight', end: { x: 7000, y: 4000, side: 'auto' } });
    const points = connectorPoints(free, { start: boxes.start });
    expect(points[1]).toEqual({ x: 7000, y: 4000 });
  });
});

describe('the box the drawing needs', () => {
  it('wraps the route with room for the line and its ends', () => {
    const bounds = connectorBounds([{ x: 100, y: 200 }, { x: 900, y: 600 }], 60);
    expect(bounds).toEqual({ x: 40, y: 140, width: 920, height: 520 });
  });

  it('is never flat, because an SVG of no height draws nothing', () => {
    const flat = connectorBounds([{ x: 0, y: 500 }, { x: 900, y: 500 }]);
    expect(flat.height).toBe(1);
    expect(flat.width).toBe(900);
  });

  it('has nothing to wrap around no points', () => {
    expect(connectorBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('when a shape it held is deleted', () => {
  it('drops the hold and keeps the place', () => {
    const held = spec({
      start: { nodeId: 'a', x: 1000, y: 500, side: 'e' },
      end: { nodeId: 'b', x: 6000, y: 500, side: 'w' }
    });
    const after = withoutMissing(held, (id) => id === 'a');

    expect(after.start.nodeId).toBe('a');
    expect(after.end.nodeId).toBeUndefined();
    // The line stays where it was: a diagram that quietly dropped a line is one a
    // reader cannot see the hole in.
    expect(after.end.x).toBe(6000);
    expect(after.end.side).toBe('w');
  });

  it('writes the ends’ places back, so there is a place to keep', () => {
    const boxes = { start: box(), end: box({ x: 6000 }) };
    const held = spec({
      start: { nodeId: 'a', x: 0, y: 0, side: 'e' },
      end: { nodeId: 'b', x: 0, y: 0, side: 'w' }
    });
    const written = withEndPlaces(held, resolveEnds(held, boxes));

    expect(written.start).toEqual({ nodeId: 'a', x: 2000, y: 500, side: 'e' });
    expect(written.end).toEqual({ nodeId: 'b', x: 6000, y: 500, side: 'w' });
  });
});

describe('the shape at the end of the line', () => {
  const tip = { x: 1000, y: 1000 };

  it('draws nothing for none, and nothing at no size', () => {
    expect(capDrawing('none', tip, 0, 200)).toBeNull();
    expect(capDrawing('arrow', tip, 0, 0)).toBeNull();
  });

  it('points the way the line arrives', () => {
    // Arriving from the west: the head's back is to the left of its tip.
    const east = capDrawing('triangle', tip, 0, 300)!;
    expect(east.shape).toBe('path');
    const numbers = (east as { d: string }).d.match(/-?\d+/g)!.map(Number);
    expect(numbers[0]).toBe(1000); // the tip itself
    expect(numbers[2]).toBe(700); // and the base, 300 back
  });

  it('keeps hollow and open unfilled, because that is the meaning', () => {
    // UML: a filled triangle is not inheritance and a filled diamond is not
    // aggregation. This is a symbol, not a style.
    expect(capDrawing('hollow', tip, 0, 300)!.filled).toBe(false);
    expect(capDrawing('open', tip, 0, 300)!.filled).toBe(false);
    expect(capDrawing('triangle', tip, 0, 300)!.filled).toBe(true);
    expect(capDrawing('diamond', tip, 0, 300)!.filled).toBe(true);
  });

  it('draws a circle as a circle, sitting behind the tip', () => {
    const dot = capDrawing('circle', tip, 0, 300)!;
    expect(dot).toEqual({ shape: 'circle', cx: 850, cy: 1000, r: 150, filled: true });
  });

  it('draws a cross as two strokes through the end', () => {
    // "Blocked", "not this way", "no" — the one people otherwise draw by deleting the
    // arrow, which loses the fact that the relationship exists and is refused.
    const cross = capDrawing('cross', tip, 0, 300)! as { d: string; filled: boolean };
    expect(cross.filled).toBe(false);
    expect((cross.d.match(/M /g) ?? []).length).toBe(2);
    // Centred on the line rather than hanging off it: the line is not trimmed for it.
    expect(capInset('cross', 300)).toBe(0);
  });

  it('draws a bar across the end rather than pointing at it', () => {
    const bar = capDrawing('bar', tip, 0, 300)! as { d: string };
    // Straight across: both points share the tip's x.
    const numbers = bar.d.match(/-?\d+/g)!.map(Number);
    expect(numbers[0]).toBe(1000);
    expect(numbers[2]).toBe(1000);
    expect(numbers[1]).not.toBe(numbers[3]);
  });

  it('takes its angle from the last segment, not from the far end', () => {
    /*
     * An elbow arrives along its final leg. Turned to face the far end instead, the
     * cap sits across the line — which is what makes a hand-written arrowhead look
     * broken on exactly the routes that need one.
     */
    const elbow = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 900 }
    ];
    // Arriving downwards: 90°.
    expect(capAngle(elbow, 'end')).toBeCloseTo(Math.PI / 2, 6);
    // And the start looks back up its own first leg, which points west.
    expect(capAngle(elbow, 'start')).toBeCloseTo(Math.PI, 6);
  });

  it('has no angle to take from one point', () => {
    expect(capAngle([{ x: 0, y: 0 }], 'end')).toBe(0);
  });

  it('stops the line short of a filled cap and not of a bar', () => {
    expect(capInset('triangle', 300)).toBe(216);
    expect(capInset('circle', 300)).toBe(300);
    // A bar and an open arrow sit *on* the end: a gap there is a broken line.
    expect(capInset('bar', 300)).toBe(0);
    expect(capInset('open', 300)).toBe(0);
    expect(capInset('none', 300)).toBe(0);
  });

  it('pulls an end back along its own segment', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 }
    ];
    expect(pulledBack(points, 'end', 200)[1]).toEqual({ x: 800, y: 0 });
    expect(pulledBack(points, 'start', 200)[0]).toEqual({ x: 200, y: 0 });
    // Never past the other end: a cap longer than the line leaves the line alone.
    expect(pulledBack(points, 'end', 4000)).toEqual(points);
    expect(pulledBack(points, 'end', 0)).toEqual(points);
  });
});

describe('what a document says about a connector', () => {
  it('reads the two ends, the route and the bow', () => {
    const spec = connectorSpecOf({
      attributes: {
        startNodeId: 'a',
        startX: 100,
        startY: 200,
        startSide: 'e',
        endNodeId: 'b',
        endX: 900,
        endY: 800,
        endSide: 'w',
        kind: 'curve',
        bend: -300
      }
    });
    expect(spec.start).toEqual({ nodeId: 'a', x: 100, y: 200, side: 'e' });
    expect(spec.end).toEqual({ nodeId: 'b', x: 900, y: 800, side: 'w' });
    expect(spec.kind).toBe('curve');
    expect(spec.bend).toBe(-300);
  });

  it('falls back rather than passing a value the schema does not declare', () => {
    // A document is a file anybody can write, and a `kind` of "wibble" should draw a
    // line rather than nothing at all.
    const spec = connectorSpecOf({ attributes: { kind: 'wibble', startSide: 'up' } });
    expect(spec.kind).toBe('elbow');
    expect(spec.start.side).toBe('auto');
    expect(connectorCapsOf({ attributes: { endCap: 'spike' } }).end).toBe('arrow');
  });

  it('says nothing about an end that holds nothing', () => {
    expect(connectorSpecOf({ attributes: {} }).start.nodeId).toBeUndefined();
    expect(connectorSpecOf(undefined).kind).toBe('elbow');
  });

  it('takes an ellipse’s outline from what it is, not from an attribute', () => {
    expect(connectorBoxOf({ stype: 'ellipse', attributes: { width: 100, height: 100 } })!.outline).toBe(
      'ellipse'
    );
    expect(connectorBoxOf({ stype: 'rectangle', attributes: { width: 100, height: 100 } })!.outline).toBe(
      'rect'
    );
  });

  it('normalises a box that runs backwards', () => {
    // A negative width is how a line says it runs right to left.
    expect(connectorBoxOf({ attributes: { x: 900, y: 0, width: -400, height: 200 } })).toMatchObject({
      x: 500,
      width: 400
    });
  });

  it('has no box for a node with no size', () => {
    expect(connectorBoxOf({ attributes: {} })).toBeUndefined();
    expect(connectorBoxOf(undefined)).toBeUndefined();
  });
});

describe('keeping a connector in step', () => {
  const nodes: Record<string, { stype: string; attributes: Record<string, unknown> }> = {
    a: { stype: 'rectangle', attributes: { x: 0, y: 0, width: 2000, height: 1000 } },
    b: { stype: 'rectangle', attributes: { x: 6000, y: 0, width: 2000, height: 1000 } }
  };
  const look = (id: string) => nodes[id];
  /**
   * The boxes come from the caller now, already in the connector's coordinate space —
   * see the note on `connectorChanges`. Here they are the shapes' own, because nothing
   * in this fixture is inside a container.
   */
  const shapes = {
    a: connectorBoxOf(nodes.a as never),
    b: connectorBoxOf(nodes.b as never)
  };

  it('writes the ends’ places when the shapes have moved', () => {
    const connector = {
      stype: 'connector',
      attributes: {
        startNodeId: 'a',
        endNodeId: 'b',
        startSide: 'e',
        endSide: 'w',
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0
      }
    };
    expect(
      connectorChanges(
        connector,
        { boxes: { start: shapes.a as never, end: shapes.b as never } },
        (id) => !!look(id)
      )
    ).toEqual({ startX: 2000, startY: 500, endX: 6000, endY: 500 });
  });

  it('answers with nothing when it already agrees', () => {
    /*
     * The property a reaction depends on: run against a document that already agrees,
     * this returns nothing, so there is nothing to commit and the second pass finds
     * nothing to do. The alternative — a flag saying "this change was mine" — has to
     * be cleared, and a cleared flag is a race.
     */
    const settled = {
      stype: 'connector',
      attributes: {
        startNodeId: 'a',
        endNodeId: 'b',
        startSide: 'e',
        endSide: 'w',
        startX: 2000,
        startY: 500,
        endX: 6000,
        endY: 500
      }
    };
    expect(
      connectorChanges(
        settled,
        { boxes: { start: shapes.a as never, end: shapes.b as never } },
        (id) => !!look(id)
      )
    ).toEqual({});
  });

  it('releases an end whose shape is gone and leaves the line where it was', () => {
    const orphaned = {
      stype: 'connector',
      attributes: {
        startNodeId: 'a',
        endNodeId: 'gone',
        startSide: 'e',
        endSide: 'w',
        startX: 2000,
        startY: 500,
        endX: 6000,
        endY: 500
      }
    };
    // The hold is dropped — as `null`, which *removes* the attribute (`setAttrs`) —
    // and the place is untouched. Not `''`: a blank is not a value, and every reader of
    // `endNodeId` would have to learn that an empty string means "holds nothing".
    expect(
      connectorChanges(
        orphaned,
        { boxes: { start: shapes.a as never, end: undefined } },
        (id) => !!look(id)
      )
    ).toEqual({ endNodeId: null });
  });
});

describe('picking a magnet with a pointer', () => {
  const shape = box({ width: 2000, height: 1000 });

  it('offers the four sides and the middle', () => {
    // The five dots Canva draws on a shape when a line is being pulled out of it.
    expect(magnetPoints(shape).map((magnet) => magnet.side)).toEqual(['n', 'e', 's', 'w', 'c']);
    expect(magnetPoints(shape)[1].point).toEqual({ x: 2000, y: 500 });
  });

  it('takes the one under the pointer', () => {
    expect(nearestMagnet(shape, { x: 2010, y: 505 })).toBe('e');
    expect(nearestMagnet(shape, { x: 1000, y: 10 })).toBe('n');
    expect(nearestMagnet(shape, { x: 1000, y: 500 })).toBe('c');
  });

  it('answers nothing when the pointer is near none of them', () => {
    /*
     * Which is a real answer, not a failure: an end dropped inside a shape but away
     * from every magnet means **auto** — attach it wherever looks best — and that is
     * the commonest thing a reader wants. Snapping regardless would make every drop a
     * choice they did not make.
     */
    expect(nearestMagnet(shape, { x: 1600, y: 200 })).toBeNull();
    expect(nearestMagnet(shape, { x: 9000, y: 9000 })).toBeNull();
  });

  it('takes the snap from the caller, because a screen has a scale', () => {
    // A magnet is 8px away at 100% and 80 twips at 400%: the app knows the zoom and
    // this does not.
    expect(nearestMagnet(shape, { x: 1600, y: 200 }, 4000)).not.toBeNull();
  });

  it('finds the magnets of a rotated shape where they are drawn', () => {
    const turned = box({ width: 2000, height: 2000, rotation: 90 });
    // A quarter turn: the north magnet is where the east one was.
    expect(nearestMagnet(turned, { x: 2000, y: 1000 })).toBe('n');
  });
});

describe('going around what is in the way', () => {
  const wall = box({ x: 4000, y: 0, width: 1000, height: 4000 });

  it('knows a segment that passes through a shape', () => {
    expect(crossesBox({ x: 0, y: 2000 }, { x: 9000, y: 2000 }, wall)).toBe(true);
    expect(crossesBox({ x: 0, y: 9000 }, { x: 9000, y: 9000 }, wall)).toBe(false);
  });

  it('counts a segment that *starts* inside one', () => {
    // The edge test alone misses exactly the case where a line begins behind
    // something, which is the commonest way a route looks broken.
    expect(crossesBox({ x: 4500, y: 2000 }, { x: 9000, y: 2000 }, wall)).toBe(true);
  });

  it('counts every crossing of every obstacle along a route', () => {
    const route = [
      { x: 0, y: 2000 },
      { x: 9000, y: 2000 }
    ];
    expect(crossCount(route, [wall])).toBe(1);
    expect(crossCount(route, [wall, box({ x: 6000, y: 0, width: 500, height: 4000 })])).toBe(2);
    expect(crossCount(route, [])).toBe(0);
  });

  it('measures a route’s length so two clean ones can be compared', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 300, y: 400 }])).toBe(500);
    expect(pathLength([{ x: 0, y: 0 }])).toBe(0);
  });

  describe('clumps', () => {
    it('merges boxes that touch, because clearing one lands in the other', () => {
      const merged = clusterBoxes([
        box({ x: 0, y: 0, width: 1000, height: 1000 }),
        box({ x: 1100, y: 0, width: 1000, height: 1000 })
      ]);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toMatchObject({ x: 0, width: 2100 });
    });

    it('leaves boxes far apart alone, because the gap may be the way through', () => {
      expect(
        clusterBoxes([
          box({ x: 0, y: 0, width: 1000, height: 1000 }),
          box({ x: 9000, y: 0, width: 1000, height: 1000 })
        ])
      ).toHaveLength(2);
    });

    it('merges a chain of them, since absorbing one makes it reach further', () => {
      const merged = clusterBoxes([
        box({ x: 0, y: 0, width: 1000, height: 500 }),
        box({ x: 8000, y: 0, width: 1000, height: 500 }),
        box({ x: 1200, y: 0, width: 6600, height: 500 })
      ]);
      expect(merged).toHaveLength(1);
      expect(merged[0].width).toBe(9000);
    });

    it('covers every corner of a rotated shape', () => {
      // A clump is axis-aligned, so a turned box is taken as the box around it.
      const [merged] = clusterBoxes([box({ x: 0, y: 0, width: 2000, height: 0, rotation: 45 })]);
      expect(merged.height).toBeGreaterThan(1000);
    });
  });

  describe('an elbow that has to get past something', () => {
    const ends = (from: ConnectorBox, to: ConnectorBox) =>
      resolveEnds(
        spec({ start: { x: 0, y: 0, side: 'e' }, end: { x: 0, y: 0, side: 'w' } }),
        { start: from, end: to }
      );

    it('leaves a clear route alone', () => {
      const clear = ends(box({ width: 1000, height: 1000 }), box({ x: 8000, width: 1000, height: 1000 }));
      const base = elbowPoints(clear, 0);
      expect(avoidObstacles(base, clear, 0, [])).toBe(base);
      expect(avoidObstacles(base, clear, 0, [box({ x: 3000, y: 20000, width: 500, height: 500 })])).toBe(base);
    });

    it('gets past a wall between two shapes at the same height', () => {
      /*
       * The case pushing the bend cannot solve: both ends on the same line, so every
       * bend leaves a straight run through the wall. It takes a detour — out, along,
       * and back — which is why those candidates exist at all.
       */
      const level = ends(
        box({ x: 0, y: 1500, width: 1000, height: 1000 }),
        box({ x: 8000, y: 1500, width: 1000, height: 1000 })
      );
      const base = elbowPoints(level, 0);
      const blocked = [box({ x: 4000, y: 0, width: 1000, height: 4000 })];
      expect(crossCount(base, blocked)).toBeGreaterThan(0);

      const around = avoidObstacles(base, level, 0, blocked);
      expect(crossCount(around, blocked)).toBe(0);
      // And it still starts and ends where it did: a route that moved its own ends
      // would be a line attached somewhere the reader did not put it.
      expect(around[0]).toEqual(base[0]);
      expect(around[around.length - 1]).toEqual(base[base.length - 1]);
    });

    it('takes the shortest of the clean routes', () => {
      const level = ends(
        box({ x: 0, y: 1500, width: 1000, height: 1000 }),
        box({ x: 8000, y: 1500, width: 1000, height: 1000 })
      );
      const blocked = [box({ x: 4000, y: 1000, width: 1000, height: 1200 })];
      const around = avoidObstacles(elbowPoints(level, 0), level, 0, blocked);
      expect(crossCount(around, blocked)).toBe(0);
      /*
       * Below, because the ends are near the obstacle's bottom edge: the box runs from
       * 1000 to 2200 and the line is at 2000, so stepping down is a third of the
       * distance of stepping up. Chosen by **length**, and not by "fewer crossings" — a
       * count depends on how many segments a route has, so a route with fewer segments
       * can look better while being more blocked.
       *
       * (Written the other way round first, and the arithmetic was right: an obstacle
       * that *looks* higher than the line can still have its near edge below it.)
       */
      expect(Math.min(...around.map((point) => point.y))).toBeGreaterThanOrEqual(2000);
      expect(Math.max(...around.map((point) => point.y))).toBeGreaterThan(2200);
    });

    it('keeps the direct route when nothing can avoid the obstacle', () => {
      /*
       * A shape *inside* something else — a box drawn over a frame, say. Every route
       * starts inside the obstacle, and a segment that starts inside a box has already
       * crossed it, so no candidate can ever be clean.
       *
       * Keeping the direct line is the right answer rather than a shrug: a reader can
       * see a line passing over a shape and understand it, and cannot follow a line
       * that wanders across the slide. Every editor that routes gives up in the same
       * place.
       *
       * (A tall wall is *not* this case, which is worth knowing: a route around its top
       * edge crosses nothing and is chosen, however long it is. The give-up is about
       * routes that cannot be clean, not about routes that are silly.)
       */
      const level = ends(
        box({ x: 0, y: 1500, width: 1000, height: 1000 }),
        box({ x: 8000, y: 1500, width: 1000, height: 1000 })
      );
      const base = elbowPoints(level, 0);
      const over = [box({ x: -500, y: -500, width: 3000, height: 4000 })];
      expect(avoidObstacles(base, level, 0, over)).toBe(base);
    });
  });
});

describe('the other two routes, getting past something', () => {
  const from = box({ x: 0, y: 1500, width: 1000, height: 1000 });
  const to = box({ x: 8000, y: 1500, width: 1000, height: 1000 });
  /**
   * A bar between them, shorter than the shapes are tall.
   *
   * Deliberately: a straight line can only avoid something by leaving from a different
   * *side*, so an obstacle taller than the gap between the magnets is one no straight
   * line can dodge — and that is a give-up rather than a route. Written taller first,
   * and the arithmetic was right to keep the direct line.
   */
  const wall = box({ x: 4000, y: 1900, width: 800, height: 400 });

  it('moves a straight line to another magnet', () => {
    const free = spec({ kind: 'straight' });
    const ends = resolveEnds(free, { start: from, end: to });
    const around = avoidStraight(free, ends, { start: from, end: to }, [wall]);

    expect(crossCount(around, [wall])).toBe(0);
    // Two points still: a straight line that bent to avoid something would not be one.
    expect(around).toHaveLength(2);
  });

  it('leaves a magnet the reader chose where they put it', () => {
    // They said which side; a router overruling that is a control that does not work.
    const pinned = spec({
      kind: 'straight',
      start: { x: 0, y: 0, side: 'e' },
      end: { x: 0, y: 0, side: 'w' }
    });
    const ends = resolveEnds(pinned, { start: from, end: to });
    const around = avoidStraight(pinned, ends, { start: from, end: to }, [wall]);
    expect(around[0]).toEqual(ends.start);
    expect(around[1]).toEqual(ends.end);
  });

  it('bows a curve further rather than bending it', () => {
    const curved = spec({
      kind: 'curve',
      start: { x: 0, y: 0, side: 'e' },
      end: { x: 0, y: 0, side: 'w' }
    });
    const ends = resolveEnds(curved, { start: from, end: to });
    const around = avoidCurve(ends, 0, [wall]);

    expect(around).toHaveLength(4); // still one cubic
    expect(crossCount(flattenCurve(around), [wall])).toBe(0);
  });

  it('measures a curve by its shape rather than by its handles', () => {
    /*
     * A cubic's control points are usually well off the curve, so counting crossings
     * against them reports obstacles the curve misses and misses ones it hits.
     */
    const flat = flattenCurve([
      { x: 0, y: 0 },
      { x: 0, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 0 }
    ]);
    expect(flat.length).toBeGreaterThan(4);
    // The middle of that curve is below both ends and above its handles.
    expect(Math.max(...flat.map((point) => point.y))).toBeGreaterThan(700);
    expect(Math.max(...flat.map((point) => point.y))).toBeLessThan(1000);
    // Anything that is not a cubic is returned as it is.
    expect(flattenCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toHaveLength(2);
  });

  it('is what `connectorPoints` applies, per route', () => {
    const boxes = { start: from, end: to };
    for (const kind of ['straight', 'elbow', 'curve'] as const) {
      const route = connectorPoints(spec({ kind }), boxes, [wall]);
      const measured = kind === 'curve' ? flattenCurve(route) : route;
      expect(crossCount(measured, [wall])).toBe(0);
    }
  });
});

describe('a line attached to a line', () => {
  /** An elbow whose first leg is twice its second, so length and corners disagree. */
  const uneven = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 2000 }
  ];

  it('finds a point by length, not by corner', () => {
    /*
     * The whole route is 6000 long, so halfway is 3000 along the first leg — not the
     * corner, which is where "the middle point of three" would put it. A reader
     * dropping a line halfway along means the halfway they can see.
     */
    expect(pointOnPath(uneven, 0.5)).toEqual({ x: 3000, y: 0 });
    expect(pointOnPath(uneven, 0)).toEqual({ x: 0, y: 0 });
    expect(pointOnPath(uneven, 1)).toEqual({ x: 4000, y: 2000 });
  });

  it('clamps a fraction outside the line, and answers for a line with no length', () => {
    expect(pointOnPath(uneven, -1)).toEqual({ x: 0, y: 0 });
    expect(pointOnPath(uneven, 9)).toEqual({ x: 4000, y: 2000 });
    expect(pointOnPath([{ x: 5, y: 5 }], 0.5)).toEqual({ x: 5, y: 5 });
    expect(pointOnPath([], 0.5)).toEqual({ x: 0, y: 0 });
  });

  it('finds the place on the line nearest a drop, and how far along it is', () => {
    // Aimed above the first leg: it lands on the leg, a third of the way along.
    const near = nearestOnPath(uneven, { x: 2000, y: 600 });
    expect(near.point).toEqual({ x: 2000, y: 0 });
    expect(near.t).toBeCloseTo(1 / 3, 6);
    expect(near.distance).toBe(600);
  });

  it('pushes a drop beyond either end onto that end', () => {
    expect(nearestOnPath(uneven, { x: -900, y: -900 }).t).toBe(0);
    expect(nearestOnPath(uneven, { x: 9000, y: 9000 }).t).toBe(1);
  });

  it('starts the line at the point on the other line, not in the middle of its box', () => {
    /*
     * The reason an end held by a line is handed in as a **point**: a connector's box
     * is the rectangle around its route, and attaching to the box would put the
     * arrowhead in empty space beside the line it is meant to touch.
     */
    const branch = spec({
      kind: 'straight',
      start: { nodeId: 'flow', x: 0, y: 0, side: 'auto', t: 0.5 },
      end: { x: 8000, y: 6000, side: 'auto' }
    });
    const at = pointOnPath(uneven, 0.5);
    const points = connectorPoints(branch, {}, [], { start: at });
    expect(points[0]).toEqual(at);
  });
});

describe('a word on the line', () => {
  it('has no pill without a label', () => {
    expect(labelBox('')).toEqual({ width: 0, height: 0 });
    expect(labelBox('   ')).toEqual({ width: 0, height: 0 });
  });

  it('gives a Korean label more room than a Latin one', () => {
    /*
     * The rule that matters: a CJK character is about as wide as the type is tall and a
     * Latin one is a little over half. The other way round makes a Korean label hang out
     * of its own pill, which is the commonest way this looks broken.
     */
    expect(labelBox('예예예').width).toBeGreaterThan(labelBox('abc').width);
  });

  it('is taller than the type and wider than the words', () => {
    const pill = labelBox('yes');
    expect(pill.height).toBeGreaterThan(195);
    expect(pill.width).toBeGreaterThan(3 * 195 * 0.55);
  });

  it('reads a label and cuts it to a word’s worth', () => {
    expect(labelOf({ attributes: { label: '  참  ' } })).toBe('참');
    expect(labelOf({ attributes: {} })).toBe('');
    expect(labelOf(undefined)).toBe('');
    expect(labelOf({ attributes: { label: 42 } })).toBe('');

    // A line carries a word, not a paragraph — and it ends in an ellipsis, because a
    // label that stops mid-word looks like a fault rather than a limit.
    const long = labelOf({ attributes: { label: 'x'.repeat(60) } });
    expect(long).toHaveLength(24);
    expect(long.endsWith('…')).toBe(true);
  });

  it('sits at the middle of the route by length', () => {
    // Not on the corner: a label parked there reads as belonging to neither half.
    expect(labelAt([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }])).toEqual({
      x: 3000,
      y: 0
    });
  });
});

describe('two lines between the same pair', () => {
  it('leaves one line alone', () => {
    // A single line between two shapes must be straight: a bow with nothing to be
    // separated from is a line that looks like it is avoiding something.
    expect(separationBend(0, 1)).toBe(0);
  });

  it('fans them either side of where one would have been', () => {
    /*
     * Symmetric, and the cost is that adding a third moves the first two — which is
     * the right kind of visible. Leaving the first where it is and pushing each new one
     * aside would make the first look like the *main* line, which is a claim about the
     * diagram nobody made.
     */
    expect(separationBend(0, 2)).toBe(-240);
    expect(separationBend(1, 2)).toBe(240);

    expect(separationBend(0, 3)).toBe(-480);
    expect(separationBend(1, 3)).toBe(0);
    expect(separationBend(2, 3)).toBe(480);
  });

  it('answers nothing for an index outside the count', () => {
    expect(separationBend(3, 2)).toBe(0);
    expect(separationBend(-1, 4)).toBe(0);
  });

  it('knows when the reader has said, so their bow is not overruled', () => {
    expect(hasOwnBend({ attributes: { bend: 900 } })).toBe(true);
    expect(hasOwnBend({ attributes: { bend: 0 } })).toBe(false);
    expect(hasOwnBend({ attributes: {} })).toBe(false);
    expect(hasOwnBend(undefined)).toBe(false);
  });

  it('names a pair the same way round either way', () => {
    // A→B and B→A are both "between these two", and two lines drawn on top of each
    // other are the same problem whichever way each points.
    const one = spec({ start: { nodeId: 'a', x: 0, y: 0, side: 'auto' }, end: { nodeId: 'b', x: 0, y: 0, side: 'auto' } });
    const other = spec({ start: { nodeId: 'b', x: 0, y: 0, side: 'auto' }, end: { nodeId: 'a', x: 0, y: 0, side: 'auto' } });
    expect(pairKeyOf(one)).toBe(pairKeyOf(other));
    // A free end is in no pair: there is nothing for it to be one of.
    expect(pairKeyOf(spec({ start: { nodeId: 'a', x: 0, y: 0, side: 'auto' } }))).toBeUndefined();
  });
});

describe('the handle in the middle of a line', () => {
  const elbow = [
    { x: 0, y: 0 },
    { x: 2000, y: 0 },
    { x: 2000, y: 4000 },
    { x: 5000, y: 4000 }
  ];

  it('sits on the segment the bow moves, not at the middle by length', () => {
    // The label's middle is by length (`pointOnPath`); a handle has to be on the part
    // of the line a drag can actually move.
    expect(midHandleOf(elbow, 'elbow')).toEqual({ x: 2000, y: 2000 });
    // One corner: that corner is the handle, and there is nothing to slide.
    expect(midHandleOf([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 90 }], 'elbow')).toEqual({
      x: 100,
      y: 0
    });
    expect(midHandleOf([{ x: 0, y: 0 }, { x: 400, y: 200 }], 'straight')).toEqual({ x: 200, y: 100 });
  });

  it('takes a curve’s real midpoint, not the average of its ends', () => {
    /*
     * A cubic's midpoint is `(p0 + 3c1 + 3c2 + p3) / 8`: its handles pull it away from
     * halfway between the ends, so a grip drawn there floats off the line.
     */
    const curve = [
      { x: 0, y: 0 },
      { x: 0, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 0 }
    ];
    const middle = midHandleOf(curve, 'curve');
    expect(middle).toEqual({ x: 2000, y: 2250 });
    expect(middle.y).toBeGreaterThan(0);
  });

  it('reads a drag as a slide along the one axis that moves', () => {
    /*
     * A reader pulls the handle wherever they like and only one axis of that can change
     * anything. The rest is dropped rather than turned into something the route cannot
     * express — this elbow leaves sideways, so its middle slides in x and the y of the
     * drag is not a bow.
     */
    expect(bendFromDrag(elbow, 'elbow', { x: 3200, y: 2000 })).toBe(1200);
    expect(bendFromDrag(elbow, 'elbow', { x: 2000, y: 9000 })).toBe(0);
    // Added to the bow it already had, because the handle is drawn where that bow put it.
    expect(bendFromDrag(elbow, 'elbow', { x: 3200, y: 2000 }, 500)).toBe(1700);
  });

  it('has nothing to answer for an elbow with a single corner', () => {
    const oneCorner = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 900 }];
    expect(bendFromDrag(oneCorner, 'elbow', { x: 5000, y: 5000 }, 300)).toBe(300);
  });

  it('reads a curve’s drag across the line between its ends', () => {
    const curve = [
      { x: 0, y: 0 },
      { x: 0, y: 2000 },
      { x: 4000, y: 2000 },
      { x: 4000, y: 0 }
    ];
    // Ends level, so the bow is vertical: dragging down bows down.
    const down = bendFromDrag(curve, 'curve', { x: 2000, y: 3500 });
    expect(down).toBeGreaterThan(0);
    // And along the line between the ends changes nothing.
    expect(bendFromDrag(curve, 'curve', { x: 9000, y: midHandleOf(curve, 'curve').y })).toBe(0);
  });
});

describe('the corners of an elbow', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 3000 },
    { x: 6000, y: 3000 }
  ];

  it('rounds them, because a hard angle reads badly against rounded shapes', () => {
    const d = connectorPath(square, 'elbow');
    // Into the corner, round it with the corner as the control point, out again.
    expect(d).toMatch(/^M 0 0 L 2850 0 Q 3000 0 3000 150 L 3000 2850 Q 3000 3000 3150 3000 L 6000 3000$/);
  });

  it('shrinks the radius so two corners cannot eat into each other', () => {
    // A middle leg of 200 twips: half of it, or the corners would meet in a kink that
    // reads as a mistake rather than as a curve.
    const tight = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 200 },
      { x: 6000, y: 200 }
    ];
    const d = connectorPath(tight, 'elbow');
    expect(d).toContain('L 3000 100 Q');
  });

  it('draws square angles when asked, for a route being measured rather than drawn', () => {
    expect(connectorPath(square, 'elbow', 0)).toBe('M 0 0 L 3000 0 L 3000 3000 L 6000 3000');
  });

  it('has no corner to round in a straight line', () => {
    expect(connectorPath([{ x: 0, y: 0 }, { x: 900, y: 0 }], 'straight')).toBe('M 0 0 L 900 0');
  });

  it('draws an arc as one quadratic', () => {
    // Three points and `curve` is an arc: one control point between the two ends.
    expect(connectorPath([{ x: 0, y: 0 }, { x: 500, y: 900 }, { x: 1000, y: 0 }], 'curve')).toBe(
      'M 0 0 Q 500 900 1000 0'
    );
  });
});

describe('an arc — the route with no magnets', () => {
  const from = box({ x: 0, y: 0, width: 2000, height: 2000 });
  const to = box({ x: 8000, y: 5000, width: 2000, height: 2000 });
  const ends = { start: { x: 1000, y: 1000 }, end: { x: 9000, y: 6000 } };

  it('places its control point out to one side and clips the ends towards it', () => {
    const points = arcPoints({ start: from, end: to }, ends);
    expect(points).toHaveLength(3);

    // Both ends are outside their shapes rather than at a magnet, and the line points
    // at each centre through the control point — which is what makes it work on a
    // rotated shape.
    const [start, control, finish] = points;
    expect(start).not.toEqual(sidePoint(from, 'e'));
    expect(Math.hypot(control.x - 4500, control.y - 3000)).toBeGreaterThan(300);
    expect(finish.x).toBeLessThan(9000);
  });

  it('draws straight when the two shapes are lined up', () => {
    /*
     * A diagram laid out on a grid with faintly bent lines looks untidy rather than
     * organic — so within four degrees of an axis, and with no bow asked for, an arc is
     * two points.
     */
    const level = arcPoints(
      { start: box({ width: 2000, height: 2000 }), end: box({ x: 9000, width: 2000, height: 2000 }) },
      { start: { x: 1000, y: 1000 }, end: { x: 10000, y: 1000 } }
    );
    expect(level).toHaveLength(2);
  });

  it('bows more the further apart they are', () => {
    const near = arcPoints(
      { start: box({ width: 1000, height: 1000 }), end: box({ x: 2000, y: 1500, width: 1000, height: 1000 }) },
      { start: { x: 500, y: 500 }, end: { x: 2500, y: 2000 } }
    );
    const far = arcPoints(
      { start: box({ width: 1000, height: 1000 }), end: box({ x: 20000, y: 15000, width: 1000, height: 1000 }) },
      { start: { x: 500, y: 500 }, end: { x: 20500, y: 15500 } }
    );
    const bowOf = (points: ReturnType<typeof arcPoints>) => {
      const [a, c, b] = points;
      return Math.hypot(c.x - (a.x + b.x) / 2, c.y - (a.y + b.y) / 2);
    };
    expect(bowOf(far)).toBeGreaterThan(bowOf(near));
  });

  it('stands off the shape, so a cap does not look blunt', () => {
    // A tip exactly on the border is drawn *into* it.
    const [start] = arcPoints({ start: from, end: to }, ends);
    const inside = borderPoint(from, { x: 9000, y: 6000 });
    expect(Math.hypot(start.x - inside.x, start.y - inside.y)).toBeGreaterThan(0);
  });

  it('leaves a free end where it is', () => {
    const points = arcPoints({ start: from }, ends);
    expect(points[points.length - 1]).toEqual(ends.end);
  });

  it('bows further to get past something, rather than bending', () => {
    const wall = box({ x: 4000, y: 2000, width: 800, height: 2000 });
    const around = avoidArc({ start: from, end: to }, ends, 0, [wall]);
    expect(crossCount(connectorTrack(around, 'arc'), [wall])).toBe(0);
    // Still an arc: three points, one control.
    expect(around).toHaveLength(3);
  });

  it('is measured along the curve, not along its control triangle', () => {
    /*
     * The route is what is drawn; the **track** is what is measured. A label placed by
     * walking the control points would sit off its own line, because the control point
     * is twice as far out as the curve ever goes.
     */
    const points = arcPoints({ start: from, end: to }, ends);
    const track = connectorTrack(points, 'arc');
    expect(track.length).toBeGreaterThan(3);
    // The handle sits on the curve, which is the quadratic's own midpoint.
    const grip = midHandleOf(points, 'arc');
    const nearest = nearestOnPath(track, grip);
    expect(nearest.distance).toBeLessThan(60);
    // A polyline is its own track.
    expect(connectorTrack([{ x: 0, y: 0 }, { x: 9, y: 9 }], 'elbow')).toHaveLength(2);
  });

  it('is one of the four the document may say', () => {
    expect(connectorSpecOf({ attributes: { kind: 'arc' } }).kind).toBe('arc');
  });
});

describe('points the reader put on the line', () => {
  it('reads a list of pairs and drops anything else', () => {
    // A document is a file anybody can write, and one bad entry must not take the whole
    // line with it — the same rule the slide's guides follow.
    expect(
      readWaypoints({
        attributes: {
          waypoints: [
            { x: 1000, y: 2000 },
            { x: 'no', y: 1 },
            null,
            { x: 3000 },
            { x: 4000.6, y: 5000.4 }
          ]
        }
      })
    ).toEqual([
      { x: 1000, y: 2000 },
      { x: 4001, y: 5000 }
    ]);
    expect(readWaypoints({ attributes: {} })).toEqual([]);
    expect(readWaypoints(undefined)).toEqual([]);
  });

  const ends = (side: 'e' | 's') =>
    resolveEnds(
      spec({ start: { x: 0, y: 0, side }, end: { x: 0, y: 0, side: 'w' } }),
      {
        start: box({ width: 2000, height: 1000 }),
        end: box({ x: 9000, y: 6000, width: 2000, height: 1000 })
      }
    );

  it('passes a straight route through them, and nothing more', () => {
    // A reader who has placed three points has said where the line goes; a spline would
    // put it somewhere else.
    const through = throughWaypoints(ends('e'), [{ x: 5000, y: 500 }], 'straight');
    expect(through).toHaveLength(3);
    expect(through[1]).toEqual({ x: 5000, y: 500 });
  });

  it('turns an elbow at each point, alternating the axis', () => {
    /*
     * The choice between "across then down" and "down then across" is what makes a route
     * read as one line rather than a staircase: each leg leaves along the axis the last
     * one did not use, and the first follows the side it leaves by.
     */
    const through = throughWaypoints(ends('e'), [{ x: 5000, y: 3000 }], 'elbow');
    // Out east first: the corner shares the start's y.
    expect(through[1]).toEqual({ x: 5000, y: 500 });
    expect(through[2]).toEqual({ x: 5000, y: 3000 });
    // Then the other way round for the next leg.
    expect(through[3]).toEqual({ x: 5000, y: 6500 });
  });

  it('leaves an already-square leg alone rather than drawing a spur', () => {
    const through = throughWaypoints(ends('e'), [{ x: 5000, y: 500 }], 'elbow');
    // The start and the point share a y, so there is no corner to make.
    expect(through[0]).toEqual({ x: 2000, y: 500 });
    expect(through[1]).toEqual({ x: 5000, y: 500 });
  });

  it('leaves down first when the line leaves a top or bottom side', () => {
    const through = throughWaypoints(ends('s'), [{ x: 5000, y: 3000 }], 'elbow');
    expect(through[1]).toEqual({ x: 1000, y: 3000 });
  });

  it('is what `connectorPoints` uses, and it stops routing around things', () => {
    /*
     * A reader who has bent a line has said where it goes. A router moving it to avoid
     * something would be a control that does not work — the same rule as a magnet they
     * chose.
     */
    const boxes = {
      start: box({ width: 2000, height: 1000 }),
      end: box({ x: 9000, y: 6000, width: 2000, height: 1000 })
    };
    const wall = box({ x: 4000, y: 0, width: 1000, height: 8000 });
    const placed = [{ x: 5000, y: 3000 }];

    const route = connectorPoints(spec(), boxes, [wall], {}, placed);
    // Through the point, and straight through the wall if that is where they put it.
    expect(route.some((point) => point.x === 5000 && point.y === 3000)).toBe(true);
    expect(crossCount(route, [wall])).toBeGreaterThan(0);
  });
});

describe('whether a bow can be dragged at all', () => {
  const ends = { start: { x: 0, y: 0 }, end: { x: 6000, y: 3000 } };

  it('says no to a straight line, which has no bow to move', () => {
    // `connectorPoints` never hands `bend` to a straight route, so a grip on one would
    // be a control wired to nothing.
    expect(canBendByDrag([ends.start, ends.end], 'straight')).toBe(false);
  });

  it('says no to an elbow with one corner, and yes to one with two', () => {
    const oneCorner = [ends.start, { x: 6000, y: 0 }, ends.end];
    const twoCorners = [ends.start, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, ends.end];
    expect(canBendByDrag(oneCorner, 'elbow')).toBe(false);
    expect(canBendByDrag(twoCorners, 'elbow')).toBe(true);
  });

  it('agrees with what a drag would answer', () => {
    // The two must never disagree: a grip that appears where `bendFromDrag` returns the
    // bend unchanged is a handle that moves and does nothing.
    const oneCorner = [ends.start, { x: 6000, y: 0 }, ends.end];
    expect(bendFromDrag(oneCorner, 'elbow', { x: 2000, y: 2000 }, 400)).toBe(400);
    expect(canBendByDrag(oneCorner, 'elbow')).toBe(false);
  });

  it('says yes to a curve and an arc, whose shape is the bow', () => {
    expect(
      canBendByDrag(
        [ends.start, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, ends.end],
        'curve'
      )
    ).toBe(true);
    expect(canBendByDrag([ends.start, { x: 3000, y: 0 }, ends.end], 'arc')).toBe(true);
  });
});

/**
 * Two lines that cross, and the hop that says they do not meet.
 *
 * A crossing with no hop is ambiguous: a reader cannot tell whether one flow *branches*
 * into another or merely passes it. Every drawing convention for schematics answers it the
 * same way, and it is the same argument as the fan (§8.8) — what is prevented is not a look
 * but a picture nobody can read correctly.
 */
describe('where two lines cross', () => {
  const across = [
    { x: 0, y: 1000 },
    { x: 6000, y: 1000 }
  ];
  const down = [
    { x: 3000, y: -2000 },
    { x: 3000, y: 4000 }
  ];

  it('finds the point they pass at', () => {
    expect(segmentCrossings(across, down)).toEqual([{ x: 3000, y: 1000 }]);
  });

  it('says nothing about lines that only meet at an end', () => {
    /*
     * Two lines arriving at the same shape meet *at the shape*, and a hop there reads as a
     * mistake rather than as a crossing — they are both simply arriving.
     */
    const arriving = [
      { x: 3000, y: 4000 },
      { x: 3000, y: 1000 }
    ];
    expect(segmentCrossings(across, arriving)).toEqual([]);
  });

  it('says nothing about lines running along each other', () => {
    // No single point to hop at, and a bump in the middle of a shared stretch would be a
    // bump in the middle of nothing.
    const alongside = [
      { x: 1000, y: 1000 },
      { x: 5000, y: 1000 }
    ];
    expect(segmentCrossings(across, alongside)).toEqual([]);
  });

  it('finds one point per crossing, however many corners are involved', () => {
    const elbow = [
      { x: 1000, y: -2000 },
      { x: 1000, y: 1000 },
      { x: 5000, y: 1000 },
      { x: 5000, y: 4000 }
    ];
    /*
     * The middle run of the elbow lies *along* the straight line, so it is not a crossing;
     * its two uprights cross it, and they are both too near their own ends to count. The
     * answer being empty here is the two exclusions doing their job together.
     */
    expect(segmentCrossings(across, elbow)).toEqual([]);
  });

  it('finds both crossings when a line passes two others', () => {
    const twice = [
      { x: 1500, y: 1000 },
      { x: 4500, y: 1000 }
    ];
    const first = [
      { x: 2000, y: -1000 },
      { x: 2000, y: 3000 }
    ];
    const second = [
      { x: 4000, y: -1000 },
      { x: 4000, y: 3000 }
    ];
    expect([...segmentCrossings(twice, first), ...segmentCrossings(twice, second)]).toEqual([
      { x: 2000, y: 1000 },
      { x: 4000, y: 1000 }
    ]);
  });
});

describe('drawing the hop', () => {
  const straight = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 }
  ];

  it('puts an arc where the line passes over another', () => {
    const d = connectorPath(straight, 'straight', CORNER, [{ x: 3000, y: 0 }]);
    // Up to the crossing, over it, and on: one arc command, the same radius every time.
    expect(d).toContain(`A ${JUMP} ${JUMP} 0 0 0`);
    expect(d).toContain(`L ${3000 - JUMP} 0`);
    expect(d).toContain(`${3000 + JUMP} 0`);
  });

  it('draws the plain line when nothing crosses it', () => {
    expect(connectorPath(straight, 'straight', CORNER, [])).toBe('M 0 0 L 6000 0');
  });

  it('ignores a crossing that is not on the line', () => {
    // A point beside the run belongs to some other run: a hop drawn for it would be a
    // bump where nothing passes.
    expect(connectorPath(straight, 'straight', CORNER, [{ x: 3000, y: 900 }])).toBe(
      'M 0 0 L 6000 0'
    );
  });

  it('hops on each run of an elbow, and keeps the rounded corner', () => {
    const elbow = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 4000 }
    ];
    const d = connectorPath(elbow, 'elbow', CORNER, [
      { x: 2000, y: 0 },
      { x: 4000, y: 2000 }
    ]);
    expect(d.match(/A /g)).toHaveLength(2);
    // The corner is still rounded: a hop must not cost the line its own shape.
    expect(d).toContain('Q 4000 0');
  });

  it('skips a crossing too near a corner, where the arc would kink into it', () => {
    const elbow = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 4000 }
    ];
    const d = connectorPath(elbow, 'elbow', CORNER, [{ x: 3980, y: 0 }]);
    expect(d).not.toContain('A ');
  });

  it('leaves a curve alone, because a hop cut into a Bézier is not one arc', () => {
    const curve = [
      { x: 0, y: 0 },
      { x: 1000, y: 2000 },
      { x: 4000, y: 2000 },
      { x: 5000, y: 0 }
    ];
    const d = connectorPath(curve, 'curve', CORNER, [{ x: 2500, y: 1500 }]);
    expect(d).toBe('M 0 0 C 1000 2000 4000 2000 5000 0');
  });

  it('leaves a run too short to hop on alone', () => {
    // Three hop-widths is the least a line can be and still read as a line with a hop in
    // it rather than as a bump.
    const stub = [
      { x: 0, y: 0 },
      { x: JUMP * 2, y: 0 }
    ];
    expect(connectorPath(stub, 'straight', 0, [{ x: JUMP, y: 0 }])).toBe(`M 0 0 L ${JUMP * 2} 0`);
  });
});

/**
 * A word that belongs to one **end** of a line.
 *
 * The label in the middle names the relationship; a word at an end says something about
 * that end — UML's multiplicity (`1` here, `0..*` there) is the case everyone knows, and a
 * scenario editor's arrows carry the same shape of information.
 */
describe('where an end’s own word goes', () => {
  const across = [
    { x: 0, y: 0 },
    { x: 12000, y: 0 }
  ];

  it('sits in from the end it belongs to', () => {
    const start = labelNear(across, 'start');
    const end = labelNear(across, 'end');
    expect(start.x).toBeCloseTo(LABEL_INSET, -1);
    expect(end.x).toBeCloseTo(12000 - LABEL_INSET, -1);
  });

  it('is offset clear of the line, always to the same side', () => {
    // A pill drawn *on* the line has the line running through the word; and words that
    // jumped from one side to the other along a diagram read as a mistake.
    const start = labelNear(across, 'start');
    const end = labelNear(across, 'end');
    expect(Math.abs(start.y)).toBeGreaterThan(LABEL_SIZE);
    expect(Math.sign(start.y)).toBe(Math.sign(end.y));
  });

  it('offsets from the run it is on, not from the line between the ends', () => {
    /*
     * An elbow going right then down: the start's word is beside a horizontal run and the
     * end's beside a vertical one, so they are offset along different axes. Measuring the
     * direction from the ends alone would put both at 45°.
     */
    const elbow = [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 8000 }
    ];
    const start = labelNear(elbow, 'start');
    const end = labelNear(elbow, 'end');
    expect(Math.abs(start.y)).toBeGreaterThan(0);
    expect(start.x).toBeCloseTo(LABEL_INSET, -1);
    expect(Math.abs(end.x - 8000)).toBeGreaterThan(0);
    expect(end.y).toBeCloseTo(8000 - LABEL_INSET, -1);
  });

  it('keeps the two of them apart on a short line', () => {
    // Clamped to a third of the line, or the two end words meet in the middle — each
    // other, and the label already there.
    const stub = [
      { x: 0, y: 0 },
      { x: 900, y: 0 }
    ];
    const start = labelNear(stub, 'start');
    const end = labelNear(stub, 'end');
    expect(start.x).toBeLessThan(end.x);
    expect(end.x - start.x).toBeGreaterThan(200);
  });

  it('reads the word off the node, and shortens a long one', () => {
    expect(endLabelOf({ attributes: { startLabel: ' 1..* ' } }, 'start')).toBe('1..*');
    expect(endLabelOf({ attributes: { endLabel: '0..1' } }, 'start')).toBe('');
    expect(endLabelOf(undefined, 'end')).toBe('');
    // A line carries a word, not a paragraph: the same rule the middle label follows.
    const long = 'x'.repeat(40);
    expect(endLabelOf({ attributes: { endLabel: long } }, 'end').length).toBeLessThan(30);
  });
});

/**
 * A curve **through** the points a reader placed.
 *
 * The bug this replaces: a curve's points are *control* points, and a curve with waypoints
 * handed the reader's own points over in that list — so one waypoint became a control point
 * and the line leaned towards it without ever reaching it, which is the one thing a placed
 * bend means. Two of them drew a polyline, because five points match no branch.
 */
describe('a curve through placed points', () => {
  const stops = [
    { x: 0, y: 0 },
    { x: 3000, y: 3000 },
    { x: 6000, y: 0 }
  ];

  it('answers one cubic per span, as control points', () => {
    const spline = splineThrough(stops);
    // 1 + 3n: a start, then a handle-handle-end triple per span — the shape `connectorPath`
    // and `flattenCurve` already read for one cubic.
    expect(spline).toHaveLength(7);
    expect(spline[0]).toEqual(stops[0]);
    expect(spline[3]).toEqual(stops[1]);
    expect(spline[6]).toEqual(stops[2]);
  });

  it('passes through every point it was given', () => {
    // The whole difference from before. Measured on the flattened curve, which is what a
    // reader sees and what a label and a hit test walk.
    const drawn = flattenCurve(splineThrough(stops));
    for (const stop of stops) {
      const near = drawn.reduce(
        (best, point) => Math.min(best, Math.hypot(point.x - stop.x, point.y - stop.y)),
        Infinity
      );
      expect(near).toBeLessThan(30);
    }
  });

  it('joins its spans smoothly rather than in a kink', () => {
    /*
     * The handles either side of a shared point are placed from the *neighbours'* chord,
     * so they are opposite each other through it. A kink is what a polyline through the
     * same points would draw.
     */
    const spline = splineThrough(stops);
    const into = { x: spline[3].x - spline[2].x, y: spline[3].y - spline[2].y };
    const out = { x: spline[4].x - spline[3].x, y: spline[4].y - spline[3].y };
    const cross = into.x * out.y - into.y * out.x;
    expect(Math.abs(cross)).toBeLessThan(1000);
  });

  it('draws as several cubics, one path the stroke runs along', () => {
    const d = connectorPath(splineThrough(stops), 'curve');
    expect(d.match(/C /g)).toHaveLength(2);
    expect(d.startsWith('M 0 0')).toBe(true);
  });

  it('is what a curve with waypoints is routed as', () => {
    const ends = {
      start: { x: 0, y: 0 },
      end: { x: 6000, y: 0 },
      startSide: 'e' as const,
      endSide: 'w' as const
    };
    const through = throughWaypoints(ends as never, [{ x: 3000, y: 3000 }], 'curve');
    // Not the three stops: the reader's point is a point on the line, not a handle.
    expect(through).toHaveLength(7);
    expect(through[3]).toEqual({ x: 3000, y: 3000 });
  });

  it('leaves a line with nothing to go through alone', () => {
    expect(splineThrough([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toHaveLength(2);
  });

  it('takes the bow grip away, because a bow is ignored once points are placed', () => {
    // `connectorPoints` ignores `bend` entirely when there are waypoints, so a bow grip
    // there is a control wired to nothing — the fault `canBendByDrag` exists to prevent.
    const spline = splineThrough(stops);
    expect(canBendByDrag(spline, 'curve')).toBe(true);
    expect(canBendByDrag(spline, 'curve', true)).toBe(false);
  });
});
