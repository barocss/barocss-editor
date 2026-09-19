import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dragGesture } from '@barocss/shared';
import { cn } from './cn';
import { Icon } from '@barocss/office-icons';
import { Button, keepsDraftTextAreaEscape } from './controls';
import { useMovablePanel } from './movable-panel';

/**
 * A stack of things a reader arranges: fills, effects, layers.
 *
 * ## Why this is a primitive and not a panel
 *
 * Every design tool has this list and it is always the same list — a grip, the
 * thing, an eye, a delete, and an editor that opens from the row. Figma's fills,
 * its effects and its layers are one control drawn three times, and this
 * repository had it twice already (the deck's paints and its effects) with a
 * third coming (a layer panel). Twice is a coincidence; three times is a
 * component nobody wrote.
 *
 * ## What the two copies had learned, kept
 *
 * Both of these were found in a browser and neither is obvious from the code:
 *
 * - **The dismiss host is the whole row, not the editor.** With the ref on the
 * editor alone, pressing the swatch to *close* it was two events fighting: the
 *   pointer landed outside the editor, which dismissed it, and then the click
 *   toggled it open again. A reader saw a panel that would not close, and the
 *   double-toggle is invisible in the code of either half.
 * - **An editor can have handles somewhere else.** A gradient's axis is dragged
 *   on the *slide* while its row is open. Dismissing on "a pointer outside this
 * row" closed the editor and unmounted the handles in the capture phase, before
 *   React's own `pointerdown` reached them — so the drag did nothing at all with
 * the handle plainly under the pointer. `keep` is how the panel half knows about
 *   the canvas half.
 */

/**
 * Closed by a pointer outside or by Escape, with the outside defined by the
 * caller.
 *
 * The third copy of this: `ColorField` has one and the deck's paint panel has
 * one. Escape is *stopped* rather than left to bubble, because the handler above
 * clears the selection and one press should undo one thing.
 */
type DismissLayer = { owns: (target: EventTarget | null) => boolean; escape: (event: KeyboardEvent) => boolean };
const dismissLayers = new WeakMap<Document, DismissLayer[]>();
const dismissedEvents = new WeakSet<KeyboardEvent>();

/** A modal capture listener delegates Escape before dismissing its own surface. */
export function dismissOwnedControlLayer(event: KeyboardEvent): boolean {
  const doc = event.target instanceof Node ? event.target.ownerDocument : null;
  const layer = doc && dismissLayers.get(doc)?.at(-1);
  return !!layer && layer.owns(event.target) && layer.escape(event);
}

export function useDismiss<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  close: () => void,
  /**
   * Selectors for things that belong to this editor and are drawn elsewhere — a
   * gradient's axis on the canvas, a motion path's points on the shape.
 */
  keep: string[] = []
) {
  const host = useRef<T>(null);
  /**
   * `close` through a ref, because every call site passes an inline arrow.
   *
   * In the deps it would tear the listeners down and put them back on every
   * render the editor is open for — harmless and pointless — and taking it out of
   * the deps without a ref would leave the first render's `close` running
   * forever, which is the classic version of this bug.
   */
  const dismiss = useRef(close);
  dismiss.current = close;

  useEffect(() => {
    if (!open) return;

    const doc = host.current?.ownerDocument ?? document;
    const layers = dismissLayers.get(doc) ?? [];
    const owns = (target: EventTarget | null) => target instanceof Element && (
      !!host.current?.contains(target) || keep.some(selector => target.closest(selector))
    );
    const onPointerDown = (event: PointerEvent) => {
      if (layers.at(-1) !== layer || event.defaultPrevented || owns(event.target)) return;
      dismiss.current();
    };
    const onKeyDown = (event: KeyboardEvent): boolean => {
      if (keepsDraftTextAreaEscape(event)) return false;
      if (layers.at(-1) !== layer || dismissedEvents.has(event) || (event.defaultPrevented && !owns(event.target)) || event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return false;
      // Editor shortcuts can cancel Escape before this listener. The focused surface still owns it.
      dismissedEvents.add(event);
      event.preventDefault();
      event.stopPropagation();
      dismiss.current();
      return true;
    };
    const layer: DismissLayer = { owns, escape: onKeyDown };
    layers.push(layer);
    dismissLayers.set(doc, layers);
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('keydown', onKeyDown, true);
    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown, true);
    };
    // `keep` is a literal at every call site; joining it keeps the effect from
    // re-running on a new array of the same strings.
  }, [open, keep.join('|')]);

 return host;
}

