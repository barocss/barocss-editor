import { describe, it, expect } from 'vitest';
import { authorColor, revisionTitle } from '../src/revisions';

/**
 * A document revised by three people is only readable if each one's changes look
 * different — which makes the author a value, not a class name.
 */
describe('the colour a reviewer gets', () => {
  it('is the same every time, so a reader can learn it', () => {
    expect(authorColor('Jinho')).toBe(authorColor('Jinho'));
  });

  it('is different for different reviewers', () => {
    // Hashing straight to a hue put these two six degrees apart — the same
    // colour, to a reader.
    expect(authorColor('Jinho')).not.toBe(authorColor('Sujin'));
  });

  it('does not depend on the order they edited in', () => {
    // Otherwise a reviewer's colour changes when someone else's edit is accepted
    const before = ['Kim', 'Lee', 'Park'].map(authorColor);
    const after = ['Park', 'Kim', 'Lee'].map(authorColor);
    expect(after).toEqual([before[2], before[0], before[1]]);
  });

  it('has a colour for a revision with no author', () => {
    expect(authorColor(undefined)).toBeTruthy();
    expect(authorColor(undefined)).not.toBe(authorColor('Kim'));
  });
});

describe('what a revision says when pointed at', () => {
  it('names the author and the date', () => {
    expect(revisionTitle('insertion', { author: 'Kim', date: '2026-08-05' })).toBe(
      'insertion by Kim, 2026-08-05'
    );
  });

  it('manages without a date', () => {
    expect(revisionTitle('deletion', { author: 'Kim' })).toBe('deletion by Kim');
  });

  it('says so when the author is unknown, rather than saying nothing', () => {
    expect(revisionTitle('insertion', {})).toBe('insertion by Unknown');
  });
});
