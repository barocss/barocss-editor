import { describe, it, expect } from 'vitest';
import {
  childrenToLayOut,
  layoutChildren,
  laysOut,
  layoutModeOf,
  reorderIndexAt
} from '../src/canvas-layout';

/**
 * A frame that arranges what is in it.
 *
 * Pure arithmetic — settings and sizes in, positions out — so all of it runs in
 * milliseconds and none of it needs a document. The decision it implements is
 * in `docs/specs/canvas-model.md`: the layout is computed into the *model*,
 * because a slide places and every other part of the product reads `x` and `y`
 * to find out where something is.
 */
describe('arranging what is in a frame', () => {
  const child = (sid: string, x: number, y: number, width: number, height: number) => ({
    sid,
    box: { x, y, width, height }
  });

  const frame = (attributes: Record<string, unknown>) => ({
    attributes: { width: 10000, height: 6000, ...attributes }
  });

  it('leaves a frame that says nothing alone', () => {
    expect(laysOut({})).toBe(false);
    expect(laysOut({ layoutMode: 'none' })).toBe(false);
    expect(laysOut({ layoutMode: 'row' })).toBe(true);
    expect(layoutModeOf({ mode: 'sideways' })).toBe('none');

    const moved = layoutChildren(frame({}), [child('a', 5, 7, 100, 100)]);
    expect(moved.size).toBe(0);
  });

  describe('along the axis, and the four sides', () => {
    /**
     * Where the leftover goes.
     *
     * A frame bigger than what it holds put every spare twip at the end, always — so the row every
     * navigation bar on the web is could not be said: *the mark at one end, the links at the
     * other*. `alignItems` was the cross axis and there was no word for this one.
     */
    it('puts what is left where the frame says, along the axis', () => {
      /*
       * Started somewhere nothing arranges them to. `layoutChildren` answers with what *moves*, so
       * a child that happens to already be where the arrangement wants it is absent — and a test
       * that started them all at 0 read `start` as two children instead of three.
       */
      const three = () => [child('a', 5, 7, 1000, 500), child('b', 5, 7, 1000, 500), child('c', 5, 7, 1000, 500)];
      const row = (justifyContent: string) =>
        layoutChildren(frame({ layoutMode: 'row', justifyContent, width: 10000 }), three());

      // 10000 wide, 3000 taken: 7000 spare.
      expect([...row('start').values()].map((at) => at.x)).toEqual([0, 1000, 2000]);
      expect([...row('center').values()].map((at) => at.x)).toEqual([3500, 4500, 5500]);
      expect([...row('end').values()].map((at) => at.x)).toEqual([7000, 8000, 9000]);
      // The one a nav bar is: the ends touch the ends.
      expect([...row('between').values()].map((at) => at.x)).toEqual([0, 4500, 9000]);
      expect([...row('evenly').values()].map((at) => at.x)).toEqual([1750, 4500, 7250]);
    });

    it('has nothing to distribute once a child has taken the room', () => {
      /*
       * `layoutGrow` and `justifyContent` are the same leftover, asked for twice. A child that
       * asked for a share has already been given it, so there is nothing left to spread — which is
       * the interaction CSS makes too, and the one that keeps a filling child from being pushed
       * off the end by a distribution that thought the room was still free.
       */
      const moved = layoutChildren(frame({ layoutMode: 'row', justifyContent: 'between', width: 10000 }), [
        { ...child('a', 5, 7, 1000, 500), grow: 1 },
        child('b', 5, 7, 1000, 500)
      ]);
      expect(moved.get('a')).toEqual({ x: 0, y: 0, width: 9000 });
      expect(moved.get('b')).toEqual({ x: 9000, y: 0 });
    });

    it('reads a side of its own where it has one, and the shorthand where it does not', () => {
      const moved = layoutChildren(
        frame({ layoutMode: 'column', padding: 100, paddingTop: 600, paddingLeft: 300 }),
        [child('a', 5, 7, 1000, 500), child('b', 5, 7, 1000, 500)]
      );
      // Top and left are their own; the gap between the two children is untouched by either.
      expect(moved.get('a')).toEqual({ x: 300, y: 600 });
      expect(moved.get('b')).toEqual({ x: 300, y: 1100 });
    });

    it('measures the room across the axis between the two sides that bound it', () => {
      // A row 6000 tall with 600 above and 1400 below centres against the 4000 between them.
      const moved = layoutChildren(
        frame({ layoutMode: 'row', alignItems: 'center', paddingTop: 600, paddingBottom: 1400, height: 6000 }),
        [child('a', 5, 7, 1000, 1000)]
      );
      expect(moved.get('a')).toEqual({ x: 0, y: 2100 });
    });
  });

  it('lays a row out left to right, with the gap between', () => {
    const moved = layoutChildren(
      frame({ layoutMode: 'row', gap: 200, padding: 100 }),
      [child('a', 0, 0, 1000, 500), child('b', 0, 0, 600, 500), child('c', 0, 0, 400, 500)]
    );
    expect(moved.get('a')).toEqual({ x: 100, y: 100 });
    expect(moved.get('b')).toEqual({ x: 1300, y: 100 });
    expect(moved.get('c')).toEqual({ x: 2100, y: 100 });
  });

  it('lays a column out top to bottom', () => {
    // Started somewhere else on purpose: the answer is what *changes*, so a
    // child already in its place is correctly absent from it.
    const moved = layoutChildren(
      frame({ layoutMode: 'column', gap: 150 }),
      [child('a', 700, 700, 400, 300), child('b', 700, 700, 400, 200)]
    );
    expect(moved.get('a')).toEqual({ x: 0, y: 0 });
    expect(moved.get('b')).toEqual({ x: 0, y: 450 });
  });

  /**
   * The answer is what *changes*, which is what lets the reaction that calls
   * this run on every content change without feeding itself.
   */
  it('says nothing about a child that is already where it belongs', () => {
    const settings = frame({ layoutMode: 'row', gap: 100 });
    const children = [child('a', 0, 0, 500, 400), child('b', 600, 0, 500, 400)];

    expect(layoutChildren(settings, children).size).toBe(0);

    // Move one and only that one comes back.
    const moved = layoutChildren(settings, [children[0], child('b', 999, 0, 500, 400)]);
    expect([...moved.keys()]).toEqual(['b']);
  });

  describe('across the run', () => {
    const children = [child('tall', 0, 0, 400, 1000), child('short', 0, 0, 400, 200)];

    it('starts them level by default', () => {
      const moved = layoutChildren(frame({ layoutMode: 'row', gap: 0 }), children);
      expect(moved.get('short')?.y).toBe(0);
    });

    it('centres them when asked', () => {
      // The frame is 6000 tall, so a 200-tall child centres at 2900.
      const moved = layoutChildren(
        frame({ layoutMode: 'row', alignItems: 'center' }),
        children
      );
      expect(moved.get('short')?.y).toBe(2900);
      expect(moved.get('tall')?.y).toBe(2500);
    });

    it('drops them to the end when asked', () => {
      const moved = layoutChildren(frame({ layoutMode: 'row', alignItems: 'end' }), children);
      expect(moved.get('short')?.y).toBe(5800);
    });
  });

  describe('a grid', () => {
    // All four start away from where they belong, so every one of them appears
    // in the answer; a child already in place is left out by design.
    const four = [
      child('a', 900, 900, 400, 300),
      child('b', 900, 900, 600, 300),
      child('c', 900, 900, 400, 300),
      child('d', 900, 900, 400, 300)
    ];

    it('wraps at the column count', () => {
      const moved = layoutChildren(frame({ layoutMode: 'grid', columns: 2, gap: 100 }), four);
      expect(moved.get('a')).toEqual({ x: 0, y: 0 });
      expect(moved.get('b')).toEqual({ x: 500, y: 0 });
      // The second row starts under the first, and column one is as wide as its
      // widest item.
      expect(moved.get('c')).toEqual({ x: 0, y: 400 });
      expect(moved.get('d')).toEqual({ x: 500, y: 400 });
    });

    /**
     * Rows are as tall as their tallest item rather than uniform, which is what
     * keeps a grid of mixed shapes from leaving holes.
     */
    it('gives a row the height its tallest item needs', () => {
      const moved = layoutChildren(frame({ layoutMode: 'grid', columns: 2, gap: 0 }), [
        child('a', 900, 900, 400, 900),
        child('b', 900, 900, 400, 300),
        child('c', 900, 900, 400, 300),
        child('d', 900, 900, 400, 300)
      ]);
      expect(moved.get('c')?.y).toBe(900);
    });

    it('takes at least one column, however it is asked', () => {
      const moved = layoutChildren(frame({ layoutMode: 'grid', columns: 0 }), four);
      expect(moved.get('b')?.y).toBeGreaterThan(0);
    });
  });
});

