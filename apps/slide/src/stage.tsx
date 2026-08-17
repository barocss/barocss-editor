import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SLIDE_16_9, anchorOf, anchorShift, clampZoom, fitScale, twipToPx } from '@barocss/office-slides';

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
  onZoom,
  fill
}: {
  host: React.RefObject<HTMLDivElement | null>;
  /** The slide to show alone, or nothing to show the deck as a strip. */
  focus?: string;
  /** `undefined` fits the pane; a number is what the reader asked for. */
  zoom?: number;
  /** Told when the reader zooms with the wheel, so the control agrees. */
  onZoom?: (zoom: number) => void;
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

  /**
   * Zooming with the wheel, anchored to the pointer.
   *
   * Ctrl or Cmd with the wheel is what every reader already tries, and a
   * trackpad pinch arrives as exactly that. The scroll is moved with the scale
   * so the thing under the pointer stays under the pointer — see `zoomAt`;
   * without it, zooming in on a corner of a slide walks the corner off the
   * screen and reads as the tool dodging the reader.
   *
   * `passive: false` because this prevents the browser's own page zoom, and a
   * passive listener is not allowed to.
   *
   * Listened for on the **window**, and answered by where the pointer is rather
   * than by what the event hit. The selection overlay is a fixed layer drawn
   * over the slide and is not inside this pane, so a wheel over the slide never
   * reached a listener on the pane at all — measured, and the count of events
   * seen was zero. Asking "is the pointer over the pane" is the question that
   * survives anything being drawn on top of it, which on a canvas is a
   * certainty rather than a risk.
   */
  useEffect(() => {
    const pane = frame.current;
    if (!pane || !onZoom) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;

      const rect = pane.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (at.x < 0 || at.y < 0 || at.x > rect.width || at.y > rect.height) return;

      event.preventDefault();
      const next = clampZoom(scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
      if (next === scale) return;

      /**
       * Which point of the *slide* is under the pointer, and putting it back
       * after the browser has redrawn at the new size.
       *
       * Measured after the fact rather than predicted. Predicting it means
       * assuming the content's origin is `-scrollLeft`, and it is not: the
       * stage centres the slide while it is smaller than the pane, so the
       * origin carries a margin that changes exactly when the zoom crosses the
       * point where the slide stops fitting. Measured drift that way: 12% of
       * the slide's width over four notches; measured this way, 0.03%.
       *
       * It still gives way at the edges, and must: holding a point near the
       * left of the slide while the pane is already at `scrollLeft: 0` would
       * take a negative scroll, which no pane has. Confirmed rather than
       * assumed — the scroll sat at 0 for every notch while the drift was the
       * whole of the correction it could not apply.
       */
      const drawn = drawnSlide();
      const anchor = drawn
        ? anchorOf({ x: event.clientX, y: event.clientY }, drawn)
        : { x: 0.5, y: 0.5 };

      /**
       * Applied after React has committed the new scale, not on the next frame.
       *
       * `requestAnimationFrame` was tried and is a race: React's render and
       * commit may not have happened by the time the frame runs, so the
       * rectangle measured was still the old one and the correction was
       * computed against a size that no longer existed. Measured residual
       * drift that way: 0.8% of the slide per zoom, which accumulates.
       *
       * A layout effect keyed on the scale runs *after* the commit and before
       * the browser paints, which is exactly the moment the new rectangle is
       * true and nothing has been shown yet.
       */
      pending.current = { pointer: { x: event.clientX, y: event.clientY }, anchor };
      onZoom(next);
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true } as never);
  }, [scale, onZoom]);

  /**
   * Panning, the way every canvas tool does it: hold space and drag.
   *
   * Only useful when the slide is larger than the pane, which is exactly when a
   * reader has zoomed in — and it is the one way to move around that does not
   * require finding a scrollbar.
   */
  /**
   * The slide as it is drawn, which is what the reader is anchored to.
   *
   * Not the scaled container: it holds the whole deck — the hidden definitions,
   * the gaps between slides — so its rectangle is larger than the slide's and by
   * an amount that changes with the zoom. Anchoring on it left a constant 0.8%
   * of the slide's width of drift per zoom, which is small enough to look like
   * rounding and large enough to accumulate.
   */
  const drawnSlide = useCallback((): DOMRect | undefined => {
    const found = inner.current?.querySelector<HTMLElement>('.sl-slide');
    const rect = found?.getBoundingClientRect();
    return rect && rect.width > 0 ? rect : undefined;
  }, []);

  /** A zoom waiting for the layout that follows it; see the wheel handler. */
  const pending = useRef<{
    pointer: { x: number; y: number };
    anchor: { x: number; y: number };
  } | null>(null);

  useLayoutEffect(() => {
    const held = pending.current;
    const pane = frame.current;
    const content = inner.current;
    if (!held || !pane || !content) return;

    pending.current = null;
    const drawn = drawnSlide();
    if (!drawn) return;
    const shift = anchorShift(held.pointer, drawn, held.anchor);
    pane.scrollLeft += shift.dx;
    pane.scrollTop += shift.dy;
  }, [scale]);

  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [spacebar, setSpacebar] = useState(false);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      // Space is a character in the text and a button press on a button.
      if (target?.closest?.('input, textarea, [contenteditable="true"], button')) return;
      event.preventDefault();
      setSpacebar(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacebar(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onPanDown = useCallback(
    (event: React.PointerEvent) => {
      // Space-drag, or the middle button, which is the other thing readers try.
      if (!spacebar && event.button !== 1) return;
      const pane = frame.current;
      if (!pane) return;

      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      panning.current = {
        x: event.clientX,
        y: event.clientY,
        left: pane.scrollLeft,
        top: pane.scrollTop
      };
    },
    [spacebar]
  );

  const onPanMove = useCallback((event: React.PointerEvent) => {
    const held = panning.current;
    const pane = frame.current;
    if (!held || !pane) return;
    pane.scrollLeft = held.left - (event.clientX - held.x);
    pane.scrollTop = held.top - (event.clientY - held.y);
  }, []);

  const onPanUp = useCallback((event: React.PointerEvent) => {
    if (!panning.current) return;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    panning.current = null;
  }, []);

  return (
    <div
      className="sl-stage"
      ref={frame}
      data-focus={focus ?? ''}
      data-panning={spacebar ? 'true' : undefined}
      onPointerDownCapture={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={onPanUp}
      onPointerCancel={onPanUp}
    >
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
