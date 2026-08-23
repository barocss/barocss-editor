import { describe, it, expect } from 'vitest';
import {
  fromDisplay,
  rulerStep,
  stepFor,
  toDisplay,
  unitSuffix,
  type LengthUnit
} from '../src/units';

/**
 * A length, as a reader sees it and as they type it.
 *
 * The pair has to be each other's inverse to the precision the field shows, or
 * a panel becomes a place where reading a number and pressing Enter changes the
 * document. That is the one property worth checking exhaustively.
 */
describe('showing a length', () => {
  const UNITS: LengthUnit[] = ['cm', 'mm', 'in', 'pt', 'px'];

  it('knows an inch', () => {
    expect(toDisplay(1440, 'in')).toBe(1);
    expect(toDisplay(1440, 'cm')).toBe(2.54);
    expect(toDisplay(1440, 'mm')).toBe(25.4);
    expect(toDisplay(1440, 'pt')).toBe(72);
    expect(toDisplay(1440, 'px')).toBe(96);
  });

  it('reads back what it was given', () => {
    for (const unit of UNITS) {
      expect(fromDisplay(toDisplay(1440, unit), unit), unit).toBe(1440);
    }
  });

  /**
   * A 16:9 slide, which is the number the whole product's geometry is checked
   * against — 13.33 inches, 33.87cm, 1280 pixels.
   */
  it('describes a slide the way a reader would say it', () => {
    expect(toDisplay(19200, 'in')).toBe(13.33);
    expect(toDisplay(19200, 'cm')).toBe(33.87);
    expect(toDisplay(19200, 'px')).toBe(1280);
  });

  it('shows nothing finer than the unit can carry', () => {
    expect(toDisplay(1447, 'px')).toBe(96);
    expect(toDisplay(1447, 'cm')).toBe(2.55);
  });

  it('rounds a typed number to a whole twip', () => {
    expect(Number.isInteger(fromDisplay(2.54, 'cm'))).toBe(true);
    expect(Number.isInteger(fromDisplay(0.37, 'in'))).toBe(true);
  });

  it('steps by something a reader would want', () => {
    expect(stepFor('cm')).toBe(0.1);
    expect(stepFor('in')).toBe(0.1);
    expect(stepFor('px')).toBe(1);
  });

  it('says what it is', () => {
    expect(unitSuffix('in')).toBe('"');
    expect(unitSuffix('cm')).toBe('cm');
  });
});

/**
 * How a ruler steps in each unit — the judgement, which is *how many labels fit*.
 *
 * Tested apart from `axisTicks` because this is the half that is
 * about a reader: a 16:9 slide is 45.7cm / 18in / 1296pt / 1728px wide, and past
 * about fifty labels a ruler is a grey band. The counting itself is tested in
 * `office-slides`, which owns it and must not import this package.
 */
describe('how a ruler steps', () => {
  const across = 25920; // A 16:9 slide, in twips.
  const labels = (unit: Parameters<typeof rulerStep>[0]) => {
    const { per, major } = rulerStep(unit);
    return Math.floor(across / (per * major)) + 1;
  };

  it('fits between fifteen and fifty labels across a slide', () => {
    for (const unit of ['cm', 'mm', 'in', 'pt', 'px'] as const) {
      expect(labels(unit), unit).toBeGreaterThanOrEqual(15);
      expect(labels(unit), unit).toBeLessThanOrEqual(50);
    }
  });

  it('labels millimetres every ten, the way a printed ruler does', () => {
    // 457 labels otherwise, which is a smear.
    expect(rulerStep('mm').major).toBe(10);
    expect(rulerStep('mm').minor).toBe(5);
  });

  it('quarters an inch, because halves are four ticks across a slide', () => {
    expect(rulerStep('in')).toEqual({ per: 1440, major: 1, minor: 0.25 });
  });

  it('takes the twips in a unit from the one table that holds them', () => {
    expect(rulerStep('cm').per).toBeCloseTo(1440 / 2.54, 6);
    expect(rulerStep('px').per).toBe(15);
  });
});
