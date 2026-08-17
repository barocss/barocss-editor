import { useEffect } from 'react';
import { ZoomControl as SuiteZoomControl } from '@barocss/office-ui';

/**
 * How large the page is drawn.
 *
 * A `transform: scale`, and deliberately not the `zoom` property. A page has to
 * break in the same place at every size — a reader who zooms out to see the
 * shape of a document and finds the page breaks have moved has been shown a
 * different document. `transform` is a visual change and leaves the layout
 * alone: measured, a paragraph keeps all eight of its lines at half size and
 * every length comes back multiplied by exactly the factor. `zoom` affects
 * layout and drifts — 77.88px where the transform gives 78.
 *
 * The measurement pass divides the factor back out (see `scaleOf` in
 * `office-word/src/measurement.ts`), reading it from the element rather than
 * being told, so nothing else in the pass knows a zoom exists. The ruler needs
 * no change at all: it already works in fractions of the page rather than in
 * pixels, so a scaled page and a scaled ruler agree by arithmetic.
 *
 * ## What is shared with the rest of the suite, and what is not
 *
 * The **widget** is shared — minus, a percentage you can type into, plus, and a
 * fit button. Two products disagreeing about where those are, or about whether
 * "150%" can be typed, is one of them being wrong.
 *
 * Everything below it is Word's, and measured against Slides every one of the
 * differences is right for its product:
 *
 * - **Fit means the width.** A page is tall and scrolls; fitting its height
 *   would leave the text too small to read. A slide is a fixed aspect looked at
 *   one at a time, so fitting one dimension leaves it clipped.
 * - **0.25 to 4.** A page at 10% is unreadable. A deck at 10% is a contact
 *   sheet, which is why Slides goes to 0.1.
 * - **The wheel changes the number and nothing else.** A reader zooming a
 *   document is reading, and the text stays against the left margin either way.
 *   A reader zooming a canvas is pointing at something, so Slides moves the
 *   scroll to hold the point under the pointer. Doing that here would move the
 *   page out from under a reader who was following a line of text.
 * - **No panning.** A document scrolls in one direction and has a scrollbar for
 *   it; a canvas moves in two and needs a hand.
 */

/** What Word offers, plus the two fits it computes. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

const clamp = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

/**
 * The zoom that makes the page exactly fill the pane it is in.
 *
 * Measured from the page's own width rather than from the document's, because
 * what a reader means by "fit" is what they can see — and the pane is what they
 * can see.
 */
export function fitToWidth(): number {
  const surface = document.querySelector('.w-surface') as HTMLElement | null;
  const pane = document.querySelector('.w-shell-document') as HTMLElement | null;
  if (!surface || !pane) return 1;

  // `offsetWidth` is the untransformed width, which is what has to fit — the
  // drawn width already has the current zoom in it and would compound.
  const page = surface.offsetWidth;
  if (page <= 0) return 1;

  // Less the pane's own padding, and a little for the scrollbar.
  const style = getComputedStyle(pane);
  const room =
    pane.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  return clamp(room / page);
}

export function ZoomControl({
  zoom,
  onChange
}: {
  zoom: number;
  onChange: (zoom: number) => void;
}) {
  // Ctrl/Cmd with the wheel is what every reader already tries. Scoped to the
  // document pane, so the same gesture over the ribbon is the browser's.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (!(event.target as Element | null)?.closest?.('.w-shell-document')) return;
      event.preventDefault();
      onChange(clamp(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [zoom, onChange]);

  return (
    <SuiteZoomControl
      className="w-zoom-control"
      zoom={zoom}
      onChange={(next) => onChange(clamp(next))}
      onFit={() => onChange(fitToWidth())}
      fitLabel="너비에 맞춤"
    />
  );
}
