import { describe, it, expect } from 'vitest';
import { fitGroupToChildren } from '../src/group-bounds';

/**
 * A group's box is the bounds of what is in it.
 *
 * A group is not a shape a reader drew — it is the fact that these things move
 * together — so its rectangle has one honest value. Nothing kept it there:
 * measured in the deck, a child nudged 6000 twips to the right stuck that far
 * out of a group whose width never changed, and everything that reads a group's
 * box — handles, marquee, hit test, aligning — was reading a rectangle that had
 * stopped describing its contents.
 */
const at = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const child = (sid: string, x: number, y: number, width: number, height: number) => ({
  sid,
  placement: at(x, y, width, height)
});

describe('fitting a group to its children', () => {
  it('says nothing when the box already agrees', () => {
    const fit = fitGroupToChildren(at(100, 100, 400, 300), [
      child('a', 0, 0, 200, 300),
      child('b', 200, 0, 200, 100)
    ]);
    expect(fit.group).toBeUndefined();
    expect(fit.children.size).toBe(0);
  });

  /**
   * The case that was measured. A child moves right and the group grows to the
   * right — its origin has not moved, so nothing inside has to shift.
   */
  it('grows to reach a child that moved out to the right', () => {
    const fit = fitGroupToChildren(at(10080, 3360, 7680, 5760), [
      child('a', 6000, 0, 7680, 5760),
      child('b', 480, 480, 6720, 4800)
    ]);

    expect(fit.group).toEqual({ x: 10080 + 480, y: 3360, width: 13200, height: 5760 });
    // The origin moved right by 480, so both children shift left by the same.
    expect(fit.children.get('a')).toEqual({ x: 5520, y: 0 });
    expect(fit.children.get('b')).toEqual({ x: 0, y: 480 });
  });

  /**
   * The half that makes it invisible. A child above or left of the origin pulls
   * the group up to meet it, and every child shifts the other way by the same
   * amount — without that the group would jump across the slide the moment one
   * child was nudged.
   */
  it('moves the group to its children, and the children back', () => {
    const fit = fitGroupToChildren(at(1000, 1000, 500, 500), [
      child('a', -200, -100, 300, 300),
      child('b', 100, 100, 400, 400)
    ]);

    expect(fit.group).toEqual({ x: 800, y: 900, width: 700, height: 600 });
    expect(fit.children.get('a')).toEqual({ x: 0, y: 0 });
    expect(fit.children.get('b')).toEqual({ x: 300, y: 200 });
  });

  it('tightens around children that have shrunk away from the edges', () => {
    const fit = fitGroupToChildren(at(0, 0, 1000, 1000), [child('a', 100, 100, 200, 200)]);
    expect(fit.group).toEqual({ x: 100, y: 100, width: 200, height: 200 });
    expect(fit.children.get('a')).toEqual({ x: 0, y: 0 });
  });

  /**
   * An empty group is left alone rather than collapsed to nothing: a group with
   * no children is a group being emptied, and a zero box would make it
   * unselectable before the reader had finished.
   */
  it('leaves a group with nothing in it alone', () => {
    const fit = fitGroupToChildren(at(10, 10, 100, 100), []);
    expect(fit.group).toBeUndefined();
    expect(fit.children.size).toBe(0);
  });

  /**
   * Settling in one pass is what lets this run on every content change without
   * feeding itself: the answer to an already-fitted group is nothing at all.
   */
  it('settles: fitting the result again changes nothing', () => {
    const first = fitGroupToChildren(at(10080, 3360, 7680, 5760), [
      child('a', 6000, 0, 7680, 5760),
      child('b', 480, 480, 6720, 4800)
    ]);

    const second = fitGroupToChildren(first.group, [
      { sid: 'a', placement: { ...first.children.get('a')!, width: 7680, height: 5760 } },
      { sid: 'b', placement: { ...first.children.get('b')!, width: 6720, height: 4800 } }
    ]);

    expect(second.group).toBeUndefined();
    expect(second.children.size).toBe(0);
  });
});
