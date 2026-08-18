import { describe, it, expect } from 'vitest';
import { layoutChildren, laysOut, layoutModeOf } from '../src/canvas-layout';

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