/** Drag and explicit actions share one reorder operation. */
export function useStackOrder<T>(items: T[], onChange: (items: T[]) => void) {
 const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const grab = (index: number) => (event: React.PointerEvent) =>
    void dragGesture(event, {
      start: (pointer) => {
        const row = (pointer.currentTarget as HTMLElement).closest<HTMLElement>('[data-stack-row]');
        const list = row?.parentElement;
        if (!row || !list) return null;
        setDragging(index);
        return {
          rows: [...list.children].filter(child => child.hasAttribute('data-stack-row'))
            .map(child => child.getBoundingClientRect()),
          at: index
        };
      },

      move: (held, moved) => {
        // Effects have different heights; a single row height cannot identify the drop row.
        const hit = held.rows.findIndex(row => moved.y < row.bottom);
        const next = hit < 0 ? items.length - 1 : hit;
        if (next === held.at) return;
        held.at = next;
        setDragging(next);
      },

      done: (held) => {
        setDragging(null);
        move(index, held.at);
      },

      /* 물러서면 목록은 그대로이고 흐리게 그린 행만 돌아옵니다. */
      abort: () => setDragging(null)
    });

  return { dragging, grab, move };
}

/**
 * One row of a stack: the grip, the row's own controls, the eye and the delete —
 * with the editor that opens from it underneath.
 *
 * The eye is `visible`/`onVisible` rather than a child, because "off but still in
 * the list" is what a stack *is*: two fills are compared by turning one off, and
 * a delete would lose it. Both are optional — a list that cannot hide or cannot
 * delete simply does not pass them.
 */
