import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * An **infinite canvas**: where the plane is, how large it is drawn, and the gestures that change
 * both.
 *
 * ## Why this exists beside `useWheelZoom`
 *
 * `useWheelZoom` scales a plane inside a **scrolling pane** and corrects the scroll afterwards so
 * that the point under the pointer stays put. Three measured corrections went into it and it is
 * right about all three — and it cannot do the thing a canvas has to do, for a reason its own
 * comment states plainly:
 *
 * > It gives way at the edges and must: holding a point near the left of the content while the pane
 * > is already at `scrollLeft: 0` would need a negative scroll, which no pane has.
 *
 * That edge is not an edge case. A page builder opens with the boards **fitted to the pane**, so the
 * scroll is at zero in both axes and there is nothing to correct with: every zoom pins the top-left
 * corner, which is exactly what a reader sees and reports. Zooming *out* can never be anchored at
 * all, because the correction it needs is always negative.
 *
 * ## What this does instead
 *
 * Holds the plane's own **offset** and scale, and draws it with `translate(x, y) scale(z)`. There is
 * no scrollbar and no scroll to correct: the arithmetic is exact and needs no measurement after the
 * commit.
 *
 *     x' = px - (px - x) · (z'/z)
 *
 * where `px` is the pointer in the pane's own coordinates. The point under the pointer stays under
 * it at any zoom, in any direction, at any offset — including outward from a fitted view, which is
 * the case the scrolling version cannot express.
 *
 * Every tool of this kind is built this way, and the reason is this one property rather than taste.
 *
 * ## The gestures, and why the plain wheel is one of them
 *
 * ⌘ or Ctrl with the wheel zooms about the pointer. A **plain** wheel pans, and shift swaps the
 * axis — which is what a canvas without scrollbars must do, because otherwise a reader who has
 * zoomed in has no way to reach the rest of the plane except a modifier they have to know about.
 * The browser's own scrolling is prevented for both, and the hit test is the pane's rectangle rather
 * than the event's target: a canvas draws a selection layer over its pane, so asking what the event
 * hit answers "the overlay" and a listener scoped to the pane never runs.
 */

/**
 * One step of a zoom, and the reason there is a constant at all.
 *
 * ## The two ladders that were not each other's inverse
 *
 * Measured in the site builder, keyboard only: **⌘+ five times then ⌘− five times left the reader at
 * 69% having started at 70%.** The steps were `round(z * 110) / 100` and `round(z * 90) / 100` —
 * two numbers that are not inverses (1.1 × 0.9 = 0.99), with a round-to-two-decimals inside each one
 * compounding it. Every round trip drifted, and a reader who zooms to look at something and back is
 * making round trips all day.
 *
 * The `ZoomControl`'s own buttons had it right — `z * 1.25` and `z / 1.25`, which *are* inverses and
 * do not round — so the suite already held the answer in one place and the wrong answer in another.
 * Now there is one, and it is a multiplier rather than a table of stops: a table needs a rule for
 * *where a zoom that is not on it goes next*, and a reader who typed 83% into the box is entitled to
 * step from 83%.
 *
 * 1.25 rather than 1.1, because a step a reader cannot see is a step they press again.
 */
export const ZOOM_STEP = 1.25;

/** One step in, and one step out — an exact pair, which is the whole point. */
export const zoomIn = (zoom: number) => zoom * ZOOM_STEP;
export const zoomOut = (zoom: number) => zoom / ZOOM_STEP;

