import { describe, it, expect } from 'vitest';
import { layoutMoves } from '../src/layout-arrange';

/**
 * Applying a layout to a slide that already has something on it.
 *
 * Canva's *Layouts* tab, and the question readers actually ask: "make this page look like
 * that one" — with content that already exists. The rule is the formatting cascade's, and
 * repeating it is the point: **matched by role, never by position.**
 */
describe('putting a slide into a layout', () => {
  const box = (sid: string, role: string | undefined, x: number, y: number) => ({
    sid,
    role,
    box: { x, y, width: 1000, height: 1000 }
  });
  const slot = (role: string | undefined, x: number, y: number) => ({
    role,
    box: { x, y, width: 2000, height: 900 }
  });

  it('moves each box into the slot for what it is', () => {
    const moves = layoutMoves(
      [box('t', 'title', 0, 0), box('b', 'body', 0, 5000)],
      [slot('body', 500, 4000), slot('title', 500, 500)]
    );
    // By role: the title goes to the title's slot even though it is second in the layout.
    expect(moves).toEqual([
      { sid: 't', box: { x: 500, y: 500, width: 2000, height: 900 } },
      { sid: 'b', box: { x: 500, y: 4000, width: 2000, height: 900 } }
    ]);
  });

  it('never pairs by position', () => {
    /*
     * A slide may have moved its title, added boxes the layout never had, or deleted one.
     * Pairing the third box with the third slot moves the wrong one, and does it more often
     * the more a reader has edited — the worst failure shape there is, because it looks like
     * the tool rearranging your work at random.
     */
    const moves = layoutMoves(
      [box('note', 'note', 100, 100), box('t', 'title', 0, 0)],
      [slot('title', 900, 900)]
    );
    expect(moves).toEqual([{ sid: 't', box: { x: 900, y: 900, width: 2000, height: 900 } }]);
  });

  it('leaves alone what the layout says nothing about', () => {
    // Nothing is added and nothing is deleted: a box with a role the layout does not
    // declare keeps its place, which is the honest answer rather than a guess.
    expect(layoutMoves([box('x', 'chart', 0, 0)], [slot('title', 500, 500)])).toEqual([]);
    expect(layoutMoves([box('x', undefined, 0, 0)], [slot('title', 500, 500)])).toEqual([]);
  });

  it('fills a slot once', () => {
    // Two titles on one slide is a document a reader can make, and the second is not a
    // title the layout has anywhere to put — so it keeps its place rather than being
    // stacked on the first.
    const moves = layoutMoves(
      [box('a', 'title', 0, 0), box('b', 'title', 0, 2000)],
      [slot('title', 500, 500)]
    );
    expect(moves).toHaveLength(1);
    expect(moves[0].sid).toBe('a');
  });

  it('answers nothing when the slide is already arranged that way', () => {
    // A transaction of no-ops is an undo entry a reader watches do nothing.
    const already = [
      { sid: 't', role: 'title', box: { x: 500, y: 500, width: 2000, height: 900 } }
    ];
    expect(layoutMoves(already, [slot('title', 500, 500)])).toEqual([]);
  });

  it('ignores a slot with no role, which is decoration rather than a place', () => {
    // A layout may draw a rule or a logo. Those are not slots to put a reader's box in.
    expect(layoutMoves([box('t', 'title', 0, 0)], [slot(undefined, 100, 100)])).toEqual([]);
  });
});
