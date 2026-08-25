import { useCallback, useRef, useState } from 'react';
import { useWheelZoom } from '@barocss/office-ui';

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
 * ## Zoom and pan
 *
 * `useWheelZoom` is the deck's gesture, shared — ⌘/Ctrl with the wheel, anchored on the point under
 * the pointer, corrected in a layout effect because rAF races React's commit. Three measured
 * corrections went into it and none of them are re-derived here.
 *
 * Panning is the space bar, which is the one binding every tool of this kind agrees on, plus the
 * middle button for a reader who has one. Not a plain drag: a plain drag on this plane will be a
 * marquee, and giving one gesture away early is how a tool ends up with modifiers for everything.
 */
export function Canvas({
  zoom,
  onZoom,
  children
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  children: React.ReactNode;
}) {
  const pane = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const grab = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  /* The rectangle of what the reader is actually looking at — the boards, not the plane they sit on. */
  const content = useCallback(() => {
    const boards = plane.current?.querySelector('.st-boards');
    return (boards ?? plane.current)?.getBoundingClientRect();
  }, []);

  useWheelZoom({ pane, content, zoom, onZoom, min: 0.1, max: 4 });

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
      ref={pane}
      className="st-canvas"
      data-panning={panning ? 'true' : undefined}
      data-space={spaceHeld ? 'true' : undefined}
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
        if (!wanted || !pane.current) return;
        event.preventDefault();
        grab.current = {
          x: event.clientX,
          y: event.clientY,
          left: pane.current.scrollLeft,
          top: pane.current.scrollTop
        };
        setPanning(true);
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const from = grab.current;
        if (!from || !pane.current) return;
        // The plane moves with the pointer, so the scroll goes the other way.
        pane.current.scrollLeft = from.left - (event.clientX - from.x);
        pane.current.scrollTop = from.top - (event.clientY - from.y);
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
      */}
      <div ref={plane} className="st-plane" style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
        <div className="st-boards">{children}</div>
      </div>
    </div>
  );
}
