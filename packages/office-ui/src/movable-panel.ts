import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import { dragGesture } from '@barocss/shared';

type Position = { left: number; top: number };

/** Shared placement for inspector tools. The top layer keeps ancestor overflow from clipping them. */
export function useMovablePanel(open: boolean, anchor: RefObject<HTMLElement | null> | undefined, panel: RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<Position>();
  const current = useRef<Position | undefined>(undefined);
  const moved = useRef(false);
  const dragging = useRef(false);
  const clamp = (point: Position): Position => {
    const box = panel.current?.getBoundingClientRect();
    const view = panel.current?.ownerDocument.defaultView;
    return {
      left: Math.max(8, Math.min(point.left, (view?.innerWidth ?? 0) - (box?.width ?? 0) - 8)),
      top: Math.max(8, Math.min(point.top, (view?.innerHeight ?? 0) - (box?.height ?? 0) - 8))
    };
  };
  const put = (point: Position) => {
    current.current = point;
    setPosition(previous => previous?.left === point.left && previous.top === point.top ? previous : point);
  };

  useLayoutEffect(() => {
    const surface = panel.current;
    if (!open || !surface) { current.current = undefined; moved.current = false; setPosition(undefined); return; }
    const view = surface.ownerDocument.defaultView!;
    // Manual popovers preserve the DOM/theme/fieldset ownership used by the editor.
    surface.showPopover?.();
    const place = () => {
      if (dragging.current) return;
      if (moved.current && current.current) { put(clamp(current.current)); return; }
      const trigger = anchor?.current;
      if (!trigger) return;
      const edge = trigger.closest('[data-property-panel], .office-properties') ?? trigger;
      const bounds = edge.getBoundingClientRect();
      const box = surface.getBoundingClientRect();
      const left = bounds.left - box.width - 8;
      put(clamp({ left: left >= 8 ? left : bounds.right + 8, top: trigger.getBoundingClientRect().top }));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(surface);
    view.addEventListener('resize', place);
    view.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      view.removeEventListener('resize', place);
      view.removeEventListener('scroll', place, true);
      if (surface.matches(':popover-open')) surface.hidePopover();
    };
  }, [open, anchor, panel]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest('button, input, select, textarea') || !current.current) return;
    dragGesture(event, {
      start: () => {
        event.currentTarget.focus({ preventScroll: true });
        dragging.current = true;
        return { from: current.current!, wasMoved: moved.current };
      },
      move: (held, pointer) => {
        moved.current = true;
        put(clamp({ left: held.from.left + pointer.dx, top: held.from.top + pointer.dy }));
      },
      done: () => { dragging.current = false; },
      abort: held => { dragging.current = false; moved.current = held.wasMoved; put(clamp(held.from)); }
    });
  };
  return { onPointerDown, style: { left: position?.left, top: position?.top, visibility: position ? 'visible' : 'hidden' } as CSSProperties, ready: !!position };
}
