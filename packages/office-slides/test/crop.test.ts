import { describe, it, expect } from 'vitest';
import { cropByHandle, cropCss, isCropped } from '../src/crop';

/**
 * Which part of a picture is shown.
 *
 * The arithmetic is the whole feature: the kept rectangle has to *fill* the box
 * the author placed, which means the picture inside is drawn larger than the box
 * and moved so the kept part lands in it. Getting the scale right and the offset
 * wrong looks like a picture that is nearly cropped, and nearly is a bug report.
 */
describe('which part of a picture is shown', () => {
  it('is all of it, styled with nothing, when nothing is cropped', () => {
    expect(cropCss(undefined)).toEqual({ outer: {}, inner: {} });
    expect(cropCss({ cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 })).toEqual({
      outer: {},
      inner: {}
    });
  });

  /**
   * Half the width taken off the left: what is left is half the source, so the
   * picture is drawn twice the width of the box and moved a whole box-width
   * left — putting the source's midpoint at the box's left edge.
   */
  it('scales and offsets so the kept part fills the box', () => {
    expect(cropCss({ cropLeft: 0.5 })).toEqual({
      outer: { overflow: 'hidden' },
      inner: {
        position: 'absolute',
        width: '200%',
        height: '100%',
        left: '-100%',
        top: '0%'
      }
    });
  });

  it('crops the two axes independently', () => {
    expect(cropCss({ cropTop: 0.25, cropBottom: 0.25, cropRight: 0.5 })).toEqual({
      outer: { overflow: 'hidden' },
      inner: {
        position: 'absolute',
        // Half the width kept, half the height kept.
        width: '200%',
        height: '200%',
        // Nothing off the left, a quarter off the top of a half-height keep.
        left: '0%',
        top: '-50%'
      }
    });
  });

  /** A third is a repeating fraction, and a style attribute is not the place for it. */
  it('rounds to two decimals', () => {
    expect(cropCss({ cropLeft: 1 / 3 }).inner.width).toBe('150%');
    expect(cropCss({ cropTop: 0.1234567 }).inner.height).toBe('114.08%');
  });

  /**
   * A document is a file anyone can write. A crop that keeps nothing would draw
   * an invisible picture the reader cannot select or undo their way out of, and
   * a negative fraction would ask for a negative width.
   */
  it('ignores a crop that would keep nothing, and nonsense', () => {
    expect(cropCss({ cropLeft: 0.6, cropRight: 0.6 })).toEqual({ outer: {}, inner: {} });
    expect(cropCss({ cropLeft: 1 })).toEqual({ outer: {}, inner: {} });
    expect(cropCss({ cropTop: -0.5 })).toEqual({ outer: {}, inner: {} });
    expect(cropCss({ cropLeft: '0.5' as never })).toEqual({ outer: {}, inner: {} });
  });

  it('says whether there is a crop to undo', () => {
    expect(isCropped(undefined)).toBe(false);
    expect(isCropped({ cropLeft: 0, cropBottom: 0 })).toBe(false);
    expect(isCropped({ cropBottom: 0.2 })).toBe(true);
  });
});

/**
 * Dragging a crop handle.
 *
 * The behaviour worth pinning down is that **the picture does not move**: the
 * box shrinks with the handle and the same amount of source comes off that
 * side, so the rest of the picture stays exactly where it was on the slide.
 * Holding the box still and rescaling what is left — the other reading of the
 * same gesture — makes the whole picture jump and zoom while one edge is
 * dragged, and no tool does that.
 */
describe('dragging a crop handle', () => {
  // A picture 1000 wide and 500 tall, at the origin, showing all of itself.
  const placed = { x: 0, y: 0, width: 1000, height: 500 };

  it('takes source off the side that was dragged, in proportion', () => {
    const { box, crop } = cropByHandle(placed, undefined, 'w', { dx: 250, dy: 0 });

    // A quarter of the box's width, so a quarter of the source.
    expect(crop.cropLeft).toBe(0.25);
    expect(crop.cropRight).toBe(0);
    // And the box lost exactly that, from the left: what remains has not moved.
    expect(box).toEqual({ x: 250, y: 0, width: 750, height: 500 });
  });

  it('measures a second crop against what is left of the source', () => {
    const once = cropByHandle(placed, undefined, 'w', { dx: 500, dy: 0 });
    expect(once.crop.cropLeft).toBe(0.5);

    // Half the *remaining* box, which is a quarter of the source on top of the
    // half already gone.
    const twice = cropByHandle(once.box, once.crop, 'w', { dx: 250, dy: 0 });
    expect(twice.crop.cropLeft).toBe(0.75);
  });

  it('crops from the far side without moving the near one', () => {
    const { box, crop } = cropByHandle(placed, undefined, 'e', { dx: -100, dy: 0 });
    expect(crop.cropRight).toBe(0.1);
    expect(crop.cropLeft).toBe(0);
    expect(box).toEqual({ x: 0, y: 0, width: 900, height: 500 });
  });

  it('crops both axes from a corner', () => {
    const { crop } = cropByHandle(placed, undefined, 'se', { dx: -100, dy: -50 });
    expect(crop.cropRight).toBe(0.1);
    expect(crop.cropBottom).toBe(0.1);
  });

  /** Dragging outward is how a crop is taken back. */
  it('gives the picture back when the handle is dragged out again', () => {
    const cropped = cropByHandle(placed, undefined, 'w', { dx: 250, dy: 0 });
    const back = cropByHandle(cropped.box, cropped.crop, 'w', { dx: -250, dy: 0 });

    expect(back.crop.cropLeft).toBe(0);
    expect(back.box).toEqual(placed);
  });

  it('never crops away everything, however far the handle is dragged', () => {
    const { crop } = cropByHandle(placed, undefined, 'w', { dx: 100000, dy: 0 });
    expect(crop.cropLeft).toBeLessThanOrEqual(0.99);
    expect(crop.cropLeft).toBeGreaterThan(0);
  });
});
