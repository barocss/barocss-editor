import { describe, it, expect } from 'vitest';
import {
  SLIDE_16_9,
  SLIDE_4_3,
  boxOf,
  fitScale,
  isVisible,
  placementCss,
  pxToTwip,
  slideSize,
  twipToPx
} from '../src/geometry';

/**
 * The whole layout engine for the product, which is why it fits in one test
 * file that runs in milliseconds. A slide places rather than flows, so there is
 * no measurement loop to converge and nothing here needs a browser.
 */
describe('where a thing sits on a slide', () => {
  describe('the unit', () => {
    it('converts exactly, so placement never drifts', () => {
      // A twip is 1/1440in and a CSS pixel is 1/96in, so 15 twips is one pixel
      // with nothing left over — the reason the model can stay in twips and the
      // screen can stay in pixels without a rounding policy between them.
      expect(twipToPx(15)).toBe(1);
      expect(twipToPx(SLIDE_16_9.width)).toBe(1280);
      expect(twipToPx(SLIDE_16_9.height)).toBe(720);
      expect(twipToPx(SLIDE_4_3.width)).toBe(960);
    });

    it('round-trips', () => {
      for (const twips of [0, 1, 15, 4321, 19200]) {
        expect(pxToTwip(twipToPx(twips))).toBeCloseTo(twips, 9);
      }
    });
  });

  describe('a box from what the node carries', () => {
    it('is what the node says when the node says it', () => {
      expect(boxOf({ x: 100, y: 200, width: 300, height: 400 })).toEqual({
        x: 100,
        y: 200,
        width: 300,
        height: 400
      });
    });

    it('normalises a negative extent, which is a handle dragged past the far edge', () => {
      // Dragging the right handle to the left of the left edge. The box is real
      // and CSS would draw nothing for it.
      expect(boxOf({ x: 100, y: 100, width: -40, height: -25 })).toEqual({
        x: 60,
        y: 75,
        width: 40,
        height: 25
      });
    });

    it('is zero-sized when nothing set a size, rather than a guess', () => {
      expect(boxOf({ x: 10, y: 10 })).toEqual({ x: 10, y: 10, width: 0, height: 0 });
      expect(boxOf(undefined)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it('ignores a value that is not a number', () => {
      expect(boxOf({ x: NaN, y: Infinity, width: '40' as never, height: 10 })).toEqual({
        x: 0,
        y: 0,
        width: 0,
        height: 10
      });
    });
  });

  describe('the CSS that places it', () => {
    it('is absolute, in pixels, at the model position', () => {
      const css = placementCss({ x: 1440, y: 720, width: 2880, height: 1440 });
      expect(css.position).toBe('absolute');
      expect(css.left).toBe('96px');
      expect(css.top).toBe('48px');
      expect(css.width).toBe('192px');
      expect(css.height).toBe('96px');
    });

    it('turns about the centre, like every drawing tool', () => {
      // Not stated as a transform-origin because the default already is the
      // centre; what matters is that nothing overrides it to a corner.
      const css = placementCss({ x: 0, y: 0, width: 100, height: 100, rotation: 45 });
      expect(css.transform).toBe('rotate(45deg)');
      expect(css.transformOrigin).toBeUndefined();
    });

    it('says nothing at all when a thing is not turned or faded', () => {
      // An identity transform is still a transform, and it makes every shape
      // its own compositing layer. A slide is made of dozens of these.
      const css = placementCss({ x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1 });
      expect(css.transform).toBeUndefined();
      expect(css.opacity).toBeUndefined();
    });

    it('fades and hides when the model says so', () => {
      expect(placementCss({ opacity: 0.5 }).opacity).toBe('0.5');
      expect(placementCss({ visible: false }).display).toBe('none');
      expect(placementCss({ visible: true }).display).toBeUndefined();
    });

    it('has no z-index, because document order is paint order', () => {
      // The model is a tree and a tree is ordered. Bring-to-front is `moveNode`,
      // which already has an inverse — a `zOrder` attribute would be a second
      // ordering to keep agreeing with the first.
      expect(placementCss({ x: 0, y: 0, width: 10, height: 10 }).zIndex).toBeUndefined();
    });

    it('treats a missing `visible` as visible', () => {
      expect(isVisible(undefined)).toBe(true);
      expect(isVisible({})).toBe(true);
      expect(isVisible({ visible: false })).toBe(false);
    });
  });

  describe('how big the slide is', () => {
    it('is 16:9 unless the slide says otherwise', () => {
      expect(slideSize(undefined)).toEqual(SLIDE_16_9);
      expect(slideSize({})).toEqual(SLIDE_16_9);
    });

    it('is whatever the slide says, so a deck can mix sizes', () => {
      expect(slideSize(SLIDE_4_3)).toEqual(SLIDE_4_3);
    });
  });

  describe('fitting one in the space available', () => {
    it('fills the width when the viewport is tall', () => {
      // 1280x720 natural; 640 of width available is exactly half.
      expect(fitScale(SLIDE_16_9, { width: 640, height: 10000 })).toBe(0.5);
    });

    it('fills the height when the viewport is wide', () => {
      expect(fitScale(SLIDE_16_9, { width: 10000, height: 360 })).toBe(0.5);
    });

    it('takes the padding off both sides', () => {
      expect(fitScale(SLIDE_16_9, { width: 680, height: 10000 }, { padding: 20 })).toBe(0.5);
    });

    it('does not grow past natural size by default', () => {
      // Drawing text at 3x makes every hinting and subpixel decision different
      // from the one the reader will see.
      expect(fitScale(SLIDE_16_9, { width: 4000, height: 4000 })).toBe(1);
      expect(fitScale(SLIDE_16_9, { width: 4000, height: 4000 }, { max: 4 })).toBe(3.125);
    });

    it('never returns a negative scale, which would draw the slide mirrored', () => {
      expect(fitScale(SLIDE_16_9, { width: 10, height: 10 }, { padding: 40 })).toBe(0);
    });

    it('survives a slide with no size', () => {
      expect(fitScale({ width: 0, height: 0 }, { width: 100, height: 100 })).toBe(1);
    });
  });
});
