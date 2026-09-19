import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Side = 'navigation' | 'inspector';
const PanelContext = createContext<{ compact: boolean; active: Side | null; id: string } | null>(null);

/** Keep the canvas usable while preserving mounted panel controls and drafts. */
export function AdaptiveWorkspace({ children, className = '', enabled = true, breakpoint = 960, panelSides = ['navigation', 'inspector'], locationKey, panelLabels, activePanel, onActivePanelChange, onCompactChange }: {
  children: ReactNode; className?: string; enabled?: boolean; breakpoint?: number;
  panelSides?: readonly Side[];
  panelLabels?: Partial<Record<Side, string>>;
  activePanel?: Side | null;
  onActivePanelChange?: (side: Side | null) => void;
  onCompactChange?: (compact: boolean) => void;
  /** Close transient panels after the host navigates to another document. */
  locationKey?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const [narrow, setNarrow] = useState(false);
  const [internalActive, setInternalActive] = useState<Side | null>(null);
  const active = activePanel === undefined ? internalActive : activePanel;
  const setActive = (side: Side | null) => { setInternalActive(side); onActivePanelChange?.(side); };
  const previousLocation = useRef(locationKey);
  const compact = enabled && narrow;
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => setNarrow(element.clientWidth < breakpoint);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element); measure();
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [breakpoint]);
  useEffect(() => { setActive(null); }, [compact, enabled]);
  useEffect(() => { onCompactChange?.(compact); }, [compact, onCompactChange]);
  useEffect(() => {
    if (previousLocation.current === locationKey) return;
    previousLocation.current = locationKey;
    if (compact && active && root.current?.querySelector(`[data-workspace-panel="${active}"]`)?.contains(document.activeElement)) {
      root.current.querySelector<HTMLElement>('[data-workspace-main]')?.focus({ preventScroll: true });
    }
    setActive(null);
  }, [locationKey, compact, active]);
  const dismiss = (restore: boolean) => {
    if (restore && active) root.current?.querySelector<HTMLButtonElement>(`[data-workspace-toggle="${active}"]`)?.focus({ preventScroll: true });
    setActive(null);
  };
  return <PanelContext.Provider value={{ compact, active, id }}><div ref={root} className={`office-adaptive-workspace ${className}`} data-compact={compact || undefined}
    onPointerDownCapture={event => {
      if (compact && active && (event.target as Element).closest('[data-workspace-main]')) dismiss(false);
    }} onKeyDown={event => {
      if (!compact || !active || event.defaultPrevented || event.nativeEvent.isComposing || event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); dismiss(true);
    }}>
    {compact && <div className="office-workspace-panel-controls" role="group" aria-label="작업 패널">
      {panelSides.map(side => <button key={side} type="button" data-workspace-toggle={side}
        aria-controls={`${id}-${side}`} aria-expanded={active === side} onClick={() => setActive(active === side ? null : side)}>
        {panelLabels?.[side] ?? (side === 'navigation' ? '탐색' : '속성')}
      </button>)}
    </div>}
    {children}
  </div></PanelContext.Provider>;
}

export function WorkspaceSidePanel({ side, width, children }: { side: Side; width: number; children: ReactNode }) {
  const layout = useContext(PanelContext);
  const element = useRef<HTMLDivElement>(null);
  const open = !!layout?.compact && layout.active === side;
  useEffect(() => {
    if (open) element.current?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')?.focus({ preventScroll: true });
  }, [open]);
  return <div ref={element} id={layout ? `${layout.id}-${side}` : undefined} data-workspace-panel={side}
    className="office-workspace-side-panel" hidden={!!layout?.compact && !open} style={{ width }}>
    {children}
  </div>;
}
