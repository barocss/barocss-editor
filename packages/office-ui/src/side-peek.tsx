import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Icon } from '@barocss/office-icons';
import { cn } from './cn';
import { dismissOwnedControlLayer } from './stack';
import { dismissOwnedFloatingLayer } from './floating';
import './side-peek.css';

export interface SidePeekProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  children: ReactNode;
  className?: string;
}

/** A page beside its collection. The collection stays interactive while this panel is open. */
export function SidePeek({ open, onOpenChange, title, breadcrumb, actions, expanded = false, onExpandedChange, children, className }: SidePeekProps) {
  const [width, setWidth] = useState(680);
  const [viewport, setViewport] = useState(() => typeof window === 'undefined' ? 1280 : window.innerWidth);
  useEffect(() => { const resize = () => setViewport(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const content = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const maximum = Math.max(360, viewport - 80);
  const clamp = (value: number) => Math.max(360, Math.min(value, maximum));
  const visibleWidth = viewport <= 600 ? viewport : clamp(width);
  return <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Content ref={content} className={cn('ou-side-peek', className)} data-side-peek data-expanded={expanded || undefined}
        style={{ width: expanded ? '100vw' : `${visibleWidth}px` }} aria-describedby={undefined}
        onOpenAutoFocus={event => {
          event.preventDefault();
          returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          content.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={event => { event.preventDefault(); if (returnTo.current?.isConnected) returnTo.current.focus({ preventScroll: true }); }}
        onEscapeKeyDown={event => {
          // Radix's capture listener may run before a later portal's listener. Delegate first.
          if (dismissOwnedControlLayer(event) || dismissOwnedFloatingLayer(event)) return;
          // An in-progress property/text edit owns Escape; its bubble handler cancels the draft.
          if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]')) event.preventDefault();
        }}
        onInteractOutside={event => event.preventDefault()}>
        <Dialog.Title className="ou-side-peek-sr">{title}</Dialog.Title>
        {!expanded && <div className="ou-side-peek-resize" role="separator" aria-label="항목 패널 너비" aria-orientation="vertical"
          aria-valuemin={360} aria-valuemax={maximum} aria-valuenow={clamp(width)} tabIndex={0}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault(); setWidth(value => clamp(value + (event.key === 'ArrowLeft' ? 40 : -40)));
            }
          }}
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault(); drag.current = { id: event.pointerId, x: event.clientX, width: content.current?.getBoundingClientRect().width ?? width };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => { const at = drag.current; if (at?.id === event.pointerId) setWidth(clamp(at.width + at.x - event.clientX)); }}
          onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { drag.current = null; }} />}
        <header className="ou-side-peek-header">
          <button type="button" className="ou-side-peek-icon" aria-label="닫기" title="닫기" onClick={() => onOpenChange(false)}><Icon name="collapsed" /></button>
          {onExpandedChange && <button type="button" className="ou-side-peek-icon" aria-label={expanded ? '옆으로 보기' : '전체 너비로 보기'} title={expanded ? '옆으로 보기' : '전체 너비로 보기'} aria-pressed={expanded} onClick={() => onExpandedChange(!expanded)}><Icon name="expand" /></button>}
          <nav className="ou-side-peek-breadcrumb" aria-label="항목 위치">{breadcrumb ?? title}</nav>
          <div className="ou-side-peek-actions">{actions}</div>
        </header>
        <div className="ou-side-peek-content">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
