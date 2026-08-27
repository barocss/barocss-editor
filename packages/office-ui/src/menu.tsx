import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@barocss/office-icons';
import { cn } from './cn';
import { useDismiss } from './stack';

/**
 * A menu at a point — what a right-click opens.
 *
 * ## Why this is here and not in the product
 *
 * Because a context menu is chrome, and because there is nothing about it that is
 * a deck's or a document's: a list of named things at a position, dismissed by a
 * pointer outside or by Escape, keyboard-walkable. Word will want exactly this the
 * day it has one, and the reason this package exists is that the alternative is
 * two of them that look different.
 *
 * ## Hand-rolled rather than Radix
 *
 * The toolbar, the dialog, the select and the tooltip are Radix's, and this is
 * not — deliberately. Radix's context menu owns the *trigger*: it wants to be
 * wrapped around the thing being right-clicked, and what is being right-clicked
 * here is a canvas, where the target is worked out by hit-testing the model rather
 * than by which element the pointer landed on. Given a point and a list, the rest
 * is a positioned box and a key handler, and the dismissal is already shared
 * (`useDismiss`). Adding a dependency to avoid forty lines and then fighting its
 * model would be the more expensive answer.
 *
 * ## Drawn into the body, not where it is written
 *
 * Because the layer that *knows* about the right-click is a canvas overlay, and
 * that overlay is clipped to the pane it belongs to — a child of a clipped
 * element is clipped with it. Measured: a menu opened near the slide's bottom
 * corner was cut away and its items could not be clicked at all. Fixed
 * positioning already means the parent's box is irrelevant, so a portal costs
 * nothing and removes the whole class of "some ancestor clips or scrolls this".
 *
 * ## What it does not do
 *
 * Submenus, checkable items, icons. None of them has a caller, and each would be
 * a shape decision made without one.
 */

export interface MenuEntry {
  id: string;
  label: string;
  /** The chord, already formatted for the reader's platform. Drawn, not bound. */
  hint?: string;
  disabled?: boolean;
  /**
   * Why, when an entry is greyed for a reason a reader could act on.
   *
   * A disabled control that says nothing is the commonest small cruelty in a tool: the reader can
   * see the thing they want and has no way to learn what would make it available. Drawn as the
   * entry's own tooltip, which is where the toolbar already puts the same sentence.
   */
  title?: string;
  /**
   * That this entry is a **setting that is currently on** — 미리보기, 개요, a board that is shown.
   *
   * `undefined` for an entry that *does* something, which is most of them, and that difference is
   * what the mark says: a reader scanning 보기 needs to know which of these are states they are in
   * and which are actions they can take. Without it a menu of toggles reads as a menu of buttons and
   * a reader has to press one to find out what it was.
   */
  checked?: boolean;
}

export interface MenuBlock {
  id: string;
  items: MenuEntry[];
}

export function Menu({
  at,
  blocks,
  onPick,
  onClose,
  label
}: {
  /** Where the pointer was, in client coordinates. */
  at: { x: number; y: number };
  blocks: MenuBlock[];
  onPick: (id: string) => void;
  onClose: () => void;
  label: string;
}) {
  const host = useDismiss<HTMLDivElement>(true, onClose);
  const [place, setPlace] = useState<{ left: number; top: number }>({ left: at.x, top: at.y });

  /**
   * Flipped and clamped, measured after it is drawn.
   *
   * A menu opened near the bottom of the window would otherwise run off it, and
   * the reader who right-clicked the last shape on a slide is exactly the reader
   * who needs 삭제. Its own size is not knowable until it exists, which is why
   * this is a layout effect and not arithmetic on a guess.
   */
  useEffect(() => {
    const box = host.current?.getBoundingClientRect();
    if (!box) return;
    const edge = 8;
    setPlace({
      left: Math.max(edge, Math.min(at.x, window.innerWidth - box.width - edge)),
      top: Math.max(edge, Math.min(at.y, window.innerHeight - box.height - edge))
    });
    // The point is the input; the size is read from the DOM once per opening.
  }, [at.x, at.y, host]);

  /**
   * The arrows walk it, Enter picks, Escape closes.
   *
   * A menu a keyboard cannot reach is a menu that fails the one reader who most
   * needs a menu. `useDismiss` already takes Escape; this takes the rest.
   */
  const flat = blocks.flatMap((block) => block.items);
  const [hotIndex, setHot] = useState<number>(-1);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Enter') {
        const chosen = flat[hotIndex];
        if (chosen && !chosen.disabled) onPick(chosen.id);
        return;
      }

      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Past a disabled item rather than onto it: an entry that cannot run is
      // there to say it exists, not to be landed on.
      let next = hotIndex;
      for (let tries = 0; tries < flat.length; tries += 1) {
        next = (next + step + flat.length) % flat.length;
        if (!flat[next]?.disabled) break;
      }
      setHot(next);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [flat, hotIndex, onPick]);

  return createPortal(
    <div
      ref={host}
      role="menu"
      aria-label={label}
      data-context-menu
      style={{ position: 'fixed', left: place.left, top: place.top }}
      className={cn(
        'z-[var(--ou-z-popover)] min-w-44 rounded-lg border py-1 shadow-[var(--ou-lift-2)]',
        'border-[color:var(--ou-line)] bg-[color:var(--ou-panel)]',
        'text-[length:var(--ou-text)] text-[color:var(--ou-ink)]'
      )}
    >
      {blocks.map((block, index) => (
        <div key={block.id} data-menu-block={block.id}>
          {index > 0 && <hr className="my-1 border-[color:var(--ou-line)]" />}
          {block.items.map((entry) => {
            const hot = flat[hotIndex]?.id === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={entry.checked}
                data-menu-item={entry.id}
                data-checked={entry.checked ? 'true' : undefined}
                disabled={entry.disabled}
                title={entry.title}
                /**
                 * `pointerdown` rather than click, like the toolbar's buttons: the
                 * click that closes this menu must not also reach the slide
                 * underneath it.
                 */
                onPointerDown={(event) => {
                  event.preventDefault();
                  if (!entry.disabled) onPick(entry.id);
                }}
                onPointerEnter={() => setHot(flat.findIndex((one) => one.id === entry.id))}
                className={cn(
                  'flex w-full items-center justify-between gap-6 px-3 py-1 text-left',
                  'transition-colors duration-[var(--ou-quick)]',
                  'disabled:opacity-40',
                  hot && !entry.disabled && 'bg-[color:var(--ou-ground)]'
                )}
              >
                <span className="flex items-center gap-1.5">
                  {/*
                    The mark keeps its room whether or not it is drawn, so a menu of toggles does not
                    shift its labels sideways as a reader turns them on and off.
                  */}
                  {/*
                    The icon set's tick, not a `✓`.
                    A typed character is drawn by whatever font resolves it, at that font's weight
                    and baseline, so it never matches the 16px lucide set beside it — the same
                    lesson `stack.tsx` already carries about `␡`, and one this file had to learn
                    again. The room is kept whether or not the mark is drawn, so a menu of toggles
                    does not shift its labels sideways as a reader turns them on and off.
                  */}
                  {entry.checked !== undefined && (
                    <span className="flex w-3.5 shrink-0 items-center text-[color:var(--ou-accent)]">
                      {entry.checked && <Icon name="chosen" size={14} />}
                    </span>
                  )}
                  {entry.label}
                </span>
                {entry.hint && (
                  <span className="text-[length:var(--ou-text-small)] text-[color:var(--ou-faint)]">
                    {entry.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>,
    document.body
  );
}
