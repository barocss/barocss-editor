import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Icon } from '@barocss/office-icons';
import { IconButton, keepsDraftTextAreaEscape } from './controls';
import { placeNear, type PlaceOptions } from './place-near';
import { TipProvider, dismissVisibleTooltip } from './tip';
import { createPortal } from 'react-dom';
import { cn } from './cn';

/**
 * A surface that **follows the selection** — a toolbar over chosen words, a `/` menu at the caret.
 *
 * ## Why this is here and not in an extension
 *
 * There were two of these in `packages/extensions`, and no product installed either. They built
 * their own DOM: `document.createElement`, inline styles, `background: white`, appended to
 * `document.body`. A shared **model** package drawing UI is one a product cannot use — it cannot be
 * themed, placed or styled by it, and it would have been white-on-white in the dark theme all three
 * products honour. One was deleted and one had its drawing taken out; this is where the drawing goes.
 *
 * The split it completes is three-way, not two:
 *
 * | layer | holds | shared |
 * | --- | --- | --- |
 * | `extensions` | the commands and the state | yes |
 * | `office-ui` | **this** — tokens, theme, placement | yes |
 * | the app | which command, which surface, where | no, and that is the point |
 *
 * ## Placement, and the two things it has to survive
 *
 * **The selection moves and the page scrolls.** `at` is a viewport rectangle — what
 * `EditorViewDOM.selectionRect()` answers — so a caller re-measures and re-renders rather than this
 * tracking anything. A surface that tracked would be a second opinion about where the reader is.
 *
 * **It must clear the window.** Placed above the words by default, because that is where every tool
 * of this kind puts it and because below is where the reader's next line is; flipped under when
 * there is no room above, and clamped horizontally so a selection at the right edge does not push it
 * off. Measured after layout with the element's own size rather than guessed from a constant — a
 * guess is wrong the first time a product puts a longer label in it.
 *
 * ## In a portal, never in the text
 *
 * A menu rendered inside the editable region gets typed into, is carried along by a copy, and lands
 * in the document. Every editor that has made this mistake has made it once.
 */
export type FloatingDismissReason = 'escape' | 'outside';
export type FloatingOwnedElement = Element | null | { readonly current: Element | null };

export interface FloatingSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  /** The anchor is measured by the caller in viewport coordinates. */
  at: DOMRect | null;
  gap?: number;
  margin?: number;
  prefer?: PlaceOptions['prefer'];
  align?: PlaceOptions['align'];
  variant?: 'toolbar' | 'panel' | 'menu';
  /** Explicit action menus can take keyboard focus; selection/slash surfaces retain it. */
  focusOnOpen?: boolean;
  /** A host outside the editable region, inside the desired theme scope. */
  portalRoot?: HTMLElement | null;
  onDismiss?: (reason: FloatingDismissReason, event: KeyboardEvent | PointerEvent) => void;
  /** Triggers or separately portalled controls that belong to this surface. */
  ownedElements?: readonly FloatingOwnedElement[];
  [name: `data-${string}`]: string | number | boolean | undefined;
}

// Nested surfaces consume Escape one layer at a time, without knowing their product.
type FloatingDismissLayer = {
  owns: (event: Event) => boolean;
  escape: (event: KeyboardEvent) => boolean;
};
const dismissLayers = new WeakMap<Document, FloatingDismissLayer[]>();

/** Let an enclosing dialog delegate Escape to the floating layer that owns its target. */
export function dismissOwnedFloatingLayer(event: KeyboardEvent): boolean {
  const doc = event.target instanceof Node ? event.target.ownerDocument : null;
  const layer = doc && dismissLayers.get(doc)?.at(-1);
  return !!layer && layer.owns(event) && layer.escape(event);
}

