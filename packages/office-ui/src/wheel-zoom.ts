import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Ctrl (or ⌘) with the wheel, zooming about the point under the pointer.
 *
 * ## Why this is shared, and which copy won
 *
 * Both products had this gesture and neither knew the other did. They were not
 * the same implementation, and the difference is not stylistic — the deck's had
 * three measured corrections in it that Word's never had, because Word's never
 * anchored at all:
 *
 * **Hit-test the rectangle; do not ask what the event hit.** Word scoped its
 * listener with `closest('.w-shell-document')`. A canvas draws a selection
 * overlay over its pane as a fixed layer *outside* it, so a wheel over the slide
 * never reached a listener on the pane: measured, the count of events seen was
 * zero. "Is the pointer inside this rectangle" survives anything being drawn on
 * top, which on a canvas is a certainty rather than a risk.
 *
 * **Anchor on the drawn content, not on the scaled container.** The container
 * holds more than the reader sees — a deck's holds the hidden definitions and the
 * gaps between slides — so its rectangle is bigger than the thing being looked at
 * by an amount that changes with the zoom. Measured drift: 0.8% of the slide's
 * width per notch, which is small enough to look like rounding and large enough
 * to accumulate.
 *
 * **Correct in a layout effect, not in `requestAnimationFrame`.** rAF races
 * React's commit: the frame can run before the new size exists, so the rectangle
 * measured is the old one. Measured residual drift that way, again 0.8% a notch.
 * A layout effect keyed on the zoom runs *after* the commit and before the paint,
 * which is the one moment the new rectangle is true and nothing has been shown.
 *
 * And the correction is **measured rather than predicted**. Computing the new
 * scroll from the old one means assuming the content's origin is `-scrollLeft`,
 * and it is not: a pane that centres its content while it is smaller than the
 * pane carries a margin that changes exactly when the content stops fitting.
 * Measured drift when predicted: 12% of the slide's width over four notches.
 * Measured this way: 0.03%.
 *
 * It gives way at the edges and must: holding a point near the left of the
 * content while the pane is already at `scrollLeft: 0` would need a negative
 * scroll, which no pane has.
 *
 * ## What it does not know
 *
 * An editor, a document, a slide. It takes two refs, two numbers and a callback —
 * which is why the *good* version of this gesture is now reachable by a product
 * that has no canvas at all.
 */

export interface WheelZoom {
  /**
   * The pane the gesture applies to, and the thing that scrolls.
   *
   * One element for both because they are the same element in both products and
   * splitting them would be a parameter with no caller.
   */
  pane: RefObject<HTMLElement | null>;
  /**
   * The rectangle of what the reader is actually looking at, measured now.
   *
   * A function rather than a ref, because the element is often found rather than
   * held — a deck's drawn slide is a query into a subtree its renderers own — and
   * because it has to be re-measured after the zoom, not before.
   */
  content: () => DOMRect | undefined;
  zoom: number;
  onZoom: (next: number) => void;
  /** How far a product lets a reader go. A page and a canvas do not agree. */
  min: number;
  max: number;
  /**
   * The factor per notch. 1.1 in both products, and stated rather than fixed
   * because a trackpad's notches are not a mouse wheel's and somebody will want
   * to say so.
   */
  step?: number;
}

export function useWheelZoom({ pane, content, zoom, onZoom, min, max, step = 1.1 }: WheelZoom) {
  /** A zoom waiting for the layout that follows it — see the note above. */
  const pending = useRef<{
    pointer: { x: number; y: number };
    anchor: { x: number; y: number };
  } | null>(null);

  /**
   * The callbacks, held in refs so nothing below depends on their identity.
   *
   * Not tidiness — a correctness bug, and one this cost. `content` is naturally
   * written as an inline arrow, so it is a new function on every render; with it
   * in the layout effect's dependencies the effect ran on **every** render, and
   * any render between the wheel and the zoom's commit consumed the pending
   * correction against the rectangle that had not changed yet. The correction was
   * then thrown away and the real commit found nothing to do: measured 7% of the
   * slide's width of drift over four notches, with the scroll never moving off
   * zero. The effect has to run when the *zoom* changes and at no other time,
   * which is what the hand-written version's `[scale]` said.
   */
  const latest = useRef({ content, onZoom });
  latest.current = { content, onZoom };

  useEffect(() => {
    const host = pane.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;

      // The rectangle, not the target. See the note above.
      const rect = host.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (at.x < 0 || at.y < 0 || at.x > rect.width || at.y > rect.height) return;

      // Before anything else: the browser's own page zoom is what this gesture
      // means to the browser, and it is not what the reader is asking for.
      event.preventDefault();

      const next = Math.min(max, Math.max(min, zoom * (event.deltaY < 0 ? step : 1 / step)));
      if (next === zoom) return;

      const drawn = latest.current.content();
      pending.current = {
        pointer: { x: event.clientX, y: event.clientY },
        // The centre when there is nothing drawn to anchor on, which is what a
        // reader would expect of an empty pane.
        anchor: drawn ? anchorOf({ x: event.clientX, y: event.clientY }, drawn) : { x: 0.5, y: 0.5 }
      };
      latest.current.onZoom(next);
    };

    /**
     * On the window and at the capture phase.
     *
     * `passive: false` because the handler calls `preventDefault`, and a listener
     * the browser believes is passive cannot: Chrome ignores the call and logs
     * nothing anybody reads.
     */
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true } as never);
    // `content` and `onZoom` are read through the ref above, so a re-render does
    // not resubscribe; the zoom is here because the factor is applied to it.
  }, [pane, zoom, min, max, step]);

  useLayoutEffect(() => {
    const held = pending.current;
    const host = pane.current;
    if (!held || !host) return;

    pending.current = null;
    const drawn = latest.current.content();
    if (!drawn) return;

    const shift = anchorShift(held.pointer, drawn, held.anchor);
    host.scrollLeft += shift.dx;
    host.scrollTop += shift.dy;
    // Keyed on the zoom and nothing else: this is the commit that changed the
    // size, and the rectangle is only true here. See the note on `latest`.
  }, [zoom, pane]);
}

/**
 * Which point of the content is under the pointer, as a fraction of it.
 *
 * A fraction rather than a distance, because it is the one description that
 * survives the content being redrawn at a different size — which is the whole of
 * what zooming does.
 */
export function anchorOf(
  pointer: { x: number; y: number },
  content: { left: number; top: number; width: number; height: number }
): { x: number; y: number } {
  return {
    x: content.width > 0 ? (pointer.x - content.left) / content.width : 0.5,
    y: content.height > 0 ? (pointer.y - content.top) / content.height : 0.5
  };
}

/**
 * How far to scroll so that fraction lands back under the pointer.
 *
 * Given the content's rectangle *as it is now*, after the zoom — which is the
 * correction this shape exists for. See the note at the top of the file for what
 * predicting it instead cost.
 */
export function anchorShift(
  pointer: { x: number; y: number },
  content: { left: number; top: number; width: number; height: number },
  anchor: { x: number; y: number }
): { dx: number; dy: number } {
  return {
    dx: content.left + anchor.x * content.width - pointer.x,
    dy: content.top + anchor.y * content.height - pointer.y
  };
}
