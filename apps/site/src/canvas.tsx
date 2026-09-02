import { useLayoutEffect, useRef, useState } from 'react';
import type { Viewport, ViewportControls } from '@barocss/office-ui';

/**
 * The plane the boards sit on.
 *
 * ## Why a canvas at all, for a product whose output is a scrolling page
 *
 * Because the reader is not looking at *a* page — they are looking at the same page at three widths,
 * and next month at a fourth, and the whole reason to look at them together is to compare. A pane
 * that stacks them in the flow can show two; a plane can show all of them and let a reader stand
 * back from the lot. Figma Sites and Builder.io both landed here and neither started here.
 *
 * The boards themselves are **not** canvas objects: no coordinates, no dragging, no z-order. Each is
 * a page laid out by the browser, exactly as it will be when it is published, and the plane only
 * decides where the boards are put and how far away the reader is standing. That distinction is the
 * product: *the canvas is the studio, the board is the page.*
 *
 * ## Why this scrolls nothing
 *
 * It did, and that is what a reader reported as "the zoom does not work". A scrolling pane can only
 * hold a point still while there is scroll left to give, and a builder **opens fitted** — the scroll
 * is zero in both axes, so every zoom pinned the top-left corner and zooming out could never be
 * anchored at all. The correction it needs there is negative and no pane has one.
 *
 * So the plane carries its own offset and scale (`useViewport`), and the arithmetic is exact:
 * `x' = px - (px - x)·(z'/z)`. There is nothing to correct afterwards and no edge to give way at.
 *
 * ## The gestures
 *
 * ⌘ or Ctrl with the wheel zooms about the pointer; a plain wheel pans and shift swaps the axis;
 * space or the middle button drags the plane. Not a plain drag: a plain drag on this plane will be a
 * marquee, and giving one gesture away early is how a tool ends up with modifiers for everything.
 */
export function Canvas({
  paneRef,
  view,
  onView,
  controls,
  onMeasure,
  onFiles,
  children
}: {
  /** Held by the app, because the zoom control and 맞춤 live in the chrome and act on this pane. */
  paneRef: React.RefObject<HTMLDivElement | null>;
  view: Viewport;
  onView: (next: Viewport) => void;
  controls: ViewportControls;
  /** The plane's unscaled size, so the app can fit the boards without measuring the DOM itself. */
  onMeasure: (size: { width: number; height: number }) => void;
  /**
   * Pictures dropped onto the boards, with the point they were dropped at.
   *
   * Here rather than in the app because this is the element a file lands on, and a callback because
   * what a page *does* with a picture is the app's decision — this one only knows where the pointer
   * was. `dragover` has to be cancelled for a drop to fire at all, which is the browser's oldest and
   * least guessable rule.
   */
  onFiles?: (files: File[], at: { x: number; y: number }) => void;
  children: React.ReactNode;
}) {
  const plane = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  /** Whether a file is being dragged over the boards — so the canvas can say it will take it. */
  const [dropping, setDropping] = useState(false);
  const grab = useRef<{ x: number; y: number; from: Viewport } | null>(null);

  /**
   * The plane's own size, before the zoom — watched rather than measured once.
   *
   * A board grows when a reader adds a section, and 맞춤 computed from a stale size is a fit that
   * cuts the page off. Reported upward rather than kept here: the thing that needs it is the chrome.
   */
  useLayoutEffect(() => {
    const el = plane.current;
    if (!el) return;
    const measure = () => onMeasure({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [onMeasure]);

  /**
   * Space to pan, held rather than toggled.
   *
   * Refused while the reader is typing: space is a space, and a builder that stole it inside a
   * paragraph would be a builder nobody could write a sentence in. `isContentEditable` is the
   * question that answers it, and it is the browser's own.
   */
  const [spaceHeld, setSpaceHeld] = useState(false);
  const typing = () => {
    const at = document.activeElement as HTMLElement | null;
    return !!at && (at.isContentEditable || at.tagName === 'INPUT' || at.tagName === 'TEXTAREA');
  };

  return (
    <div
      ref={paneRef}
      className="st-canvas"
      data-panning={panning ? 'true' : undefined}
      data-dropping={dropping ? 'true' : undefined}
      onDragOver={(event) => {
        if (!onFiles || !event.dataTransfer?.types.includes('Files')) return;
        // Cancelled, or no `drop` ever fires — the browser's oldest and least guessable rule.
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (!dropping) setDropping(true);
      }}
      onDragLeave={(event) => {
        // Only when the pointer has actually left this pane: a drag over a child fires `dragleave`
        // on the way in, and a highlight that flickers is worse than none.
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const files = [...(event.dataTransfer?.files ?? [])].filter((one) =>
          one.type.startsWith('image/')
        );
        if (!onFiles || files.length === 0) return;
        event.preventDefault();
        onFiles(files, { x: event.clientX, y: event.clientY });
      }}
      data-space={spaceHeld ? 'true' : undefined}
      data-zoom={view.zoom.toFixed(3)}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === ' ' && !typing()) {
          setSpaceHeld(true);
          event.preventDefault();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ') setSpaceHeld(false);
      }}
      onPointerDown={(event) => {
        const wanted = event.button === 1 || (spaceHeld && event.button === 0);
        if (!wanted) return;
        event.preventDefault();
        grab.current = { x: event.clientX, y: event.clientY, from: view };
        setPanning(true);
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const held = grab.current;
        if (!held) return;
        // The plane moves **with** the pointer: it is the thing being dragged.
        onView({
          ...held.from,
          x: held.from.x + (event.clientX - held.x),
          y: held.from.y + (event.clientY - held.y)
        });
      }}
      onPointerUp={(event) => {
        grab.current = null;
        setPanning(false);
        (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
      }}
    >
      {/*
        Scaled at the plane rather than per board, so the gaps between boards scale too — a reader
        zooming out is standing back from the whole studio, not shrinking three pictures on a wall.

        `translate` before `scale`, and the origin at the corner: the offset is in the **pane's**
        pixels, which is what makes the zoom arithmetic in `useViewport` exact.
      */}
      <div
        ref={plane}
        className="st-plane"
        /*
         * `--st-zoom` **here**, with the transform it describes.
         *
         * Every marker inside a board counter-scales by it — `calc(1px / var(--st-zoom))` — so that a
         * selection outline is a hairline at 40% and at 400%. It used to be set on each overlay from
         * a React prop, which made a scale change a re-render of three boards and every box in them,
         * for a number the browser inherits for free. A viewport's scale moves a transform; this is
         * the one other thing it changes, and it changes in the same place.
         */
        style={
          {
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: '0 0',
            '--st-zoom': view.zoom
          } as React.CSSProperties
        }
      >
        <div className="st-boards">{children}</div>
      </div>

      {/* Held so the controls the app wires up are the ones this pane answers to. */}
      <span hidden data-controls={controls ? 'true' : undefined} />
    </div>
  );
}
