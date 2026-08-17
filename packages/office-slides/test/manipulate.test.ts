import { describe, it, expect } from 'vitest';
import {
  RESIZE_HANDLES,
  angleOf,
  contains,
  intersects,
  moveBox,
  resizeBox,
  snapAngle,
  unionOf,
  unrotate
} from '../src/manipulate';

/**
 * A resize handle is the kind of thing that is *almost* right in a hundred
 * subtle ways, and every one of them is a browser session to find. Here they
 * are a millisecond each.
 */
describe('dragging a box', () => {
  /**
   * A realistic box, in twips.
   *
   * The first version of this used 200x100, which is 13x7 pixels — smaller than
   * the minimum a box may be dragged to — so every resize came back clamped and
   * four tests failed for a reason that had nothing to do with what they were
   * about. A fixture has to be a thing the product could actually hold.
   */
  const box = { x: 1000, y: 1000, width: 2000, height: 1000 };

  it('keeps the model in whole twips', () => {
    // A pointer delta is a screen distance divided by the scale, so it is a
    // fraction almost every time. A drag in the browser wrote 8977.777777777777
    // before this rounded.
    const moved = moveBox(box, { dx: 10.4, dy: -3.7 });
    expect(moved.x).toBe(1010);
    expect(moved.y).toBe(996);
  });

  it('moves', () => {
    expect(moveBox(box, { dx: 500, dy: -250 })).toEqual({
      x: 1500,
      y: 750,
      width: 2000,
      height: 1000
    });
  });

  describe('resizing', () => {
    it('moves the edge that is dragged and leaves the opposite one', () => {
      // The whole of what a handle means, and the part that drifts if it is
      // written as "add the delta to the width".
      expect(resizeBox(box, 'e', { dx: 500, dy: 0 })).toEqual({
        x: 1000,
        y: 1000,
        width: 2500,
        height: 1000
      });

      // West: `x` moves *and* the width shrinks. A caller that only changed the
      // width would grow the box leftwards from a corner nobody grabbed.
      expect(resizeBox(box, 'w', { dx: 500, dy: 0 })).toEqual({
        x: 1500,
        y: 1000,
        width: 1500,
        height: 1000
      });
    });

    it('moves one axis for an edge and two for a corner', () => {
      expect(resizeBox(box, 'n', { dx: 9999, dy: 200 })).toEqual({
        x: 1000,
        y: 1200,
        width: 2000,
        height: 800
      });

      expect(resizeBox(box, 'se', { dx: 200, dy: 300 })).toEqual({
        x: 1000,
        y: 1000,
        width: 2200,
        height: 1300
      });
    });

    it('anchors the opposite corner, whichever corner is dragged', () => {
      for (const handle of ['nw', 'ne', 'se', 'sw'] as const) {
        const result = resizeBox(box, handle, { dx: 100, dy: 100 });
        const anchorX = handle.includes('w') ? box.x + box.width : box.x;
        const anchorY = handle.startsWith('n') ? box.y + box.height : box.y;

        const stillX = handle.includes('w') ? result.x + result.width : result.x;
        const stillY = handle.startsWith('n') ? result.y + result.height : result.y;

        expect(stillX, `${handle} moved its anchor horizontally`).toBe(anchorX);
        expect(stillY, `${handle} moved its anchor vertically`).toBe(anchorY);
      }
    });

    describe('keeping the proportions', () => {
      it('follows the axis the reader is actually dragging along', () => {
        // 2:1. A mostly-horizontal drag takes the width and computes the height.
        const wide = resizeBox(box, 'se', { dx: 1000, dy: 50 }, { keepAspect: true });
        expect(wide.width / wide.height).toBeCloseTo(2, 5);
        expect(wide.width).toBe(3000);

        // ...and a mostly-vertical one does the opposite, rather than feeling
        // dead because the horizontal always won.
        const tall = resizeBox(box, 'se', { dx: 50, dy: 1000 }, { keepAspect: true });
        expect(tall.width / tall.height).toBeCloseTo(2, 5);
        expect(tall.height).toBe(2000);
      });

      it('is ignored on an edge, where it could not mean anything', () => {
        // An edge handle moves one axis by definition; "keep the proportions
        // while dragging one edge" has no reading a user could predict.
        expect(resizeBox(box, 'e', { dx: 500, dy: 0 }, { keepAspect: true })).toEqual(
          resizeBox(box, 'e', { dx: 500, dy: 0 })
        );
      });
    });

    it('resizes about the centre when asked', () => {
      const result = resizeBox(box, 'e', { dx: 200, dy: 0 }, { fromCentre: true });
      expect(result).toEqual({ x: 800, y: 1000, width: 2400, height: 1000 });

      // The centre stays put, which is the whole point of it.
      expect(result.x + result.width / 2).toBe(box.x + box.width / 2);
    });

    it('mirrors when dragged past the far edge, rather than going negative', () => {
      // Flipping is real and expected. What must never reach the model is a
      // negative width, which CSS draws as nothing.
      const flipped = resizeBox(box, 'w', { dx: 3000, dy: 0 });
      expect(flipped.width).toBeGreaterThan(0);
      expect(flipped.x).toBe(3000);
      expect(flipped.width).toBe(1000);
    });

    it('stops at a minimum, so a box can always be grabbed again', () => {
      // Dragged nearly to the anchor. A drag that goes *past* it flips instead,
      // which is the test above — 10000 here would have mirrored a 8000-wide box
      // and read as the floor not working.
      const squashed = resizeBox(box, 'e', { dx: -1950, dy: 0 }, { minimum: 120 });
      expect(squashed.width).toBe(120);
      // The dragged side stops; the anchored side does not get pushed along.
      expect(squashed.x).toBe(1000);

      // Dragged *nearly* to the anchor, which is where the floor applies. A
      // drag that goes past it is a flip, not a clamp — see the test above.
      const other = resizeBox(box, 'w', { dx: 1950, dy: 0 }, { minimum: 120 });
      expect(other.width).toBe(120);
      expect(other.x + other.width).toBe(3000);

      /**
       * And a flip that lands inside the floor holds the *new* anchor.
       *
       * After a flip the sides have swapped jobs: the handle is still called
       * `w` and is now the right-hand side of the box. Clamping by the original
       * roles held the side being dragged and pushed the one that was not,
       * which is the anchor moving on its own.
       */
      const past = resizeBox(box, 'w', { dx: 2050, dy: 0 }, { minimum: 120 });
      expect(past.width).toBe(120);
      expect(past.x).toBe(3000);

      // And the axis nobody dragged is left exactly as it was, however small it
      // is. Applied to both axes, the floor silently resized the other one.
      const short = { x: 0, y: 0, width: 4000, height: 60 };
      expect(resizeBox(short, 'e', { dx: 100, dy: 0 }).height).toBe(60);
    });

    it('never produces a fraction of a twip', () => {
      // The model is integers; a resize that leaves 0.3333 in it makes every
      // later comparison approximate.
      const result = resizeBox(box, 'se', { dx: 333, dy: 333 }, { keepAspect: true });
      for (const value of Object.values(result)) expect(Number.isInteger(value)).toBe(true);
    });

    it('has a handle for every side and corner, and `move`', () => {
      expect(RESIZE_HANDLES).toHaveLength(8);
      expect(resizeBox(box, 'move', { dx: 50, dy: 50 })).toEqual(moveBox(box, { dx: 50, dy: 50 }));
    });
  });

  describe('rotation', () => {
    it('is zero when the pointer is straight up from the centre', () => {
      // Where a rotate handle sits, and what `rotate(0deg)` means. `atan2` puts
      // zero to the *right*, so this quarter turn is the whole conversion.
      expect(angleOf(box, { x: 2000, y: 0 })).toBe(0);
    });

    it('turns clockwise, like every drawing tool', () => {
      expect(angleOf(box, { x: 4000, y: 1500 })).toBe(90);
      expect(angleOf(box, { x: 2000, y: 4000 })).toBe(180);
      expect(angleOf(box, { x: 0, y: 1500 })).toBe(270);
    });

    it('snaps to the angles a reader actually wants', () => {
      expect(snapAngle(7)).toBe(0);
      expect(snapAngle(8)).toBe(15);
      expect(snapAngle(47)).toBe(45);
      // −10 snaps to −15, which is 345 — not 355, which is what it would be if
      // the sign were handled by wrapping first and snapping after.
      expect(snapAngle(-10)).toBe(345);
      expect(snapAngle(358)).toBe(0);
    });
  });

  describe('hit testing', () => {
    it('is inside or outside', () => {
      expect(contains(box, { x: 1500, y: 1500 })).toBe(true);
      expect(contains(box, { x: 1000, y: 1000 })).toBe(true);
      expect(contains(box, { x: 999, y: 1500 })).toBe(false);
      expect(contains(box, { x: 1500, y: 2001 })).toBe(false);
    });

    /**
     * A rotated box is still a rectangle; it is the pointer that is in the
     * wrong frame. Testing the axis-aligned bounding box instead would catch
     * clicks on the corners of a diamond that are not on the diamond.
     */
    it('turns the pointer back rather than growing the box', () => {
      const square = { x: 0, y: 0, width: 1000, height: 1000 };
      // A corner of the bounding box of a 45°-turned square, which is outside
      // the square itself.
      const corner = { x: 20, y: 20 };
      expect(contains(square, corner)).toBe(true);
      expect(contains(square, unrotate(square, 45, corner))).toBe(false);

      // ...and the centre is the centre however it is turned.
      expect(unrotate(square, 45, { x: 500, y: 500 })).toEqual({ x: 500, y: 500 });
    });

    it('leaves an unrotated box\'s point alone', () => {
      expect(unrotate(box, 0, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    });
  });

  describe('several boxes', () => {
    it('takes the smallest box containing all of them', () => {
      expect(
        unionOf([
          { x: 10, y: 10, width: 10, height: 10 },
          { x: 100, y: 5, width: 20, height: 10 }
        ])
      ).toEqual({ x: 10, y: 5, width: 110, height: 15 });
    });

    it('has no union for no boxes', () => {
      expect(unionOf([])).toBeUndefined();
    });

    /**
     * A marquee catches what it is dragged *over*. Requiring full containment
     * means a marquee that visibly crosses three shapes selects one, which
     * reads as broken rather than as a rule.
     */
    it('catches a box it merely touches', () => {
      const marquee = { x: 0, y: 0, width: 1500, height: 1500 };
      expect(intersects(marquee, box)).toBe(true);
      expect(intersects(marquee, { x: 5000, y: 5000, width: 100, height: 100 })).toBe(false);
    });

    it('does not catch a box it only shares an edge with', () => {
      // Touching is not overlapping, and a marquee dragged exactly to an edge
      // selecting the thing beyond it is a surprise.
      expect(intersects({ x: 0, y: 1000, width: 1000, height: 1000 }, box)).toBe(false);
    });
  });
});
