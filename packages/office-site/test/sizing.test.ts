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

/**
 * **화면 높이** — the one relative length this document can say, and the measurement that decided it
 * would not be a union in the schema's type system.
 *
 * The debt was written down as *a length that is sometimes twips and sometimes a string with a unit
 * cannot be declared*, with three bad ways to close it: every length becomes a string, a second
 * attribute per length, or validation switched off. Measured against what a page actually wants,
 * three of the four relative lengths were already sayable — a proportion is `share`, a per-width
 * number is an `overrides` entry, a bound is `minWidth`/`maxHeight` — and what was left was **one**
 * idea: a section as tall as the window.
 *
 * One idea is one attribute, and the move `share` already made: a number whose unit is in its name.
 */
describe('a block as tall as the window', () => {
  it('is a count of screens, so half of one is sayable and a boolean would not be', () => {
    expect(sizingCss({ minScreens: 1 }).minHeight).toBe('100dvh');
    expect(sizingCss({ minScreens: 0.5 }).minHeight).toBe('50dvh');
    expect(sizingCss({ minScreens: 2 }).minHeight).toBe('200dvh');
  });

  it('says nothing for silence, and nothing for a number that is not one', () => {
    expect(sizingCss({}).minHeight).toBeUndefined();
    expect(sizingCss({ minScreens: 0 }).minHeight).toBeUndefined();
    expect(sizingCss({ minScreens: -1 }).minHeight).toBeUndefined();
    expect(sizingCss({ minScreens: '한 화면' as never }).minHeight).toBeUndefined();
  });

  it('is `dvh` rather than `vh`, which is a phone and not a preference', () => {
    /*
     * `100vh` on a phone is the window with the address bar **gone**, so a section meant to fill the
     * screen is taller than the screen and the page scrolls by the height of the browser chrome — on
     * the first screenful, which is the one nobody can miss. `dvh` is the same number after the bar
     * retracts.
     */
    expect(sizingCss({ minScreens: 1 }).minHeight).toContain('dvh');
    expect(sizingCss({ minScreens: 1 }).minHeight).not.toMatch(/\d+vh/);
  });

  it('takes the larger when a block says both, rather than one quietly winning', () => {
    /*
     * *At least a screen tall, and never under 400* means both, and on a laptop in a short window
     * the second is what stops it collapsing. CSS takes one `min-height`, so they are combined —
     * which is also the only reading under which neither row in the panel is a lie.
     */
    expect(sizingCss({ minScreens: 1, minHeight: 6000 }).minHeight).toBe('max(400px, 100dvh)');
    expect(sizingCss({ minHeight: 6000 }).minHeight).toBe('400px');
  });

  it('is the board’s own viewport in the editor, because a board is not a window', () => {
    /**
     * The half a stylesheet cannot supply.
     *
     * A board is a `div` on a plane rather than an iframe, so `dvh` inside one is the height of the
     * **editor's** window — the same page would draw a different hero on three boards that differ
     * only in width, and none of them would be the page. So the drawing substitutes the width's own
     * declared viewport, which `breakpoints.ts` has carried since preview mode for exactly the reason
     * this needs: a page has no height of its own, so a builder can only show a typical window.
     *
     * The published page still says `dvh`, and that divergence is the one thing `export.test.ts`
     * lets through when it compares the two drawings.
     */
    expect(sizingCss({ minScreens: 1 }, false, 800).minHeight).toBe('800px');
    expect(sizingCss({ minScreens: 0.5 }, false, 844).minHeight).toBe('422px');
    expect(sizingCss({ minScreens: 1, minHeight: 6000 }, false, 800).minHeight).toBe('max(400px, 800px)');
  });
});
