import { describe, it, expect } from 'vitest';
import { sizingCss } from '../src/sizing';
import { attrsThrough } from '../src/responsive';
import { scopesFor } from '../src/breakpoints';

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

/**
 * **순서** — the one thing an override could not say.
 *
 * `overrides` could say a different gap, padding, width, and whether a block is on this width at
 * all. It could not say a different **order**, so a page whose picture sits beside its words on a
 * desktop and should be *above* them on a phone had one answer: two blocks, one hidden at each
 * width — two copies of the same picture, which is the drift this model exists to avoid.
 */
describe('where in its stack a block is drawn', () => {
  it('writes nothing when the node says nothing', () => {
    /**
     * The subtlety, and it is the whole of why this is not a fallback of `0`.
     *
     * `order: 0` is a **real** CSS value: it puts a child before every child with a positive order
     * and after every negative one. So writing 0 for silence would make one block saying `order: 1`
     * send every other block in the page in front of it — a document saying something nobody wrote.
     */
    expect(sizingCss({}).order).toBeUndefined();
    expect(sizingCss({ sizing: 'fill' }).order).toBeUndefined();
    expect(sizingCss(undefined).order).toBeUndefined();
  });

  it('is written wherever the node says one, including zero', () => {
    /* Zero said out loud is a reader putting this before everything positive, which is a choice. */
    expect(sizingCss({ order: 0 }).order).toBe('0');
    expect(sizingCss({ order: -1 }).order).toBe('-1');
    expect(sizingCss({ order: 2 }).order).toBe('2');
    /* A number that is not one is not a decision — the same rule every length here follows. */
    expect(sizingCss({ order: Number.NaN }).order).toBeUndefined();
    expect(sizingCss({ order: '앞' as never }).order).toBeUndefined();
  });

  it('applies to every kind of stack, which is why it is before the branches', () => {
    /*
     * A scrolling row, a grid and an ordinary stack all lay their children out in order, and this is
     * the one thing that changes which order that is. Written before the branch that returns early
     * for a scrolling row, or a swipeable strip would be the one place it did not work.
     */
    expect(sizingCss({ order: 3, sizing: 'fill' }, true).order).toBe('3');
    expect(sizingCss({ order: 3, sizing: 'hug' }).order).toBe('3');
    expect(sizingCss({ order: 3, sizing: 'share', share: 2 }).order).toBe('3');
  });

  it('is a per-width answer, which is the point of adding it', () => {
    /**
     * The reason it is on the node rather than on the parent: `overrides` names attributes of **this**
     * node, so a width can say a different one — and a picture that is second on a desktop and first
     * on a phone is one picture, said twice about, rather than two pictures.
     */
    const said = { order: 2, overrides: { mobile: { order: -1 } } };
    expect(sizingCss(attrsThrough(said, scopesFor('desktop'))).order).toBe('2');
    expect(sizingCss(attrsThrough(said, scopesFor('mobile'))).order).toBe('-1');
  });
});