/**
 * Which children the arithmetic is allowed to touch.
 *
 * A frame holds placed things on a canvas and ordinary blocks in a document,
 * and the same code walks both. Writing `x` and `y` onto a paragraph would put
 * coordinates in a node that has no use for them and no renderer that reads
 * them — a value that survives a save and means nothing.
 */
describe('what a frame arranges, and what it leaves to the browser', () => {
  const store = (nodes: Record<string, { stype: string; attributes: Record<string, unknown> }>) =>
    (sid: string) => (nodes[sid] ? { sid, ...nodes[sid] } : undefined);

  it('arranges the children that have a size', () => {
    const getNode = store({
      a: { stype: 'rectangle', attributes: { x: 0, y: 0, width: 1000, height: 500 } },
      b: { stype: 'ellipse', attributes: { x: 0, y: 0, width: 600, height: 500 } }
    });
    const children = childrenToLayOut(getNode, ['a', 'b']);
    expect(children.map((c) => c.sid)).toEqual(['a', 'b']);
    expect(children[0].box).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
  });

  /**
   * The case this rule exists for: a frame in a Word document, holding
   * paragraphs. Every one is skipped, so the arrangement answers "nothing
   * moves" and the flex CSS on the frame does the work.
   */
  it('leaves flow blocks alone, so no paragraph is given coordinates', () => {
    const getNode = store({
      p1: { stype: 'paragraph', attributes: {} },
      p2: { stype: 'paragraph', attributes: {} }
    });
    expect(childrenToLayOut(getNode, ['p1', 'p2'])).toEqual([]);

    const moved = layoutChildren(
      { attributes: { layoutMode: 'row', gap: 200, width: 10000, height: 4000 } },
      childrenToLayOut(getNode, ['p1', 'p2'])
    );
    expect(moved.size).toBe(0);
  });

  /**
   * Not `x`: every scene node defaults it to `0`, so a shape that has never
   * been placed is indistinguishable from one placed at the origin — and a
   * paragraph that somehow carried an `x` would be arranged by mistake.
   */
  it('reads a size rather than a position, which everything has', () => {
    const getNode = store({
      p: { stype: 'paragraph', attributes: { x: 0, y: 0 } },
      r: { stype: 'rectangle', attributes: { width: 400, height: 400 } }
    });
    expect(childrenToLayOut(getNode, ['p', 'r']).map((c) => c.sid)).toEqual(['r']);
  });
});

