import { useLayoutEffect, type RefObject } from 'react';

/** Panels may shorten above the thumbnail tray; the canvas never resizes. */
export function useFloatingPanelBounds(host: RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const body = host.current?.closest('.sl-shell')?.querySelector<HTMLElement>('.sl-body');
    const viewport = body?.querySelector<HTMLElement>('.sl-stage-viewport');
    const tray = body?.querySelector<HTMLElement>('[data-filmstrip-panel]');
    if (!body || !viewport) return;
    const measure = () => {
      const bottom = tray && !tray.hidden ? tray.getBoundingClientRect().top : viewport.getBoundingClientRect().bottom;
      body.style.setProperty('--sl-panel-bottom', `${Math.max(12, body.getBoundingClientRect().bottom - bottom + 12)}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body); observer.observe(viewport);
    if (tray) observer.observe(tray);
    measure();
    return () => { observer.disconnect(); body.style.removeProperty('--sl-panel-bottom'); };
  }, [host, enabled]);
}
