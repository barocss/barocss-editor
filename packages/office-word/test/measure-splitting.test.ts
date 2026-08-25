import { describe, it, expect } from 'vitest';
import { wrapsText } from '@barocss/office-text';

/**
 * Which blocks may be split across a page boundary.
 *
 * The pass terminates because applying a layout cannot change what it measured.
 * A gap drawn inside a paragraph is the one thing that can — but only when the
 * paragraph holds a picture the text runs around, because then the lines beside
 * the picture are short and the ones past it are full width, and moving the tail
 * to the next page re-flows it into a different number of lines than the one
 * that was measured.
 */
describe('a picture the text runs around', () => {
  it('is the wrapping kind, and the others are not', () => {
    expect(wrapsText({ wrap: 'square' })).toBe(true);
    expect(wrapsText({ wrap: 'tight' })).toBe(true);

    // An inline picture is a very large character: it makes its line taller and
    // changes nothing about the lines around it.
    expect(wrapsText({ wrap: 'inline' })).toBe(false);
    expect(wrapsText({})).toBe(false);
    // Behind and in front of the text take part in no line at all
    expect(wrapsText({ wrap: 'behind' })).toBe(false);
    expect(wrapsText({ wrap: 'front' })).toBe(false);
    // ...and one above and below the text keeps whole lines whole
    expect(wrapsText({ wrap: 'topAndBottom' })).toBe(false);
  });
});
