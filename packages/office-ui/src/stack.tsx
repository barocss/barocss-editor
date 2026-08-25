import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';
import { Icon } from '@barocss/office-icons';
import { Button } from './controls';

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

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (host.current?.contains(target as Node)) return;
      if (keep.some((selector) => target?.closest?.(selector))) return;
      dismiss.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
 event.stopPropagation();
      dismiss.current();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
 document.addEventListener('keydown', onKeyDown, true);
 return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
 document.removeEventListener('keydown', onKeyDown, true);
 };
    // `keep` is a literal at every call site; joining it keeps the effect from
    // re-running on a new array of the same strings.
  }, [open, keep.join('|')]);

 return host;
}

/**
 * Reordering by dragging the grip.
 *
 * The arithmetic is deliberately crude and deliberately *measured from the list*:
 * a row's height and the list's top, so the index under the pointer is a
 * division. A library of drop targets would be a lot of machinery for a list of
 * three.
 *
 * Returns the row's `dragging` flag as an index rather than a boolean, so the row
 * being dragged is the one drawn faintly and the caller does not need its own
 * state to say which.
 */
export function useStackOrder<T>(items: T[], onChange: (items: T[]) => void) {
 const [dragging, setDragging] = useState<number | null>(null);

  const grab = (index: number) => (event: React.PointerEvent) => {
    event.preventDefault();
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-stack-row]');
 const list = row?.parentElement;
    if (!row || !list) return;

    setDragging(index);
    const height = row.getBoundingClientRect().height;
    const top = list.getBoundingClientRect().top;
    let at = index;

    const move = (pointer: PointerEvent) => {
      const next = Math.min(
        items.length - 1,
        Math.max(0, Math.floor((pointer.clientY - top) / Math.max(1, height)))
      );
      if (next !== at) {
        at = next;
        setDragging(next);
      }
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
 window.removeEventListener('pointerup', up);
 setDragging(null);
      if (at === index) return;

      const next = [...items];
      const [moved] = next.splice(index, 1);
      next.splice(at, 0, moved);
      onChange(next);
    };

    window.addEventListener('pointermove', move);
 window.addEventListener('pointerup', up);
 };

  return { dragging, grab };
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
  children,
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
  children: React.ReactNode;
  className?: string;
  testClass?: string;
  data?: Record<string, string | undefined>;
}) {
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

      {editor && (
        <div
          data-stack-editor={index}
          className={cn(
            'rounded-lg border p-2 shadow-[var(--ou-lift-1)]',
 'border-[color:var(--ou-line)] bg-[color:var(--ou-panel)]'
 )}
        >
          {editor}
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
