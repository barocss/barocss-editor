import { describe, it, expect } from 'vitest';
import {
  addStop,
  angleBetween,
  angleTowards,
  axisRange,
  gradientPoints,
  radialCss,
  radialShape,
  remapStops,
  axisLength,
  gradientAxis,
  offsetAlong,
  removeStop
} from '../src/gradient-axis';

/**
 * A gradient's axis on the shape.
 *
 * The angle was a number in a box, and nobody aims a gradient by typing 135 —
 * they point at the corner they want it to come from. What has to be right is
 * that the *drawn* line is the line CSS actually paints along: a reader dragging
 * a stop to the end of it must see the colour stop there, and being wrong by a
 * few per cent looks like nothing at all on screen.
 */
const box = { x: 0, y: 0, width: 400, height: 200 };

const gradient = (angle: number, offsets: number[] = [0, 1]) =>
  ({
    kind: 'linear' as const,
    angle,
    stops: offsets.map((offset) => ({ offset, color: '#000' }))
  });

describe('the line CSS paints along', () => {
  /**
   * `|w·sin a| + |h·cos a|`, which is the projection of the box onto the
   * direction — chosen by CSS so the end stops land on the corners the direction
   * points at.
   */
  it('is the box’s own height when the gradient runs straight down', () => {
    expect(axisLength(box, 180)).toBeCloseTo(200);
    expect(axisLength(box, 0)).toBeCloseTo(200);
  });

  it('is its width when the gradient runs across', () => {
    expect(axisLength(box, 90)).toBeCloseTo(400);
  });

  it('is longer than either on a diagonal', () => {
    // 45°: half of each, added — which is more than the height and less than the
    // sum, and is why a corner-to-corner gradient reaches the corners.
    expect(axisLength(box, 45)).toBeCloseTo((400 + 200) / Math.SQRT2, 1);
  });
});

describe('where the handles go', () => {
  it('puts them either side of the centre, along the direction', () => {
    const axis = gradientAxis(gradient(180), box)!;
    // 180° runs *down*: the first stop is at the top.
    expect(axis.from).toEqual({ x: 200, y: 0 });
    expect(axis.to).toEqual({ x: 200, y: 200 });
  });

  it('runs left to right at 90°, which is what "across" means', () => {
    const axis = gradientAxis(gradient(90), box)!;
    expect(axis.from.x).toBeCloseTo(0);
    expect(axis.to.x).toBeCloseTo(400);
    expect(axis.from.y).toBeCloseTo(100);
  });

  it('puts every stop where its colour is', () => {
    const axis = gradientAxis(gradient(180, [0, 0.25, 1]), box)!;
    expect(axis.stops.map((stop) => Math.round(stop.y))).toEqual([0, 50, 200]);
  });

  /** A circle has no direction, so its stops run along a radius a reader can see. */
  it('draws a radial gradient’s stops along a radius', () => {
    const axis = gradientAxis({ ...gradient(0), kind: 'radial' }, box)!;
    expect(axis.from).toEqual({ x: 200, y: 100 });
    expect(axis.to).toEqual({ x: 400, y: 100 });
  });

  it('is nothing for a paint with no direction, or a gradient with no stops', () => {
    expect(gradientAxis({ kind: 'solid', color: '#fff' }, box)).toBeUndefined();
    expect(gradientAxis({ kind: 'image', src: 'a.png' }, box)).toBeUndefined();
    expect(gradientAxis({ kind: 'linear', stops: [{ offset: 0, color: '#fff' }] }, box)).toBeUndefined();
  });
});

describe('aiming a gradient by pointing at the shape', () => {
  it('is zero straight up, and grows clockwise', () => {
    expect(angleTowards(box, { x: 200, y: -100 })).toBe(0);
    expect(angleTowards(box, { x: 500, y: 100 })).toBe(90);
    expect(angleTowards(box, { x: 200, y: 300 })).toBe(180);
    expect(angleTowards(box, { x: -100, y: 100 })).toBe(270);
  });

  it('rounds to a whole degree, because nobody typed 134.7', () => {
    expect(Number.isInteger(angleTowards(box, { x: 371, y: 13 }))).toBe(true);
  });
});