/**
 * What a drag inside an arranging frame means.
 *
 * Measured before this existed: `setBoxGeometry` reported success, the layout put the
 * shape straight back, and undo did nothing — the reader's own entry restored the number
 * the layout had already restored. A gesture that reports success and changes nothing is
 * the worst of the three possible answers, and the order is the one thing about an
 * arranged child that is still the reader's to decide.
 */
describe('which place in the order a drag means', () => {
  const row = [
    { sid: 'a', box: { x: 0, y: 0, width: 1000, height: 1000 } },
    { sid: 'b', box: { x: 1200, y: 0, width: 1000, height: 1000 } },
    { sid: 'c', box: { x: 2400, y: 0, width: 1000, height: 1000 } }
  ];

  it('counts what the pointer is past, along the axis the frame arranges', () => {
    expect(reorderIndexAt(row, { x: -500, y: 500 }, 'row')).toBe(0);
    expect(reorderIndexAt(row, { x: 1000, y: 500 }, 'row')).toBe(1);
    expect(reorderIndexAt(row, { x: 9000, y: 500 }, 'row')).toBe(3);
  });

  it('leaves the dragged shape out of the places it can go', () => {
    /*
     * The index is one *without* the moving shape, because that is what `moveNode` takes:
     * it removes first and inserts into the shortened array. Dragging the first shape just
     * past the second is index 1 — which gives `b, a, c`. Counting it in would answer 2
     * and land it after `c`.
     */
    expect(reorderIndexAt(row, { x: 1900, y: 500 }, 'row', 'a')).toBe(1);
    expect(reorderIndexAt(row, { x: 9000, y: 500 }, 'row', 'a')).toBe(2);
  });

  it('ignores the axis the frame does not arrange along', () => {
    // A row is ordered left to right, so how high the reader held the shape says nothing.
    expect(reorderIndexAt(row, { x: 1000, y: -9000 }, 'row')).toBe(1);
    const column = row.map((item, index) => ({
      sid: item.sid,
      box: { x: 0, y: index * 1200, width: 1000, height: 1000 }
    }));
    expect(reorderIndexAt(column, { x: 9000, y: 1000 }, 'column')).toBe(1);
  });

  it('reads a grid the way it is written', () => {
    // Two columns: earlier rows first, then left to right. A pointer in the second row's
    // left half comes after both of the first row.
    const grid = [
      { sid: 'a', box: { x: 0, y: 0, width: 1000, height: 1000 } },
      { sid: 'b', box: { x: 1200, y: 0, width: 1000, height: 1000 } },
      { sid: 'c', box: { x: 0, y: 1200, width: 1000, height: 1000 } },
      { sid: 'd', box: { x: 1200, y: 1200, width: 1000, height: 1000 } }
    ];
    expect(reorderIndexAt(grid, { x: 200, y: 1700 }, 'grid')).toBe(2);
    // Between the two of the second row: past `c`'s centre and short of `d`'s. Asserting
    // 3 for a pointer at 1900 was my own arithmetic being wrong — 1900 is past `d` too,
    // and the answer there is the last place.
    expect(reorderIndexAt(grid, { x: 1300, y: 1700 }, 'grid')).toBe(3);
    expect(reorderIndexAt(grid, { x: 1900, y: 1700 }, 'grid')).toBe(4);
    expect(reorderIndexAt(grid, { x: 200, y: 200 }, 'grid')).toBe(0);
  });

  it('answers nothing for a frame that does not arrange', () => {
    // Then a drag has its plain meaning — a move — and there is no order to place it in.
    // −1 rather than 0, which is a real position and would send the shape to the front.
    expect(reorderIndexAt(row, { x: 1000, y: 500 }, 'none')).toBe(-1);
  });

  it('answers the first place when the frame is empty of anything else', () => {
    expect(reorderIndexAt([], { x: 0, y: 0 }, 'row')).toBe(0);
    expect(reorderIndexAt([row[0]], { x: 9000, y: 0 }, 'row', 'a')).toBe(0);
  });
});

