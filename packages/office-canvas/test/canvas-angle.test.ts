import { describe, expect, it } from 'vitest';
import { directionOf, notMinusZero, offsetAt } from '../src/canvas-angle';

/**
 * The one sentence four files were each writing out: `{ x: sin θ, y: −cos θ }`, θ clockwise from up.
 *
 * The values below are checked against what each of the four already produces, so a product adopting
 * this changes no pixel and no stored number. The `-0` cases are the ones worth the file: three of
 * the four guard it and the fourth does not, and in a shadow the number is written into the document
 * rather than into a style attribute.
 */
describe('an angle as a direction', () => {
  it('points up at 0° and down at 180°, which is the test both products state', () => {
    const up = directionOf(0);
    expect(up.x).toBeCloseTo(0, 12);
    expect(up.y).toBe(-1);

    const down = directionOf(180);
    expect(down.x).toBeCloseTo(0, 12);
    expect(down.y).toBeCloseTo(1, 12);
  });

  it('points right at 90° and left at 270°', () => {
    expect(directionOf(90).x).toBeCloseTo(1, 12);
    expect(directionOf(90).y).toBeCloseTo(0, 12);
    expect(directionOf(270).x).toBeCloseTo(-1, 12);
    expect(directionOf(270).y).toBeCloseTo(0, 12);
  });

  it('is a unit vector at every angle, so a caller may scale it by a distance', () => {
    for (const angle of [0, 30, 45, 90, 135, 180, 225, 270, 315, 359]) {
      const at = directionOf(angle);
      expect(Math.hypot(at.x, at.y)).toBeCloseTo(1, 12);
    }
  });

  it('leaves the float noise in, because a caller is about to multiply', () => {
    // Deliberately *not* rounded here: `cos(90°)` is 6.1e-17 and a caller scaling by 6000 twips
    // wants that noise still present so its own rounding sees the real product.
    expect(directionOf(90).y).not.toBe(0);
    expect(Math.abs(directionOf(90).y)).toBeLessThan(1e-15);
  });
});

describe('a distance thrown along an angle', () => {
  it('is what the deck writes for its default shadow — 180°, straight down', () => {
    // `office-slides/paints.ts`: x = d·sin θ, y = −d·cos θ, whole twips.
    expect(offsetAt(180, 60)).toEqual({ x: 0, y: 60 });
    expect(offsetAt(0, 60)).toEqual({ x: 0, y: -60 });
  });

  it('never writes `-0` into a document', () => {
    /*
     * The trap all three of the guarding copies name: `cos(90°)` is not zero, so a shadow thrown
     * straight sideways rounds to a negative zero — which survives saving and shows up in every diff
     * of the file afterwards. `-0 === 0` is true and `Object.is(-0, 0)` is false, so it is a
     * difference two checks disagree about, which is the worst kind.
     */
    const sideways = offsetAt(90, 6000);
    expect(Object.is(sideways.y, -0)).toBe(false);
    expect(Object.is(offsetAt(270, 6000).y, -0)).toBe(false);
    expect(Object.is(offsetAt(180, 6000).x, -0)).toBe(false);
    expect(Object.is(offsetAt(0, 6000).x, -0)).toBe(false);
  });

  it('rounds the way the caller measures, which is why the rounding comes in', () => {
    // The page writes CSS pixels to two decimals; the deck writes whole twips into the document.
    const twoDecimals = (value: number) => Math.round(value * 100) / 100;
    expect(offsetAt(45, 10, twoDecimals)).toEqual({ x: 7.07, y: -7.07 });
    expect(offsetAt(45, 10)).toEqual({ x: 7, y: -7 });
  });

  it('agrees with the arithmetic each of the four copies spells out', () => {
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const radians = (angle * Math.PI) / 180;
      const asWritten = {
        x: Math.round(240 * Math.sin(radians)),
        y: Math.round(-240 * Math.cos(radians))
      };
      const here = offsetAt(angle, 240);
      // Equal as numbers — and this comparison is exactly the one `-0` slips through, so the
      // sign is asserted separately below.
      expect(here.x).toBe(asWritten.x === 0 ? 0 : asWritten.x);
      expect(here.y).toBe(asWritten.y === 0 ? 0 : asWritten.y);
      expect(Object.is(here.x, -0)).toBe(false);
      expect(Object.is(here.y, -0)).toBe(false);
    }
  });
});

describe('the negative zero on its own', () => {
  it('turns one into a plain zero and leaves everything else alone', () => {
    expect(Object.is(notMinusZero(-0), 0)).toBe(true);
    expect(notMinusZero(0)).toBe(0);
    expect(notMinusZero(-3)).toBe(-3);
    expect(notMinusZero(2.5)).toBe(2.5);
  });
});
