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
