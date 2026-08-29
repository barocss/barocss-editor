import { useLayoutEffect, useRef, useState } from 'react';
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
export function FloatingSurface({
  open,
  /** The words this belongs to, in viewport coordinates — `EditorViewDOM.selectionRect()`. */
  at,
  /** How far off the selection it sits. Small: this is chrome about *these* words. */
  gap = 8,
  className,
  children
}: {
  open: boolean;
  at: DOMRect | null;
  gap?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ top: number; left: number } | null>(null);

  /*
   * After layout and before paint, because the element's own width is the input: measuring in an
   * effect shows the surface at 0,0 for a frame first, which reads as a flicker in the corner.
   */
  useLayoutEffect(() => {
    if (!open || !at || !host.current) {
      setPlaced((held) => (held === null ? held : null));
      return;
    }

    const box = host.current.getBoundingClientRect();
    const margin = 8;

    // Above the words, or below them when there is no room — the reader's next line is below.
    const above = at.top - box.height - gap;
    const top = above >= margin ? above : at.bottom + gap;

    // Centred on the selection, and inside the window.
    const wanted = at.left + at.width / 2 - box.width / 2;
    const left = Math.min(Math.max(wanted, margin), window.innerWidth - box.width - margin);

    /*
     * **Only when it moved**, and the guard is not a nicety.
     *
     * This runs after every layout and sets state, so an unconditional `setPlaced` is a render that
     * schedules a layout that schedules a render. The first version had `children` in the dependency
     * list as well — a new array on every render — and React stopped it with *"Maximum update depth
     * exceeded"*: the surface rendered, threw, and unmounted, so the menu was **built correctly and
     * never appeared**. Everything measured right and nothing was on the page, which is the shape of
     * fault a screenshot finds and a state dump does not.
     */
    setPlaced((held) =>
      held && Math.abs(held.top - top) < 0.5 && Math.abs(held.left - left) < 0.5 ? held : { top, left }
    );
  }, [open, at, gap]);

  if (!open || !at || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={host}
      data-floating-surface
      role="toolbar"
      className={cn(
        /*
         * `--ou-z-popover`, which is the top of the scale, and the token rather than a number: six
         * hardcoded z-indexes here once ran 20/30/40/50 and a `z-[60]` added the day a select opened
         * *underneath* a dialog and no option in it could be pressed. This sits over a dialog for the
         * same reason a tooltip does — it is about something the reader is already looking at.
         */
        'fixed z-[var(--ou-z-popover)] flex items-center gap-0.5 rounded-[var(--ou-radius)] p-1',
        'border border-[color:var(--ou-line)] bg-[color:var(--ou-panel)] shadow-[var(--ou-lift-2)]',
        'text-[length:var(--ou-text)] text-[color:var(--ou-ink)]',
        className
      )}
      style={{
        top: placed?.top ?? -9999,
        left: placed?.left ?? -9999,
        /*
         * Hidden until it has been measured, rather than not rendered: it has to be in the document
         * to have a size, and a surface that appears at the corner for one frame is a surface a
         * reader sees jump.
         */
        visibility: placed ? 'visible' : 'hidden'
      }}
    >
      {children}
    </div>,
    document.body
  );
}