export function StackRow({
 index,
  name,
  hostRef,
  disabled,
  dragging,
  onGrab,
  visible,
  onVisible,
  onRemove,
  editor,
  editorLabel,
  onEditorClose,
  order,
  editorTriggerRef,
  floatingEditor = false,
  children,
  details,
  className,
  testClass,
  data
}: {
  /** Counting from 0; the labels say `index + 1`, which is what a reader counts. */
  index: number;
  /** What this kind of thing is called, for the row's accessible names. */
 name: string;
  /**
   * The row's element, for a caller that dismisses on a pointer outside it.
   *
   * A prop rather than a forwarded ref, and deliberately: what the caller wants is
   * *this row*, which is what `useDismiss` returns, and passing it by name says so
   * where a `ref` would leave a reader wondering which element it lands on.
   */
  hostRef?: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
  dragging?: boolean;
  onGrab?: (event: React.PointerEvent) => void;
  visible?: boolean;
  onVisible?: (visible: boolean) => void;
  onRemove?: () => void;
  /** What opens from the row, when something has opened it. */
  editor?: React.ReactNode;
  editorLabel?: string;
  onEditorClose?: () => void;
  /** Explicit alternatives to the drag grip, shown in the editor header. */
  order?: { up?: () => void; down?: () => void };
  editorTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  floatingEditor?: boolean;
  children: React.ReactNode;
  /** Persistent row settings, outside the floating value editor. */
  details?: React.ReactNode;
  className?: string;
  testClass?: string;
  data?: Record<string, string | undefined>;
}) {
  const editorBody = useRef<HTMLDivElement>(null);
  const editorFocused = useRef(false);
  const expanded = Boolean(editor);
  const movable = useMovablePanel(expanded && floatingEditor, editorTriggerRef, editorBody);
  useLayoutEffect(() => {
    if (!expanded || (floatingEditor && !movable.ready)) return;
    const body = editorBody.current;
    const trigger = editorTriggerRef?.current;
    if (trigger === document.activeElement && trigger?.matches(':focus-visible')) {
      const field = body?.querySelector<HTMLInputElement>('input:not(:disabled)');
      field?.focus({ preventScroll: true });
      field?.select();
    }
    return () => {
      if (editorFocused.current && (body?.contains(document.activeElement) || document.activeElement === document.body) && trigger?.isConnected && !trigger.disabled) {
        trigger.focus({ preventScroll: true });
      }
      editorFocused.current = false;
    };
  }, [expanded, editorTriggerRef, floatingEditor, movable.ready]);
  return (
    <div
      ref={hostRef}
      data-stack-row={index}
      data-dragging={dragging ? 'true' : undefined}
 {...Object.fromEntries(
        Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value])
      )}
      className={cn('flex flex-col gap-1', dragging && 'opacity-60', testClass, className)}
 >
      <div className="flex items-center gap-1.5">
 {/* The grip: a stack is an order, and this is how it changes. */}
        <span
          aria-label={`${index + 1}번 순서`}
          data-stack-grip={index}
          onPointerDown={disabled ? undefined : onGrab}
          className={cn(
            'w-2 shrink-0 select-none text-center leading-none',
 'text-[length:var(--ou-text-small)] text-[color:var(--ou-faint)]',
 disabled ? 'cursor-default' : 'cursor-grab'
 )}
        >
          ⠿
        </span>

        {children}

        {onVisible && (
          <Button
            square
            ariaLabel={`${index + 1}번 표시`}
            pressed={undefined}
            disabled={disabled}
            onClick={() => onVisible(visible === false)}
            data={{ 'stack-visible': visible === false ? 'false' : 'true' }}
 >
            {/*
              The icon set's, not a character.
              `●` / `◌` and `␡` were typed literals, and a literal is drawn by whatever font the
              product happens to have: `␡` (U+2421) has no glyph in most of them and came out as a
              box with `DL` in it — measured on a gallery page, where a row of layer controls read
              `● ▯ / ◌ ▯`. `shown`, `hide` and `delete` are in `office-icons` and are one stroke
              weight with everything else in the row.
            */}
            <Icon name={visible === false ? 'hide' : 'shown'} size={14} />
 </Button>
        )}

        {onRemove && (
          <Button square ariaLabel={`${index + 1}번 ${name} 삭제`} disabled={disabled} onClick={onRemove}>
            <Icon name="delete" size={14} />
          </Button>
        )}
      </div>

      {details && <div className="office-stack-details pl-3.5">{details}</div>}

      {editor && (
        <div
          ref={editorBody}
          popover={floatingEditor ? 'manual' : undefined}
          role={floatingEditor ? 'dialog' : undefined}
          aria-label={floatingEditor ? (editorLabel ?? `${index + 1}번 ${name}`) : undefined}
          style={floatingEditor ? movable.style : undefined}
          onFocusCapture={() => { editorFocused.current = true; }}
          onBlurCapture={event => {
            if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) editorFocused.current = false;
          }}
          data-stack-editor={index}
          className={cn(
            floatingEditor && 'office-movable-panel',
            'rounded-lg border p-2 shadow-[var(--ou-lift-1)]',
 'border-[color:var(--ou-line)] bg-[color:var(--ou-panel)]'
 )}
        >
          {onEditorClose && <div className={cn('office-stack-editor-header', floatingEditor && 'office-panel-drag-handle')}
            tabIndex={floatingEditor ? -1 : undefined}
            onPointerDown={floatingEditor ? movable.onPointerDown : undefined}>
            <span>{editorLabel ?? `${index + 1}번 ${name}`}</span>
            <span className="flex shrink-0 items-center gap-1">
            {order && <>
              <Button square tone="quiet" ariaLabel={`${index + 1}번 ${name} 위로`} disabled={disabled || !order.up}
                onClick={() => { onEditorClose(); order.up?.(); }}><Icon name="move-up" size={14} /></Button>
              <Button square tone="quiet" ariaLabel={`${index + 1}번 ${name} 아래로`} disabled={disabled || !order.down}
                onClick={() => { onEditorClose(); order.down?.(); }}><Icon name="move-down" size={14} /></Button>
            </>}
            <Button square tone="quiet" ariaLabel={`${editorLabel ?? `${index + 1}번 ${name}`} 닫기`}
              onClick={() => {
                editorTriggerRef?.current?.focus({ preventScroll: true });
                onEditorClose();
              }}><Icon name="close" size={16} /></Button>
            </span>
          </div>}
          <div className={floatingEditor ? 'office-movable-panel-body' : undefined}>{editor}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The stack itself: the rows, and the header that adds one.
 *
 * The rows are the caller's, because what is *in* a row is the product's — a
 * fill has a swatch and a kind, an effect has an offset and a blur. What is
 * shared is that they are a list with an order, which is this.
 */
export function StackList({
 children,
  empty,
  className,
  testClass
}: {
  children: React.ReactNode;
  /** What to say when there is nothing in it, which is a common state. */
  empty?: React.ReactNode;
  className?: string;
  testClass?: string;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (rows.length === 0 && empty) {
    return (
      <p className="px-1 text-[length:var(--ou-text)] text-[color:var(--ou-muted)]">{empty}</p>
    );
  }
  return <div className={cn('flex flex-col gap-1', testClass, className)}>{children}</div>;
}
