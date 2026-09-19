import { describe, expect, it } from 'vitest';
import { ZOOM_STEP, clampZoom, stepZoom, zoomIn, zoomOut, type ZoomLadder } from '../src/viewport';

/**
 * The ladder the ± buttons walk.
 *
 * The nine checks in `office-slides/test/geometry.test.ts` are repeated here **with the deck's own
 * ladder handed in**, so that when the deck deletes its copy the assertions do not go with it. That
 * is the whole point of the move: `stepZoom` had nine checks and no caller, and the ± buttons of two
 * apps ran a multiplier the function was written to prevent.
 */

/** The deck's, from `office-slides/geometry.ts` — 0.1 to 8, a contact sheet at one end. */
const DECK: ZoomLadder = { steps: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4], min: 0.1, max: 8 };
/** Word's, from `office-word/zoom.tsx` — 0.25 to 4, because a page at 10% is unreadable. */
const PAGE: ZoomLadder = { steps: [0.5, 0.75, 1, 1.25, 1.5, 2], min: 0.25, max: 4 };

describe('the ladder the steppers walk', () => {
  it('lands on the next named stop, not on a multiple', () => {
    expect(stepZoom(1, 1, DECK)).toBe(1.5);
    expect(stepZoom(1, -1, DECK)).toBe(0.75);
  });

  it('is the thing 100 → 125 → 156 → 195 was not', () => {
    // What the ± buttons did, three presses from 100%.
    let multiplied = 1;
    const drifted: number[] = [];
    for (let press = 0; press < 3; press += 1) {
      multiplied = zoomIn(multiplied);
      drifted.push(Math.round(multiplied * 100));
    }
    expect(drifted).toEqual([125, 156, 195]);

    let climbed = 1;
    const named: number[] = [];
    for (let press = 0; press < 3; press += 1) {
      climbed = stepZoom(climbed, 1, DECK);
      named.push(Math.round(climbed * 100));
    }
    expect(named).toEqual([150, 200, 300]);
  });

  it('snaps a zoom that is not on the ladder onto it, in one press', () => {
    expect(stepZoom(0.8, 1, DECK)).toBe(1);
    expect(stepZoom(0.8, -1, DECK)).toBe(0.75);
    // The objection `viewport.ts` used to raise against tables, answered: 83% steps from 83%.
    expect(stepZoom(0.83, 1, DECK)).toBe(1);
    expect(stepZoom(0.83, -1, DECK)).toBe(0.75);
  });

  it('a zoom a hair off a stop steps away from it in both directions', () => {
    /*
     * The field shows `round(zoom * 100)`, so a zoom off a *fit* reads as 100% without being 1. The
     * tolerance in `stepZoom` is for exactly this, and it is checked rather than explained: without
     * it, − from this value returns the same 100% the reader is already looking at.
     */
    const barelyOne = 1 + 1e-10;
    expect(Math.round(barelyOne * 100)).toBe(100);
    expect(stepZoom(barelyOne, -1, DECK)).toBe(0.75);
    expect(stepZoom(barelyOne, 1, DECK)).toBe(1.5);

    const barelyUnderOne = 1 - 1e-10;
    expect(Math.round(barelyUnderOne * 100)).toBe(100);
    expect(stepZoom(barelyUnderOne, 1, DECK)).toBe(1.5);
    expect(stepZoom(barelyUnderOne, -1, DECK)).toBe(0.75);
  });

  it('is its own inverse anywhere on the ladder — which the 1.1/0.9 pair was not', () => {
    for (const stop of DECK.steps) {
      if (stop === DECK.steps[0] || stop === DECK.steps[DECK.steps.length - 1]) continue;
      expect(stepZoom(stepZoom(stop, 1, DECK), -1, DECK)).toBe(stop);
      expect(stepZoom(stepZoom(stop, -1, DECK), 1, DECK)).toBe(stop);
    }
  });

  it('falls back to the multiplier past either end of the table, and stops at the product’s limit', () => {
    // Past the last stop there is still somewhere to go, up to `max`.
    expect(stepZoom(4, 1, DECK)).toBe(4 * ZOOM_STEP);
    expect(stepZoom(0.25, -1, DECK)).toBeCloseTo(0.2, 5);
    // And at the limit, nowhere.
    expect(stepZoom(DECK.max, 1, DECK)).toBe(DECK.max);
    expect(stepZoom(DECK.min, -1, DECK)).toBe(DECK.min);
  });

  it('holds a zoom inside the product’s own limits', () => {
    expect(clampZoom(99, DECK)).toBe(DECK.max);
    expect(clampZoom(0.001, DECK)).toBe(DECK.min);
  });
});

describe('the limits are the product’s and do not come down', () => {
  it('walks a page and a deck differently from the same zoom', () => {
    // 100% up: a page offers 125%, a deck offers 150%. Both are right for their product.
    expect(stepZoom(1, 1, PAGE)).toBe(1.25);
    expect(stepZoom(1, 1, DECK)).toBe(1.5);
  });

  it('stops a page at 4 and lets a deck to 8', () => {
    expect(stepZoom(3.9, 1, PAGE)).toBe(PAGE.max);
    expect(stepZoom(3.9, 1, DECK)).toBe(4);
    expect(stepZoom(7, 1, DECK)).toBe(DECK.max);
  });

  it('a table may stop short of its own limits, and then the multiplier finishes the walk', () => {
    /*
     * Word's table is [0.5 … 2] inside limits of 0.25–4, so **both ends of Word's range are off the
     * ladder**: past 2 and below 0.5 a reader leaves the named sizes and is walked by 1.25 until the
     * limit. That is a fact about Word's table rather than about this function, and it is asserted
     * here so the two are not confused — a later reader who "fixes" 0.4 into 0.25 would be deciding
     * a product's zoom range from the shared layer.
     */
    expect(stepZoom(0.5, -1, PAGE)).toBeCloseTo(0.4, 12);
    expect(stepZoom(2, 1, PAGE)).toBe(2.5);
    // Walked far enough, it does stop at the limit.
    let down = 0.5;
    for (let press = 0; press < 6; press += 1) down = stepZoom(down, -1, PAGE);
    expect(down).toBe(PAGE.min);

    // The deck's table reaches its own bottom stop and then does the same.
    expect(stepZoom(0.5, -1, DECK)).toBe(0.25);
    expect(stepZoom(0.25, -1, DECK)).toBeCloseTo(0.2, 5);
  });
});

describe('the wheel keeps the multiplier, and that is the split', () => {
  it('is an exact pair, so a round trip returns', () => {
    // The measured fault this replaced: `round(z*110)/100` then `round(z*90)/100` drifted 70 → 69.
    let at = 0.7;
    for (let turn = 0; turn < 5; turn += 1) at = zoomIn(at);
    for (let turn = 0; turn < 5; turn += 1) at = zoomOut(at);
    expect(at).toBeCloseTo(0.7, 12);
  });

  it('is continuous where the button is discrete', () => {
    // A wheel is allowed anywhere; a button is only allowed on the stops (or the reader's own typed
    // number). Asserting it so the two answers cannot be collapsed into one by a later reader.
    expect(zoomIn(1)).toBe(1.25);
    expect(DECK.steps).not.toContain(zoomIn(1));
    expect(DECK.steps).toContain(stepZoom(1, 1, DECK));
  });
});
