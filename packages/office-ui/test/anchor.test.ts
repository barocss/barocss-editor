import { describe, it, expect } from 'vitest';
import { anchorOf, anchorShift } from '../src/wheel-zoom';

/**
 * Keeping the point under the pointer while the content is redrawn larger.
 *
 * Moved here with `useWheelZoom`, from `office-slides`, where the gesture had been
 * worked out and Word could not reach it — Word zoomed about its pane's origin, so
 * zooming in on a paragraph half way down the page walked that paragraph off the
 * screen. The tests came unchanged; what they describe was never a slide's.
 *
 * A reader zooming in is asking to look more closely at the thing under the
 * pointer. Change the scale without the scroll and that thing slides away.
 */
describe('keeping the point under the pointer', () => {
  const content = { left: 100, top: 50, width: 400, height: 200 };

  it('describes the point as a fraction, which survives a redraw', () => {
    expect(anchorOf({ x: 300, y: 150 }, content)).toEqual({ x: 0.5, y: 0.5 });
    expect(anchorOf({ x: 100, y: 50 }, content)).toEqual({ x: 0, y: 0 });
  });

  it('answers with the scroll that puts it back', () => {
    const anchor = anchorOf({ x: 300, y: 150 }, content);
    // Redrawn twice the size from the same origin: the middle is now at 500.
    const bigger = { left: 100, top: 50, width: 800, height: 400 };
    expect(anchorShift({ x: 300, y: 150 }, bigger, anchor)).toEqual({ dx: 200, dy: 100 });
  });

  it('asks for nothing when nothing moved', () => {
    const anchor = anchorOf({ x: 300, y: 150 }, content);
    expect(anchorShift({ x: 300, y: 150 }, content, anchor)).toEqual({ dx: 0, dy: 0 });
  });

  /**
   * The correction this replaced.
   *
   * The first version computed the new scroll from the old one, assuming the
   * content's origin was `-scrollLeft`. It is not: the stage centres the
   * slide while it is smaller than the pane, so the origin carries a margin
   * that changes as the zoom crosses the point where the slide stops
   * fitting. Measured drift on a four-notch zoom in the browser: 12% of the
   * slide's width.
   */
  it('does not care how the content got where it is', () => {
    const anchor = anchorOf({ x: 300, y: 150 }, content);
    // Same size, moved by a centring margin nobody told it about.
    const shifted = { left: 260, top: 50, width: 400, height: 200 };
    expect(anchorShift({ x: 300, y: 150 }, shifted, anchor)).toEqual({ dx: 160, dy: 0 });
  });

  it('centres on a content with no size, rather than dividing by zero', () => {
    expect(anchorOf({ x: 1, y: 2 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0.5,
      y: 0.5
    });
  });
});
