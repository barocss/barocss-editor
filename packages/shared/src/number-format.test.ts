import { describe, it, expect } from 'vitest';
import { formatCounter, NumberFormat } from './number-format';

/**
 * The document stores which format, never the rendered result — so this mapping
 * is the whole of what "1." vs "I." means, and every product must agree on it.
 */
describe('formatCounter', () => {
  it('renders decimal and zero-padded decimal', () => {
    expect(formatCounter(4, NumberFormat.Decimal)).toBe('4');
    expect(formatCounter(4, NumberFormat.DecimalZero)).toBe('04');
    expect(formatCounter(14, NumberFormat.DecimalZero)).toBe('14');
  });

  it('renders roman numerals in both cases', () => {
    expect(formatCounter(4, NumberFormat.UpperRoman)).toBe('IV');
    expect(formatCounter(9, NumberFormat.LowerRoman)).toBe('ix');
    expect(formatCounter(1984, NumberFormat.UpperRoman)).toBe('MCMLXXXIV');
  });

  it('counts letters bijectively, so 27 is aa and not ba', () => {
    expect(formatCounter(1, NumberFormat.LowerLetter)).toBe('a');
    expect(formatCounter(26, NumberFormat.LowerLetter)).toBe('z');
    expect(formatCounter(27, NumberFormat.LowerLetter)).toBe('aa');
    expect(formatCounter(28, NumberFormat.UpperLetter)).toBe('AB');
    expect(formatCounter(52, NumberFormat.LowerLetter)).toBe('az');
    expect(formatCounter(53, NumberFormat.LowerLetter)).toBe('ba');
  });

  it('gets the teens right in ordinals', () => {
    expect(formatCounter(1, NumberFormat.Ordinal)).toBe('1st');
    expect(formatCounter(2, NumberFormat.Ordinal)).toBe('2nd');
    expect(formatCounter(3, NumberFormat.Ordinal)).toBe('3rd');
    expect(formatCounter(4, NumberFormat.Ordinal)).toBe('4th');
    expect(formatCounter(11, NumberFormat.Ordinal)).toBe('11th');
    expect(formatCounter(12, NumberFormat.Ordinal)).toBe('12th');
    expect(formatCounter(13, NumberFormat.Ordinal)).toBe('13th');
    expect(formatCounter(21, NumberFormat.Ordinal)).toBe('21st');
    expect(formatCounter(111, NumberFormat.Ordinal)).toBe('111th');
  });

  it('renders nothing for bullet, none, or a format it does not know', () => {
    // The caller supplies the literal marker; an unknown name must not fall back
    // to a number that looks authoritative but is wrong.
    expect(formatCounter(5, NumberFormat.Bullet)).toBe('');
    expect(formatCounter(5, NumberFormat.None)).toBe('');
    expect(formatCounter(5, 'koreanCounting')).toBe('');
  });

  it('renders nothing below 1, where these formats have no representation', () => {
    expect(formatCounter(0, NumberFormat.UpperRoman)).toBe('');
    expect(formatCounter(0, NumberFormat.LowerLetter)).toBe('');
  });
});