describe('dragging a stop along the axis', () => {
  const axis = gradientAxis(gradient(90), box)!;

  it('is the projection onto the line', () => {
    expect(offsetAlong(axis, { x: 0, y: 100 })).toBe(0);
    expect(offsetAlong(axis, { x: 200, y: 100 })).toBe(0.5);
    expect(offsetAlong(axis, { x: 400, y: 100 })).toBe(1);
  });

  /**
   * A reader whose pointer wandered off the line has still moved the stop by
   * however much of the movement was *along* it — which is the behaviour every
   * gradient editor has and the only one that does not feel sticky.
   */
  it('ignores the part of a drag that is across the line', () => {
    expect(offsetAlong(axis, { x: 200, y: -400 })).toBe(0.5);
  });

  it('never leaves the line', () => {
    expect(offsetAlong(axis, { x: -900, y: 100 })).toBe(0);
    expect(offsetAlong(axis, { x: 9000, y: 100 })).toBe(1);
  });
});

/**
 * Adding and taking away a colour stop.
 *
 * One gesture in two places — a double-click on the gradient's bar in the panel,
 * and on its axis on the shape — so the arithmetic is here rather than in both.
 * The second copy is the one that stops being fixed.
 */
describe('a gradient’s stops', () => {
  const stops = [
    { offset: 0, color: '#ff0000' },
    { offset: 1, color: '#0000ff' }
  ];

  it('adds one where the reader pointed, in the colour of its nearest neighbour', () => {
    const added = addStop(stops, 0.4);
    expect(added.map((stop) => stop.offset)).toEqual([0, 0.4, 1]);
    // The nearer end is red, so the new stop is red — interpolating would be
    // better and cannot be done, because a stop may hold `theme:accent1` and
    // there is no midpoint between two names.
    expect(added[1].color).toBe('#ff0000');
    expect(addStop(stops, 0.9)[1].color).toBe('#0000ff');
  });

  /**
   * Sorted, because the order of the list is what CSS paints — and because both
   * surfaces number their dots from it, so an unsorted list would renumber every
   * stop after the new one.
   */
  it('keeps the list in the order the gradient runs', () => {
    const three = addStop(addStop(stops, 0.8), 0.2);
    expect(three.map((stop) => stop.offset)).toEqual([0, 0.2, 0.8, 1]);
  });

  it('refuses an offset outside the gradient rather than storing one', () => {
    expect(addStop(stops, 1.7)[2].offset).toBe(1);
    expect(addStop(stops, -0.4)[0].offset).toBe(0);
  });

  /**
   * Two is the least a gradient can be, and the *refusal* is what matters: the
   * caller gets the same list back, which is what lets a panel disable its button
   * and the canvas ignore the key with one check — and, on the canvas, is why a
   * refused Delete does not fall through to deleting the shape.
   */
  it('will not go below two stops, and says so by changing nothing', () => {
    expect(removeStop(stops, 0)).toBe(stops);

    const three = addStop(stops, 0.5);
    expect(removeStop(three, 1).map((stop) => stop.offset)).toEqual([0, 1]);
    // An index the list does not have is the same refusal.
    expect(removeStop(three, 9)).toBe(three);
    expect(removeStop(three, -1)).toBe(three);
  });
});

/**
 * A gradient that runs between two points, which an angle cannot say.
 *
 * The measurement that shaped it: CSS has no syntax for "from here to there". Its
 * axis is centred on the box with a length derived from the angle, and a gradient
 * painted into a *smaller background layer* — the obvious way to place it — is
 * transparent outside that layer, where CSS and Figma both hold the end colour.
 *
 * So the segment is projected onto CSS's own axis and the stops are squeezed into
 * the part it covers. The picture is right, the colours hold outside it, and the
 * declaration stays one `linear-gradient`.
 */
