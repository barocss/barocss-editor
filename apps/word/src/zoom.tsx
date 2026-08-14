import { useEffect, useState } from 'react';

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
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? `${Math.round(zoom * 100)}%`;

  // Ctrl/Cmd with the wheel is what every reader already tries.
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

  const commit = (value: string) => {
    const parsed = Number.parseFloat(value.replace('%', '').trim());
    setTyped(null);
    if (Number.isFinite(parsed) && parsed > 0) onChange(clamp(parsed / 100));
  };

  return (
    <div className="w-zoom-control" data-zoom={zoom.toFixed(2)}>
      <button
        type="button"
        data-zoom-out
        aria-label="축소"
        title="축소"
        onClick={() => onChange(clamp(zoom / 1.25))}
      >
        −
      </button>

      <input
        aria-label="확대/축소"
        data-zoom-value
        value={shown}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          if (event.key === 'Escape') setTyped(null);
        }}
      />

      <button
        type="button"
        data-zoom-in
        aria-label="확대"
        title="확대"
        onClick={() => onChange(clamp(zoom * 1.25))}
      >
        +
      </button>

      <button
        type="button"
        data-zoom-fit
        aria-label="너비에 맞춤"
        title="너비에 맞춤"
        onClick={() => onChange(fitToWidth())}
      >
        ⇔
      </button>
    </div>
  );
}
