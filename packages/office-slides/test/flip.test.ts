import { describe, it, expect } from 'vitest';
import { flipCss, flipChange, flipped } from '../src/flip';
import { placementCss } from '../src/geometry';

/**
 * A box mirrored.
 *
 * The arithmetic is small and the two decisions in it are not, so they are what
 * is fixed here: the mirror goes *after* the rotation, and the gesture is a
 * toggle per box.
 */
describe('mirroring a box', () => {
  it('reads the two axes the way every attribute is read', () => {
    expect(flipped({ flipX: true }, 'x')).toBe(true);
    expect(flipped({ flipX: true }, 'y')).toBe(false);
    expect(flipped(undefined, 'x')).toBe(false);
    // Not "anything truthy": a document may hold whatever it holds.
    expect(flipped({ flipX: 'yes' } as never, 'x')).toBe(false);
  });

  it('writes nothing for a box nobody has flipped', () => {
    // `transform` makes an element a containing block, so a shape that has one
    // for no reason positions its children differently from one that does not.
    expect(flipCss(undefined)).toBe('');
    expect(flipCss({ flipX: false, flipY: false })).toBe('');
    expect(flipCss({ flipX: true })).toBe('scaleX(-1)');
    expect(flipCss({ flipX: true, flipY: true })).toBe('scaleX(-1) scaleY(-1)');
  });

  /**
   * Rotation first, and this is the assertion that says so.
   *
   * Rotating a mirrored box and mirroring a rotated one are different pictures.
   * Every tool shows the second — the shape turns as the reader set it and the
   * mirror is applied to the result — which is also what stops a flip from
   * changing the rotation a reader typed.
   */
  it('mirrors after the turn, in one transform', () => {
    const css = placementCss({ x: 0, y: 0, width: 100, height: 100, rotation: 30, flipX: true });
    expect(css.transform).toBe('rotate(30deg) scaleX(-1)');

    // And each half alone, so neither is written when it is not needed.
    expect(placementCss({ x: 0, y: 0, width: 100, height: 100, rotation: 30 }).transform).toBe(
      'rotate(30deg)'
    );
    expect(placementCss({ x: 0, y: 0, width: 100, height: 100, flipY: true }).transform).toBe(
      'scaleY(-1)'
    );
    expect(placementCss({ x: 0, y: 0, width: 100, height: 100 }).transform).toBeUndefined();
  });

  /**
   * A toggle, which is the decision worth keeping: with one mirrored shape and
   * one not, "flip" means *mirror each of them* rather than "make them both
   * mirrored". Every tool means the second, and so does the word.
   */
  it('toggles the box’s own mirror, so it is its own undo', () => {
    expect(flipChange(undefined, 'x')).toEqual({ flipX: true });
    expect(flipChange({ flipX: true }, 'x')).toEqual({ flipX: false });
    // And it touches one axis: flipping left-to-right says nothing about up.
    expect(flipChange({ flipY: true }, 'x')).toEqual({ flipX: true });
    expect(flipChange({ flipX: true }, 'y')).toEqual({ flipY: true });
  });
});
