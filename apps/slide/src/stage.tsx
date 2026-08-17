import { useLayoutEffect, useRef, useState } from 'react';
import { SLIDE_16_9, fitScale, twipToPx } from '@barocss/office-slides';

/**
 * Where the deck is drawn.
 *
 * Two things happen here and neither touches the document.
 *
 * **Fitting.** A slide is 1280x720 CSS pixels and a window is not, so the whole
 * deck is scaled with `transform`. Visual and exact, never CSS `zoom`, for the
 * reason Word's zoom states at length: `zoom` re-lays-out, so every box rounds
 * again and measured positions drift from computed ones. A transform leaves the
 * layout alone, which is what lets a slide be authored at one size and shown at
 * another without moving anything on it.
 *
 * A transformed element still takes up its *unscaled* room, so the outer frame
 * is sized to what the scaled deck actually occupies — measured from the
 * untransformed box, which is the one thing a transform leaves alone.
 *
 * **Focus.** A deck app shows one slide, and the others are still in the
 * document and still rendered. Which one shows is a *stylesheet* rather than a
 * DOM write: the view owns every element inside the host and rewrites their
 * attributes on each render, so anything this set directly would last until the
 * next keystroke. A rule keyed on the sid the renderer already emits survives,
 * because it is not in the tree at all.
 */
export function Stage({
  host,
  focus,
  zoom,
  fill
}: {
  host: React.RefObject<HTMLDivElement | null>;
  /** The slide to show alone, or nothing to show the deck as a strip. */
  focus?: string;
  /** `undefined` fits the pane; a number is what the reader asked for. */
  zoom?: number;
  /**
   * Fill the space, however large.
   *
   * Presenting is the one case where a slide is drawn above its natural size: a
   * projector is exactly what the editor's cap exists to avoid, and refusing to
   * grow would leave a 1280px slide adrift in the middle of a 4K display.
   */
  fill?: boolean;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const box = frame.current;
    const content = inner.current;
    if (!box || !content) return;

    const measure = () => {
      const style = getComputedStyle(box);
      const room = {
        width: box.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0),
        height: box.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0)
      };

      /**
       * Fit to both when one slide is shown, and to the width when the whole
       * deck is: a strip is scrolled, so its height is not a constraint, and
       * fitting to it would draw every slide too small to read.
       */
      setScale(
        zoom ??
          fitScale(
            SLIDE_16_9,
            focus ? room : { width: room.width, height: Number.MAX_SAFE_INTEGER },
            fill ? { max: Infinity } : {}
          )
      );

      // `offsetWidth`/`offsetHeight` are the untransformed box; the drawn one
      // already has the scale in it and would compound on every measure.
      if (content.offsetWidth > 0) {
        setSize({ width: content.offsetWidth, height: content.offsetHeight });
      }
    };
    measure();

    // The deck grows as slides are added and the window changes under it.
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, [focus, zoom, fill]);

  return (
    <div className="sl-stage" ref={frame} data-focus={focus ?? ''}>
      {/*
       * The rule that shows one slide. Generated rather than written in the
       * stylesheet because it names a sid, and a sid is a fact about this
       * document rather than about the product.
       */}
      {focus && (
        <style>{`.sl-stage[data-focus="${focus}"] .sl-slide:not([data-bc-sid="${focus}"]) { display: none; }`}</style>
      )}

      <div
        className="sl-stage-frame"
        style={
          size
            ? { width: size.width * scale, height: size.height * scale }
            : { width: twipToPx(SLIDE_16_9.width) * scale }
        }
      >
        <div
          ref={inner}
          className="sl-stage-scaled"
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {/* The editor owns this element's subtree; React creates it and stops. */}
          <div ref={host} className="sl-host" />
        </div>
      </div>
    </div>
  );
}
