import { describe, it, expect } from 'vitest';
import { formatDateField } from '../src/date-field';

/**
 * The instant comes from the host, never from the clock. A renderer that reads
 * the clock produces different output on two runs, which no test can pin down
 * and which makes the layout look changed on every pass.
 */
describe('a date field', () => {
  const instant = new Date('2026-08-05T09:07:00Z');

  it('shows nothing when the host gave no instant', () => {
    // Which is also what a document printed on a server with no clock of its own
    // should do, rather than inventing a date
    expect(formatDateField(undefined)).toBe('');
    expect(formatDateField(undefined, 'yyyy-MM-dd')).toBe('');
  });

  it('defaults to the ISO date', () => {
    expect(formatDateField(instant)).toBe('2026-08-05');
  });

  it('honours the picture strings it knows', () => {
    expect(formatDateField(instant, 'd MMMM yyyy')).toBe('5 August 2026');
    expect(formatDateField(instant, 'MMMM d, yyyy')).toBe('August 5, 2026');
    expect(formatDateField(instant, 'dddd')).toBe('Wednesday');
  });

  it('falls back to the date rather than showing the picture', () => {
    // Word does the same with a field it cannot parse, and a reader seeing
    // "yyyy" in their document would find it more alarming than a plain date.
    expect(formatDateField(instant, 'not a pattern')).toBe('2026-08-05');
  });

  it('pads so the widths line up', () => {
    expect(formatDateField(new Date('2026-01-02T00:00:00Z'), 'yyyy-MM-dd')).toBe('2026-01-02');
  });
});