export interface Viewport {
  /** Where the plane's origin sits in the pane, in the pane's own pixels. */
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportControls {
  /** Zoom to a scale, holding a point still — the pointer's, or the middle of the view. */
  zoomAt: (next: number, point?: { x: number; y: number }) => void;
  /** Move the plane by a distance in the pane's pixels. */
  panBy: (dx: number, dy: number) => void;
  /**
   * Put a drawing of this size in view: as large as it goes up to `max`, centred across, and
   * `padding` from the top.
   *
   * The size is the **unscaled** one — what the plane measures at zoom 1 — because that is the only
   * size a caller can state without knowing what the zoom currently is.
   */
  fitTo: (
    size: { width: number; height: number },
    options?: {
      padding?: number;
      max?: number;
      /**
       * Fit the **width** only, and let the drawing run off the bottom.
       *
       * A page is read top to bottom and is as tall as it turns out, so fitting its height is
       * fitting a number that means nothing: measured on the site builder's opening view, the plane
       * was 5,000px tall inside a 928px pane and the boards came out at **0.19** — a page drawn at a
       * fifth of its size, with every click landing on whatever was 8px from a corner.
       */
      only?: 'width';
    }
  ) => void;
}

export function useViewport({
  pane,
  view,
  onView,
  min = 0.05,
  max = 8,
  step = 1.1
}: {
  pane: RefObject<HTMLElement | null>;
  view: Viewport;
  onView: (next: Viewport) => void;
  min?: number;
  max?: number;
  step?: number;
}): ViewportControls {
  /**
   * The current view and callback, read through a ref.
   *
   * The listener is attached once; without this it would have to be re-attached on every change of
   * the view, which is every frame of a pan. `useWheelZoom` learned the same thing the harder way —
   * a dependency on an inline callback made its correction run on every render and consume itself.
   */
  const latest = useRef({ view, onView });
  latest.current = { view, onView };

  const clamp = useCallback((zoom: number) => Math.min(max, Math.max(min, zoom)), [min, max]);

  const zoomAt = useCallback(
    (next: number, point?: { x: number; y: number }) => {
      const host = pane.current;
      if (!host) return;

      const rect = host.getBoundingClientRect();
      const at = point ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const px = at.x - rect.left;
      const py = at.y - rect.top;

      const { view: now, onView: emit } = latest.current;
      const zoom = clamp(next);
      if (zoom === now.zoom) return;

      const factor = zoom / now.zoom;
      emit({
        zoom,
        // The point under the pointer is the same point on the plane before and after.
        x: px - (px - now.x) * factor,
        y: py - (py - now.y) * factor
      });
    },
    [pane, clamp]
  );

  const panBy = useCallback((dx: number, dy: number) => {
    const { view: now, onView: emit } = latest.current;
    emit({ ...now, x: now.x + dx, y: now.y + dy });
  }, []);

  const fitTo = useCallback(
    (
      size: { width: number; height: number },
      options?: { padding?: number; max?: number; only?: 'width' }
    ) => {
      const host = pane.current;
      if (!host || size.width <= 0 || size.height <= 0) return;

      const padding = options?.padding ?? 48;
      const ceiling = options?.max ?? 1;
      const across = (host.clientWidth - padding * 2) / size.width;
      const down = (host.clientHeight - padding * 2) / size.height;
      const zoom = clamp(Math.min(ceiling, across, options?.only === 'width' ? across : down));

      latest.current.onView({
        zoom,
        // Centred across, and near the top down: a page is read from the top and a reader who has to
        // scroll up to see the first section has been shown the middle of something.
        x: Math.max(padding, (host.clientWidth - size.width * zoom) / 2),
        y: padding
      });
    },
    [pane, clamp]
  );

  useEffect(() => {
    const host = pane.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      // The rectangle, not the target: a canvas draws a layer over its pane, so the event's target
      // is that layer and a listener scoped to the pane would never run.
      const rect = host.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientY >= rect.top &&
        event.clientX <= rect.right &&
        event.clientY <= rect.bottom;
      if (!inside) return;

      // Before anything else: the browser's own page zoom is what this gesture means to the browser,
      // and a pane with no scrollbars still scrolls its ancestors.
      event.preventDefault();

      if (event.ctrlKey || event.metaKey) {
        const { view: now } = latest.current;
        zoomAt(now.zoom * (event.deltaY < 0 ? step : 1 / step), { x: event.clientX, y: event.clientY });
        return;
      }

      /*
       * A plain wheel **pans**, and shift swaps the axis.
       *
       * A canvas with no scrollbars has to answer the wheel with something, and the only honest
       * answer is the one every such tool gives: move the plane. A reader zoomed in with no way to
       * reach the rest of it except a modifier is a reader stuck.
       */
      const dx = event.shiftKey ? -event.deltaY : -event.deltaX;
      const dy = event.shiftKey ? 0 : -event.deltaY;
      panBy(dx, dy);
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true } as never);
  }, [pane, step, zoomAt, panBy]);

  return { zoomAt, panBy, fitTo };
}
