import { describe, expect, it } from 'vitest';
import { placeNear, type PlaceBox } from '../src/place-near';

/**
 * **어떤 것 옆에 상자를 놓는 산수**, 한 곳에서.
 *
 * Written three times — `floating.tsx`, `color-field.tsx`, and the deck's timeline — with three
 * different preferences and three copies of the same flip-and-clamp underneath. The preferences are
 * real and stay; the arithmetic is what is easy to get subtly wrong, and it is now checkable in
 * milliseconds instead of by opening a popover near the bottom of a window.
 */
const anchor = (one: Partial<PlaceBox>): PlaceBox => ({
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  ...one
});

const within = { width: 1000, height: 800 };

describe('무엇 옆에 놓기', () => {
  it('puts it on the side asked for, when it fits there', () => {
    const at = anchor({ top: 400, bottom: 420, left: 100, right: 200, width: 100, height: 20 });
    expect(placeNear(at, { width: 200, height: 100 }, { prefer: 'below', within }).top).toBe(424);
    expect(placeNear(at, { width: 200, height: 100 }, { prefer: 'above', within }).top).toBe(296);
  });

  it('flips to the other side when the preferred one has no room', () => {
    /* A swatch near the bottom: below has 40px, the picker is 300 — so it goes above. */
    const low = anchor({ top: 740, bottom: 760, left: 100, right: 200, width: 100, height: 20 });
    expect(placeNear(low, { width: 200, height: 300 }, { prefer: 'below', within }).top).toBe(436);

    /* And a caret near the top: above has 10px, so a menu preferring above goes below. */
    const high = anchor({ top: 10, bottom: 30, left: 100, right: 200, width: 100, height: 20 });
    expect(placeNear(high, { width: 200, height: 300 }, { prefer: 'above', within }).top).toBe(34);
  });

  it('asks whether the placement fits, not whether the height does — four pixels wide', () => {
    /**
     * **The bug this function was written with, and the check that found it.**
     *
     * Asking *does the height fit in the room* lets through a box whose resulting `top` lands between
     * `margin - gap` and `margin`: the side is chosen, and then the clamp pulls it to the margin. So
     * a `/` menu that should have flipped **below** the caret sat at the top of the window instead —
     * the site's slash check asserted *at or below the caret* and got **8**, which is the margin.
     *
     * Here: a caret at 379 with a 371-tall menu. The room above is 371 and the height is 371, so
     * *the height fits* — but the placement would be at 4, which is inside the margin. It flips.
     */
    const caret = anchor({ top: 379, bottom: 399, left: 100, right: 120, width: 20, height: 20 });
    const placed = placeNear(caret, { width: 200, height: 371 }, { prefer: 'above', within });
    expect(placed.top).toBeGreaterThanOrEqual(caret.top - 1);
    expect(placed.top).toBe(403);

    /* One pixel shorter and it does fit above, exactly at the margin. */
    expect(placeNear(caret, { width: 200, height: 367 }, { prefer: 'above', within }).top).toBe(8);
  });

  it('goes below when neither side fits, because a clamped box covers what it is about', () => {
    /**
     * **The clause that took a failing check to get right.**
     *
     * Both of the three originals chose *below* here, and the reason only shows up on screen: a box
     * clamped **upward** swallows its own anchor — a 411px menu at a caret 380px down a 720px window
     * lands at the margin and covers the caret it is about. Clamped downward it starts just under the
     * anchor with its first rows visible, which is the half a reader uses.
     */
    const caret = anchor({ top: 380, bottom: 398, left: 100, right: 120, width: 20, height: 18 });
    const tall = placeNear(caret, { width: 200, height: 411 }, { prefer: 'above', within: { width: 1600, height: 720 } });
    expect(tall.top).toBeGreaterThanOrEqual(caret.top);
    expect(tall.top).toBe(402);
  });

  it('runs off the bottom rather than climbing over what it is about', () => {
    /**
     * **A box taller than the window cannot be inside it**, and pulling it in is not the kindness it
     * looks like: clamped up, it spans the anchor and covers the very thing it is describing. Below
     * and overflowing, its first rows sit right under the anchor where they can be read and arrowed
     * through, which is what a long menu does everywhere.
     *
     * `floating.tsx` had no vertical clamp at all, which looked like an omission and was this rule.
     */
    const at = anchor({ top: 400, bottom: 420, left: 100, right: 200, width: 100, height: 20 });
    const placed = placeNear(at, { width: 200, height: 2000 }, { prefer: 'below', within });
    expect(placed.top).toBe(424);
    expect(placed.top).toBeGreaterThan(at.bottom);
  });

  it('still pulls a box that fits back inside the window', () => {
    /* The clamp is bounded by the anchor, not switched off: a picker that fits simply moves up. */
    const low = anchor({ top: 700, bottom: 720, left: 100, right: 200, width: 100, height: 20 });
    /* Above has 692 and the picker is 300, so it goes above — and needs no clamping. */
    expect(placeNear(low, { width: 200, height: 300 }, { prefer: 'below', within }).top).toBe(396);
  });

  it('lines up across in the three ways the three callers wanted', () => {
    const at = anchor({ top: 100, bottom: 120, left: 300, right: 500, width: 200, height: 20 });
    /* A slash menu centres under the caret. */
    expect(placeNear(at, { width: 100, height: 40 }, { align: 'center', within }).left).toBe(350);
    /* A colour picker hangs off the right edge of its swatch. */
    expect(placeNear(at, { width: 100, height: 40 }, { align: 'end', within }).left).toBe(400);
    /* And a menu opens from the left edge of what it belongs to. */
    expect(placeNear(at, { width: 100, height: 40 }, { align: 'start', within }).left).toBe(300);
  });

  it('never lets it hang off the side, whichever way it is lined up', () => {
    /* Flush right of an anchor at the very edge would put 6px of the box past the window. */
    const at = anchor({ top: 100, bottom: 120, left: 968, right: 998, width: 30, height: 20 });
    const placed = placeNear(at, { width: 300, height: 40 }, { align: 'end', within });
    expect(placed.left).toBe(692);
    expect(placed.left + 300).toBeLessThanOrEqual(within.width - 8);

    const left = placeNear(anchor({ left: 2, right: 20, width: 18 }), { width: 300, height: 40 }, { within });
    expect(left.left).toBe(8);
  });
});
