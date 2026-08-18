import { describe, it, expect } from 'vitest';
import { fromDisplay, stepFor, toDisplay, unitSuffix, type LengthUnit } from '../src/units';

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