/**
 * What a child asks of the frame: **fill it**, or **share what is left of it**.
 *
 * The half of auto-layout this had none of, and the measurement that made it worth having:
 * widening a frame from 6000 to 10000 twips moved its children — re-centred on the new width —
 * and left every one of them its old size. So a card built out of a frame could be made wider
 * and its rows would sit in the middle of it, which is not what anybody means by a wider card.
 *
 * `layoutStretch` is "as wide as its frame" across the axis; `layoutGrow` is `flex-grow`'s
 * share along it. Figma's constraints answer the general question — what is pinned to which
 * edge, what scales — and that is a layout model this schema does not have. These two are the
 * part of it auto-layout actually spends.
 */
describe('a child that fills its frame', () => {
  const frame = (attributes: Record<string, unknown>) => ({
    attributes: { width: 10000, height: 6000, ...attributes }
  });

  it('takes the frame’s width in a column, less the padding', () => {
    const moved = layoutChildren(frame({ layoutMode: 'column', gap: 200, padding: 100 }), [
      { sid: 'a', box: { x: 0, y: 0, width: 1000, height: 500 }, stretch: true },
      { sid: 'b', box: { x: 0, y: 0, width: 1000, height: 500 } }
    ]);
    // 10000 less 100 either side. And it starts at the padding: there is no room left to align
    // a child that fills the whole of it.
    expect(moved.get('a')).toEqual({ x: 100, y: 100, width: 9800 });
    // The one that asked for nothing keeps its size, and is still aligned as the frame says.
    expect(moved.get('b')).toEqual({ x: 100, y: 800 });
  });

  it('takes the frame’s height in a row', () => {
    const moved = layoutChildren(frame({ layoutMode: 'row', padding: 300 }), [
      { sid: 'a', box: { x: 0, y: 0, width: 1000, height: 500 }, stretch: true }
    ]);
    expect(moved.get('a')).toEqual({ x: 300, y: 300, height: 5400 });
  });

  it('shares what is left along the axis, in proportion', () => {
    /*
     * 10000 wide, 200 padding either side and one gap of 200: 9400 of room, 2000 of it used by
     * the two children's own widths, so 7400 left — a third to the first and two thirds to the
     * second.
     */
    const moved = layoutChildren(frame({ layoutMode: 'row', gap: 200, padding: 200 }), [
      { sid: 'a', box: { x: 0, y: 0, width: 1000, height: 500 }, grow: 1 },
      { sid: 'b', box: { x: 0, y: 0, width: 1000, height: 500 }, grow: 2 }
    ]);
    expect(moved.get('a')?.width).toBe(3467);
    expect(moved.get('b')?.width).toBe(5933);
    // And the second one starts after the first's *new* width, not its old one — the sizes are
    // decided before the positions, or the gap would land in the middle of a child.
    expect(moved.get('b')?.x).toBe(200 + 3467 + 200);
  });

  it('does not shrink a frame’s children to fit it', () => {
    // A canvas overflows everywhere else in this engine, and shrinking needs a minimum size per
    // shape to be anything but a guess. So `grow` gives out nothing when there is nothing left.
    const moved = layoutChildren(frame({ layoutMode: 'row', padding: 0, width: 1000 }), [
      { sid: 'a', box: { x: 0, y: 0, width: 4000, height: 500 }, grow: 1 }
    ]);
    expect(moved.get('a')?.width).toBeUndefined();
  });

  it('fills its cell in a grid, and ignores a share it cannot answer', () => {
    const moved = layoutChildren(frame({ layoutMode: 'grid', columns: 2, gap: 100, padding: 100 }), [
      { sid: 'a', box: { x: 0, y: 0, width: 1000, height: 400 }, stretch: true, grow: 3 },
      { sid: 'b', box: { x: 0, y: 0, width: 2000, height: 600 } }
    ]);
    // The column is as wide as its widest item and the row as tall as its tallest, so a
    // stretched cell is 1000×600 — and `grow` says nothing here, because a grid wraps and has
    // no axis to share along.
    expect(moved.get('a')).toEqual({ x: 100, y: 100, height: 600 });
    expect(moved.get('b')).toEqual({ x: 1200, y: 100 });
  });

  it('answers nothing once the document already agrees', () => {
    // The property the whole reaction rests on: run against a document that already says what
    // the arrangement wants, this is empty — so writing cannot feed itself.
    const settled = layoutChildren(frame({ layoutMode: 'column', padding: 100 }), [
      { sid: 'a', box: { x: 100, y: 100, width: 9800, height: 500 }, stretch: true }
    ]);
    expect(settled.size).toBe(0);
  });
});
