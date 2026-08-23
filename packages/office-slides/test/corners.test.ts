import { describe, it, expect } from 'vitest';
import { cornerCss } from '../src/corners';

/**
 * How round each corner is.
 *
 * The behaviour worth pinning down is the fallback: a corner with no number of
 * its own follows the single radius, so the one field still rounds the whole box
 * and the four are an override. A `default: 0` on each corner would have made
 * that impossible — four zeroes nobody wrote, shadowing the radius the document
 * does carry — and it would have looked like the schema working.
 */
describe('how round the corners are', () => {
  it('is nothing at all when the box is square', () => {
    expect(cornerCss(undefined)).toEqual({});
    expect(cornerCss({ cornerRadius: 0 })).toEqual({});
  });

  it('is one value when every corner agrees', () => {
    // 144 twips is a tenth of an inch, which is 9.6px.
    expect(cornerCss({ cornerRadius: 144 })).toEqual({ borderRadius: '9.6px' });
  });

  it('lets one corner override the radius the box carries', () => {
    expect(cornerCss({ cornerRadius: 144, cornerTopLeft: 288 })).toEqual({
      borderRadius: '19.2px 9.6px 9.6px 9.6px'
    });
  });

  /** Clockwise from the top left, which is CSS's order and every tool's. */
  it('writes them clockwise from the top left', () => {
    expect(
      cornerCss({
        cornerTopLeft: 144,
        cornerTopRight: 288,
        cornerBottomRight: 432,
        cornerBottomLeft: 576
      })
    ).toEqual({ borderRadius: '9.6px 19.2px 28.8px 38.4px' });
  });

  /** A square corner on a rounded box is a corner set to zero, not an absent one. */
  it('takes a zero corner as square, not as "follow the radius"', () => {
    expect(cornerCss({ cornerRadius: 144, cornerBottomLeft: 0, cornerBottomRight: 0 })).toEqual({
      borderRadius: '9.6px 9.6px 0px 0px'
    });
  });

  it('ignores a corner that is not a length', () => {
    expect(cornerCss({ cornerRadius: 144, cornerTopLeft: -20 })).toEqual({
      borderRadius: '9.6px'
    });
    expect(cornerCss({ cornerRadius: 144, cornerTopRight: '288' as never })).toEqual({
      borderRadius: '9.6px'
    });
  });
});