export function FloatingSurface({
  open, at, gap = 8, margin = 8, prefer = 'above', align = 'center',
  variant = 'toolbar', portalRoot, onDismiss, ownedElements = [], focusOnOpen = false,
  className, children, role, style, onKeyDown, ...attributes
}: FloatingSurfaceProps) {
  const host = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const latest = useRef({ onDismiss, ownedElements });
  latest.current = { onDismiss, ownedElements };
  const destination = portalRoot ?? (typeof document === 'undefined' ? null : document.body);

  useLayoutEffect(() => {
    const surface = host.current;
    if (!open || !at || !surface) {
      setPlaced(null);
      return;
    }
    const view = surface.ownerDocument.defaultView;
    const measure = () => {
      const box = surface.getBoundingClientRect();
      // Measure natural content height so a constrained menu does not flip sides on its next resize.
      const natural = { width: box.width, height: Math.max(box.height, surface.scrollHeight + surface.offsetHeight - surface.clientHeight) };
      const { top, left } = placeNear(at, natural, {
        prefer, align, gap, margin,
        within: view ? { width: view.innerWidth, height: view.innerHeight } : undefined
      });
      const maxHeight = Math.max(0, (view?.innerHeight ?? 0) - margin - top);
      setPlaced(previous => previous && Math.abs(previous.top - top) < 0.5 && Math.abs(previous.left - left) < 0.5 && Math.abs(previous.maxHeight - maxHeight) < 0.5
        ? previous : { top, left, maxHeight });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(surface);
    view?.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      view?.removeEventListener('resize', measure);
    };
  }, [open, at, gap, margin, prefer, align, destination, className, children]);

  const dismissible = !!onDismiss;
  useEffect(() => {
    if (open && at && placed && focusOnOpen) {
      host.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)')?.focus({ preventScroll: true });
    }
  }, [open, at !== null, placed !== null, focusOnOpen]);
  useEffect(() => {
    const surface = host.current;
    if (!open || !at || !surface || !dismissible) return;
    const doc = surface.ownerDocument;
    const layers = dismissLayers.get(doc) ?? [];
    const topmost = () => layers[layers.length - 1] === layer;
    const inside = (event: Event) => {
      const path = event.composedPath();
      const contains = (element: Element | null) => !!element && (
        path.includes(element) || (event.target instanceof Node && element.contains(event.target))
      );
      return contains(surface) || latest.current.ownedElements.some(owned =>
        contains(owned && 'current' in owned ? owned.current : owned)
      );
    };
    const pointer = (event: PointerEvent) => {
      if (!topmost() || event.defaultPrevented || inside(event)) return;
      latest.current.onDismiss?.('outside', event);
    };
    const key = (event: KeyboardEvent): boolean => {
      if (keepsDraftTextAreaEscape(event)) return false;
      if (!topmost() || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return false;
      if (dismissVisibleTooltip(event)) return true;
      // Separately portalled pickers own Escape until they close. Keep their parent panel open.
      if (event.target instanceof Node && latest.current.ownedElements.some(owned => {
        const element = owned && 'current' in owned ? owned.current : owned;
        return element && ['listbox', 'menu', 'dialog'].includes(element.getAttribute('role') ?? '') && element.contains(event.target as Node);
      })) return false;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onDismiss?.('escape', event);
      return true;
    };
    const layer: FloatingDismissLayer = { owns: inside, escape: key };
    layers.push(layer);
    dismissLayers.set(doc, layers);
    doc.addEventListener('pointerdown', pointer, true);
    doc.addEventListener('keydown', key, true);
    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      doc.removeEventListener('pointerdown', pointer, true);
      doc.removeEventListener('keydown', key, true);
    };
  }, [open, at !== null, dismissible, destination]);

  if (!open || !at || !destination) return null;
  return createPortal(
    <TipProvider><div
      {...attributes}
      ref={host}
      data-floating-surface
      data-floating-ready={placed ? 'true' : undefined}
      data-floating-variant={variant}
      role={role ?? (variant === 'toolbar' ? 'toolbar' : variant === 'menu' ? 'menu' : 'group')}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented || variant !== 'menu') return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('input, textarea, select') || target.closest('[role="menu"]') !== event.currentTarget) return;
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), [role="menuitemradio"]:not(:disabled)')];
        if (!items.length) return;
        const current = items.indexOf(target as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        event.preventDefault();
        event.stopPropagation();
        items[next].focus({ preventScroll: true });
        items[next].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }}
      className={cn(
        'office-command-surface fixed z-[var(--ou-z-popover)] flex rounded-[calc(var(--ou-radius)+4px)]',
        'border border-[color:var(--ou-line)] bg-[color:var(--ou-panel)] shadow-[var(--ou-lift-2)]',
        'text-[length:var(--ou-text)] text-[color:var(--ou-ink)]',
        variant === 'toolbar' ? 'items-center gap-0.5 p-1' : 'flex-col items-stretch gap-1',
        variant === 'panel' ? 'p-2' : variant === 'menu' ? 'p-1' : undefined,
        className
      )}
      style={{
        ...style,
        position: 'fixed',
        boxSizing: 'border-box',
        maxWidth: `calc(100vw - ${margin * 2}px)`,
        maxHeight: placed ? `${placed.maxHeight}px` : `calc(100vh - ${margin * 2}px)`,
        overflow: 'auto',
        top: placed?.top ?? -9999,
        left: placed?.left ?? -9999,
        visibility: placed ? 'visible' : 'hidden'
      }}
    >{children}</div></TipProvider>,
    destination
  );
}

export interface FloatingPanelHeaderProps {
  title: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
}

/** A panel title and its dismiss control always share one header row. */
export function FloatingPanelHeader({
  title, onClose, closeLabel = '닫기', className
}: FloatingPanelHeaderProps) {
  return <div data-floating-panel-header className={cn('flex w-full shrink-0 items-center justify-between gap-3 pb-2', className)}>
    <div className="min-w-0 flex-1 text-[12px] font-semibold text-[color:var(--ou-muted)]">{title}</div>
    <IconButton label={closeLabel} size="sm" preserveFocus onClick={onClose}>
      <Icon name="close" size={14} />
    </IconButton>
  </div>;
}

/** The host owns draft values and saving. This component only arranges actions. */
export function FloatingPanelFooter({ leading, children, className }: {
  leading?: ReactNode; children: ReactNode; className?: string;
}) {
  return <div className={cn('office-floating-footer', className)}>
    {leading && <div className="office-floating-footer-leading">{leading}</div>}
    <div className="office-floating-footer-actions">{children}</div>
  </div>;
}
