import { describe, it, expect } from 'vitest';
import { sizingCss } from '../src/sizing';

/**
 * **What a child of a stack does with the space along the axis** — and the fourth answer, which is
 * the one a page could not give.
 *
 * Two columns at 40 and 60 is an ordinary layout and there was no way to write it: `fill` on both
 * makes them equal, and `fixed` in twips breaks at every other width. That is the boundary a document
 * keeping **absolute** lengths runs into — the schema's own type system has no union, so a length
 * that is sometimes twips and sometimes a string with a unit cannot be declared — and a share is what
 * could be added without lying.
 */
describe('a share of the row', () => {
  it('grows by its own number, from nothing', () => {
    /*
     * `flex: <n> 1 0%`. Starting from **nothing** is the half that makes it a share rather than a
     * nudge: with `flex-basis: auto` the content's own width comes out first, so two blocks at 1 and
     * 2 land at 55/45 the moment one of them holds a long word.
     */
    expect(sizingCss({ sizing: 'share', share: 2 }).flex).toBe('2 1 0%');
    expect(sizingCss({ sizing: 'share', share: 1 }).flex).toBe('1 1 0%');
  });

  it('is one share when nothing is said, which is fill said another way', () => {
    // The honest reading of a reader who chose the mode and has not yet said how much.
    expect(sizingCss({ sizing: 'share' }).flex).toBe('1 1 0%');
    expect(sizingCss({ sizing: 'share', share: 0 }).flex).toBe('1 1 0%');
    expect(sizingCss({ sizing: 'share', share: -3 }).flex).toBe('1 1 0%');
  });

  it('survives a long word, the way fill does', () => {
    // A flex item's `min-width` is its content unless it is told otherwise, and one unbreakable
    // string in one card pushes every other card narrower and the row past its container.
    expect(sizingCss({ sizing: 'share', share: 3 }).minWidth).toBe('0');
  });

  it('says nothing at all unless the block asked for it', () => {
    /*
     * A share on a block that has not said `sizing: 'share'` is a number the drawing has no use for,
     * and writing it anyway would be the drawing claiming something the browser ignores — which is
     * also why the harness exempts the attribute rather than seeing it.
     */
    expect(sizingCss({ sizing: 'fill', share: 4 }).flex).toBe('1 1 0%');
    expect(sizingCss({ sizing: 'hug', share: 4 }).flex).toBe('0 0 auto');
    expect(sizingCss({ share: 4 }).flex).toBeUndefined();
  });

  it('leaves the other three exactly as they were', () => {
    expect(sizingCss({ sizing: 'fill' }).flex).toBe('1 1 0%');
    expect(sizingCss({ sizing: 'hug' }).width).toBe('fit-content');
    expect(sizingCss({ sizing: 'fixed' }).flex).toBe('none');
  });
});
