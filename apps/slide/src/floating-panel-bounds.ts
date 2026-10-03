import { useLayoutEffect, useState, type RefObject } from 'react';

/** Panels may shorten above the thumbnail tray; the canvas never resizes. */
export function useFloatingPanelBounds(host: RefObject<HTMLElement | null>, enabled: boolean) {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    if (!enabled) return;
    const body = host.current?.closest('.sl-shell')?.querySelector<HTMLElement>('.sl-body');
    const viewport = body?.querySelector<HTMLElement>('.sl-stage-viewport');
    const tray = body?.querySelector<HTMLElement>('[data-slide-dock]');
    if (!body || !viewport) return;
    const measure = () => {
      const narrow = body.clientWidth < 960;
      const navigation = body.querySelector<HTMLElement>('#slides-objects');
      const inspector = body.querySelector<HTMLElement>('#slides-details');
      // Transfer focus before the width policy makes a focused panel inert.
      if (narrow && inspector && !inspector.hidden && navigation?.contains(document.activeElement)) {
        body.closest('.sl-shell')?.querySelector<HTMLElement>('[aria-controls="slides-objects"]')?.focus({ preventScroll: true });
      }
      setNarrow(narrow);
      const bottom = tray ? Math.min(tray.getBoundingClientRect().top, viewport.getBoundingClientRect().bottom) : viewport.getBoundingClientRect().bottom;
      body.style.setProperty('--sl-panel-bottom', `${Math.max(12, body.getBoundingClientRect().bottom - bottom + 12)}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body); observer.observe(viewport);
    if (tray) observer.observe(tray);
    measure();
    return () => { observer.disconnect(); body.style.removeProperty('--sl-panel-bottom'); };
  }, [host, enabled]);
  return narrow;
}
