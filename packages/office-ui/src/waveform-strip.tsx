import { useRef, useState } from 'react';
import { cn } from './cn';
import { trimWindow, waveBars, type WaveBar } from './waveform';

/**
 * A sound, drawn, with the part that plays marked on it.
 *
 * ## What this is for
 *
 * Trimming a film in this suite was two number fields in seconds, and a reader typed
 * them **blind**: nobody knows where the dead air ends without playing the clip and
 * watching a clock. This is the eye for that — the shape of the sound, the kept part
 * bright and the trimmed part dim, and two handles to move the edges to what you can
 * see.
 *
 * ## Pure UI, in fractions
 *
 * No milliseconds here and nothing about films: the window is `0..1` of the strip and
 * `onChange` hands back the same. The caller owns what a fraction *means* — a deck
 * converts with `momentAt` and clamps with its own trim rules, which is where the
 * knowledge of "0 means to the end" belongs.
 *
 * ## Why it commits on release
 *
 * The window follows the pointer while dragging, from local state, and `onChange`
 * fires once when the pointer is let go. Writing on every move would put a hundred
 * entries in the document's history for one gesture — the same reason the rulers'
 * guides and the timeline's bars commit on release.
 */
export function Waveform({
  peaks,
  window: kept,
  height = 32,
  className,
  label,
  fromLabel = '시작점 옮기기',
  toLabel = '끝점 옮기기',
  onChange,
  data
}: {
  /** One peak per bar, each 0..1. `peaksOf` in `waveform.ts` makes them. */
  peaks: number[];
  /** The part that plays, as fractions of the strip. */
  window?: { from: number; to: number };
  height?: number;
  className?: string;
  /** For the reader who cannot see it: what sound this is. */
  label?: string;
  /**
   * What the two handles are called.
   *
   * Verbs, and different from whatever the caller's *fields* are called: a panel that
   * sets the in-point two ways — a number field and this handle — had two controls
   * with one accessible name, which a screen reader reads out as the same thing twice
   * and a test cannot tell apart. Found by a test that could not tell them apart.
   */
  fromLabel?: string;
  toLabel?: string;
  /** The window a reader dragged to, on release. */
  onChange?: (window: { from: number; to: number }) => void;
  data?: Record<string, string>;
}) {
  const strip = useRef<HTMLDivElement | null>(null);
  /** The edge being dragged and where it is now, so the drawing follows the pointer. */
  const [dragging, setDragging] = useState<{ edge: 'from' | 'to'; at: number } | null>(null);

  /**
   * The width is not known until this is laid out, and the bars are geometry in
   * pixels — so they are drawn in a viewBox of a fixed width and scaled by the SVG.
   * A hundred is a hundred bars: enough shape to find a gap in speech, few enough
   * that a bar is a pixel or two at any strip width a panel gives it.
   */
  const bars: WaveBar[] = waveBars(peaks, { width: 100, height, gap: 0.2 });

  /**
   * Wide enough to grab, narrow enough to point with: the drawn line is two pixels
   * and the target is twelve, centred on it — the same trick the rulers' guides use,
   * and the reason a handle is a `button` with a transparent box around a border.
   */
  const handle =
    'absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize border-x-0 bg-transparent ' +
    'before:absolute before:inset-y-0 before:left-1/2 before:w-0.5 before:-translate-x-1/2 ' +
    'before:bg-[color:var(--ou-ink)] before:content-[\'\'] ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ou-accent)]';

  const window_ = kept ?? { from: 0, to: 1 };
  const shown = dragging
    ? dragging.edge === 'from'
      ? { from: Math.min(dragging.at, window_.to), to: window_.to }
      : { from: window_.from, to: Math.max(dragging.at, window_.from) }
    : window_;

  /** Where the pointer is, as a fraction of the strip. */
  const fractionAt = (clientX: number): number => {
    const box = strip.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  };

  const startDrag = (edge: 'from' | 'to') => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    setDragging({ edge, at: fractionAt(event.clientX) });
  };

  const move = (event: React.PointerEvent) => {
    if (!dragging) return;
    setDragging({ edge: dragging.edge, at: fractionAt(event.clientX) });
  };

  const release = () => {
    if (!dragging) return;
    setDragging(null);
    // The clamped window rather than the raw pointer: an edge dragged past the other
    // one is the reader saying "up to it", which is what `shown` already worked out.
    onChange?.(shown);
  };

  return (
    <div
      ref={strip}
      className={cn('office-wave relative w-full select-none touch-none', className)}
      style={{ height }}
      role="group"
      aria-label={label}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      {...Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value]))}
    >
      <svg
        className="block h-full w-full"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {bars.map((bar, at) => {
          /**
           * A bar's own place decides whether it is kept, which is what makes the
           * trim readable at a glance: the same shape, dim outside the window. The
           * *middle* of the bar rather than its left edge, so the boundary bar goes
           * to whichever side most of it is on.
           */
          const middle = (bar.x + bar.width / 2) / 100;
          const inside = middle >= shown.from && middle <= shown.to;
          return (
            <rect
              key={at}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              /**
               * The kept part in the accent, the trimmed part faint — the same two
               * roles every other control here uses, from the chrome's own tokens, so
               * a product that re-maps them re-maps this too.
               */
              fill={inside ? 'var(--ou-accent)' : 'var(--ou-faint)'}
              opacity={inside ? 1 : 0.45}
            />
          );
        })}
      </svg>

      {/* The two edges. Buttons, so a keyboard can reach them and a reader is told
          what they are; the dragging is a pointer gesture on top of that. */}
      <button
        type="button"
        className={handle}
        style={{ left: `${shown.from * 100}%` }}
        aria-label={fromLabel}
        data-wave-handle="from"
        onPointerDown={startDrag('from')}
      />
      <button
        type="button"
        className={handle}
        style={{ left: `${shown.to * 100}%` }}
        aria-label={toLabel}
        data-wave-handle="to"
        onPointerDown={startDrag('to')}
      />
    </div>
  );
}

/** Re-exported so a caller draws a window from a trim without importing twice. */
export { trimWindow };
