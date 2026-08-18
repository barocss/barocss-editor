import { describe, it, expect } from 'vitest';
import { guidesFor, snapResize, type Box } from '../src/index';

/**
 * Snapping while resizing.
 *
 * Moving has snapped since the day dragging did, and resizing has not — the two
 * look like one problem and are not. A move shifts the whole box, so pulling any
 * of its six lines onto a guide is one offset added to `x` and `y`. A resize
 * holds the opposite edge still, so only the lines the handle moves are
 * candidates and pulling one changes the *size*.
 *
 * These are the cases that distinguish the two.
 */
describe('snapping a resize', () => {
  const box: Box = { x: 1000, y: 1000, width: 2000, height: 1000 };
  /** A neighbour whose left edge is at 3100 and whose top is at 900. */
  const guides = guidesFor([{ x: 3100, y: 900, width: 500, height: 500 }]);
  const WITHIN = 150;

  it('pulls the dragged edge and leaves the other one alone', () => {
    // East edge is at 3000, the guide at 3100: the width grows by 100 and `x`
    // does not move. A move-snap would have shifted the whole box.
    const { box: snapped, hit } = snapResize(box, 'e', guides, WITHIN);
    expect(snapped).toMatchObject({ x: 1000, width: 2100 });
    expect(hit).toHaveLength(1);
  });

  it('moves x and the width together when the west edge is dragged', () => {
    // The east edge must not move: that is what makes it a resize.
    const west = snapResize({ x: 3050, y: 1000, width: 2000, height: 1000 }, 'w', guides, WITHIN);
    expect(west.box.x).toBe(3100);
    expect(west.box.x + west.box.width).toBe(3050 + 2000);
  });

  it('snaps both axes on a corner, independently', () => {
    const corner = snapResize(
      { x: 1000, y: 1000, width: 2050, height: 2050 },
      'se',
      guidesFor([{ x: 3100, y: 3100, width: 500, height: 500 }]),
      WITHIN
    );
    expect(corner.box).toMatchObject({ width: 2100, height: 2100 });
    expect(corner.hit).toHaveLength(2);
  });

  it('leaves an axis the handle does not move', () => {
    // The east handle moves nothing vertically, so a horizontal guide is not a
    // candidate however close it is.
    const { box: snapped } = snapResize(box, 'e', guidesFor([{ x: 9999, y: 1010, width: 1, height: 1 }]), WITHIN);
    expect(snapped).toMatchObject({ y: 1000, height: 1000 });
  });

  /**
   * The difference from `snapBox` in one test. A guide sitting on the box's own
   * middle is a real target for a move and a wrong one for a resize: the middle
   * moves because the edge moved, and snapping it puts the edge where nobody
   * asked for it.
   */
  it('does not snap the box’s middle', () => {
    const middle = guidesFor([{ x: 2000, y: 5000, width: 0, height: 0 }]);
    const { box: snapped, hit } = snapResize(box, 'e', middle, WITHIN);
    expect(snapped).toMatchObject({ width: 2000 });
    expect(hit).toEqual([]);
  });

  it('refuses a snap that would turn the box inside out', () => {
    // A guide behind the opposite edge: the west handle dragged past the east
    // one would give a negative width, which is not a box.
    const behind = guidesFor([{ x: 3400, y: 0, width: 0, height: 0 }]);
    const { box: snapped, hit } = snapResize(
      { x: 3300, y: 1000, width: 50, height: 1000 },
      'w',
      behind,
      WITHIN
    );
    expect(snapped.width).toBeGreaterThanOrEqual(0);
    expect(hit).toEqual([]);
  });

  it('rounds, whether or not anything was near', () => {
    // The same contract `snapBox` had to be given: one function, one promise
    // about what reaches the document.
    const loose = snapResize({ x: 10.4, y: 20.6, width: 30.5, height: 40.5 }, 'e', [], WITHIN);
    expect(loose.box).toMatchObject({ x: 10, y: 21, width: 31, height: 41 });
  });

  it('does nothing for a move, which is the other function’s job', () => {
    const { hit } = snapResize(box, 'move', guides, WITHIN);
    expect(hit).toEqual([]);
  });
});