describe('a gradient between two points', () => {
  const box = { x: 0, y: 0, width: 1000, height: 500 };

  it('reads both points or neither', () => {
    expect(gradientPoints({ kind: 'linear', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } })).toEqual({
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 }
    });
    // Half a pair is a document mid-write; drawing it would put the gradient
    // somewhere nobody asked for.
    expect(gradientPoints({ kind: 'linear', from: { x: 0, y: 0 } })).toBeUndefined();
    expect(
      gradientPoints({ kind: 'linear', from: { x: 0, y: 0 }, to: { x: NaN, y: 1 } })
    ).toBeUndefined();
    // Half a box outside is allowed on purpose — a gradient that begins off the
    // shape is the whole reason to hold points — and past that is a drag nobody
    // meant.
    expect(
      gradientPoints({ kind: 'linear', from: { x: -9, y: 0 }, to: { x: 9, y: 0 } })
    ).toEqual({ from: { x: -0.5, y: 0 }, to: { x: 1.5, y: 0 } });
  });

  /**
   * The same convention `angleTowards` uses — 0° up, clockwise — so a paint that
   * holds points and one that holds an angle mean the same thing by the same
   * number.
   */
  it('turns two points into the angle CSS reads', () => {
    expect(angleBetween({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, box)).toBe(90);
    expect(angleBetween({ x: 0.5, y: 1 }, { x: 0.5, y: 0 }, box)).toBe(0);
    expect(angleBetween({ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, box)).toBe(180);
    // The box's proportions matter: the same fractions across a wide box and a
    // tall one are different directions, which is why this needs the box at all.
    expect(angleBetween({ x: 0, y: 0 }, { x: 1, y: 1 }, box)).toBe(117);
    expect(angleBetween({ x: 0, y: 0 }, { x: 1, y: 1 }, { ...box, width: 500 })).toBe(135);
  });

  /**
   * Where the reader's segment falls on the axis CSS paints. A segment spanning
   * the whole box in the axis's own direction is 0 → 1; anything shorter is inside.
   */
  it('projects the segment onto the axis CSS will paint', () => {
    // Straight across a box, edge to edge: the whole axis.
    const across = axisRange({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, box);
    expect(across.t0).toBeCloseTo(0, 5);
    expect(across.t1).toBeCloseTo(1, 5);

    // The middle half of it: a quarter in, a quarter from the end.
    const middle = axisRange({ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, box);
    expect(middle.t0).toBeCloseTo(0.25, 5);
    expect(middle.t1).toBeCloseTo(0.75, 5);

    // Backwards is not the same as forwards: `t0` is the *from* point even when
    // the gradient runs right to left, so a caller cannot get the direction wrong.
    const back = axisRange({ x: 0.75, y: 0.5 }, { x: 0.25, y: 0.5 }, box);
    expect(back.t0).toBeCloseTo(0.25, 5);
    expect(back.t1).toBeCloseTo(0.75, 5);
  });

  it('squeezes the stops into the part of the axis the segment covers', () => {
    const stops = [
      { offset: 0, color: '#f00' },
      { offset: 0.5, color: '#ff0' },
      { offset: 1, color: '#00f' }
    ];
    const moved = remapStops(stops, { t0: 0.25, t1: 0.75 });
    expect(moved.map((stop) => stop.offset)).toEqual([0.25, 0.5, 0.75]);
    // The colours are untouched: this places the gradient, it does not recolour it.
    expect(moved.map((stop) => stop.color)).toEqual(['#f00', '#ff0', '#00f']);

    // Two points in the same place is a drag in progress, and the honest reading
    // is the gradient it had rather than a division by nothing.
    expect(remapStops(stops, { t0: 0.5, t1: 0.5 })).toBe(stops);
  });

  /**
   * And the axis a reader *drags* is the segment, not the derived one — which is
   * what makes the start handle able to say anything at all. Before this, the
   * from handle sat wherever the centred axis happened to begin.
   */
  it('draws the axis between the points a paint holds', () => {
    const axis = gradientAxis(
      {
        kind: 'linear',
        from: { x: 0.25, y: 0 },
        to: { x: 0.75, y: 1 },
        stops: [
          { offset: 0, color: '#f00' },
          { offset: 1, color: '#00f' }
        ]
      },
      box
    )!;
    expect(axis.from).toEqual({ x: 250, y: 0 });
    expect(axis.to).toEqual({ x: 750, y: 500 });
    // And a stop halfway along is halfway between them, not halfway across a box.
    const half = gradientAxis(
      {
        kind: 'linear',
        from: { x: 0.25, y: 0 },
        to: { x: 0.75, y: 1 },
        stops: [
          { offset: 0, color: '#f00' },
          { offset: 0.5, color: '#ff0' },
          { offset: 1, color: '#00f' }
        ]
      },
      box
    )!;
    expect(half.stops[1]).toEqual({ x: 500, y: 250, offset: 0.5 });
  });
});

/**
 * A radial's shape: where its centre is and how far it reaches.
 *
 * What CSS gives, measured: `circle at 30% 60%` ✓, `ellipse 80px 30px at …` ✓,
 * radii as **percentages** ✓, and a rotation ✗ — `radial-gradient` has no syntax
 * for one, so the rotated ellipse Figma draws is a wall in CSS rather than a gap
 * here. Worth asserting the boundary so nobody hunts for the bug.
 */
describe('a radial gradient’s ellipse', () => {
  const box = { x: 0, y: 0, width: 1000, height: 500 };

  it('takes its centre and both radii from the same two points', () => {
    const shape = radialShape({
      kind: 'radial',
      from: { x: 0.5, y: 0.5 },
      to: { x: 0.8, y: 0.75 }
    })!;
    // `to` is the *corner* of the radii, so each axis is a distance from centre.
    expect(shape).toEqual({ cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.25 });
    // Which means a radial needs no attribute a linear does not have, and a
    // reader switching between them keeps the placement they had.
    expect(radialShape({ kind: 'radial' })).toBeUndefined();
  });

  /**
   * A floor rather than a refusal: a radius of nothing is a gradient with no
   * gradient in it, and a reader who dragged a handle onto the centre has
   * overshot rather than asked for that.
   */
  it('keeps a radius a reader dragged to nothing just above nothing', () => {
    const shape = radialShape({
      kind: 'radial',
      from: { x: 0.5, y: 0.5 },
      to: { x: 0.5, y: 0.5 }
    })!;
    expect(shape.rx).toBe(0.01);
    expect(shape.ry).toBe(0.01);
  });

  it('writes the ellipse as percentages, and the old circle when unplaced', () => {
    expect(
      radialCss({ kind: 'radial', from: { x: 0.25, y: 0.5 }, to: { x: 0.75, y: 0.9 } }, box)
    ).toBe('50% 40% at 25% 50%');

    // A document written before points existed means what it always meant, and a
    // document may not change its mind on being opened.
    expect(radialCss({ kind: 'radial' }, box)).toBe('circle at 50% 50%');
    expect(radialCss({ kind: 'radial', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } })).toBe(
      'circle at 50% 50%'
    );
  });

  /**
   * And the axis a reader drags runs along the *horizontal* radius — the one CSS
   * lists first, and the only direction there is, because a rotated radial is the
   * thing CSS refuses.
   */
  it('draws its axis along the horizontal radius', () => {
    const axis = gradientAxis(
      {
        kind: 'radial',
        from: { x: 0.5, y: 0.5 },
        to: { x: 0.8, y: 0.75 },
        stops: [
          { offset: 0, color: '#fff' },
          { offset: 1, color: '#000' }
        ]
      },
      box
    )!;
    expect(axis.from).toEqual({ x: 500, y: 250 });
    expect(axis.to).toEqual({ x: 800, y: 250 });
  });
});
