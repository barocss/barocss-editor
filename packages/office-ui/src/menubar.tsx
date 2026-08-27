import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';
import { Menu, type MenuBlock } from './menu';

/**
 * The row of named menus along the top — **파일, 편집, 보기**.
 *
 * ## Why a suite of editors needs one, measured
 *
 * Counted across the three products on 2026-08-27: Word carries **71** toolbar controls in one flat
 * strip and **72** keyboard shortcuts; the deck carries 60 and 21; and the deck has grown **twelve
 * application-level commands as equal-weight text buttons in its title bar** — 새로 만들기, 저장,
 * 열기, 라이브러리, 템플릿, 크기, 레이아웃, 검사, 지도, 발표, 스크롤 상영, 전체 보기 — because
 * there was nowhere else for them to go. The other two products are missing the same twelve
 * entirely: the site builder could render every page of a site and **had no way to export one**.
 *
 * That is what a menubar is for, and the division is the standard one because it is true rather than
 * conventional:
 *
 * - a **menubar** holds what acts on the *document and the application* — open, save, export, undo,
 *   find, zoom, which panels are shown. Things a reader does *occasionally* and needs to be able to
 *   **find** rather than to reach quickly.
 * - a **toolbar** holds what acts on the *selection*. Things a reader does constantly and needs to
 *   reach without reading.
 *
 * A product that has only a toolbar puts the first kind in the second kind's place, and the toolbar
 * gets longer every release until it is a wall of glyphs.
 *
 * ## And it is where a shortcut is learned
 *
 * 99 bindings across three products, and the only place any of them could be read was a tooltip —
 * which teaches a shortcut to a reader who has already found the button, which is the reader who
 * needs it least. `MenuEntry` already carries a `hint`; this puts it somewhere a reader looks *while
 * learning the product* rather than while using it.
 *
 * ## Built on the context menu rather than beside it
 *
 * `Menu` already draws a keyboard-walkable list at a point, portalled out of whatever clips it, with
 * shortcut hints and disabled entries. A menubar is that, opened at a trigger's bottom-left, plus
 * two behaviours a menubar has and a context menu does not: **left and right walk between menus**,
 * and once one is open, **pointing at another opens it** without a click. Both are what makes a
 * menubar feel like a menubar, and neither is worth a second menu implementation.
 */
export interface MenuBarMenu {
  id: string;
  /** What the trigger says — 파일, 편집, 보기. */
  label: string;
  blocks: MenuBlock[];
}

export function MenuBar({
  menus,
  onPick,
  label,
  className
}: {
  menus: MenuBarMenu[];
  /** The entry a reader chose. Which command that is, is the product's business. */
  onPick: (id: string) => void;
  /** What the row is, for a reader who cannot see it. */
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState<string | undefined>(undefined);
  const host = useRef<HTMLDivElement>(null);

  /** Where the open menu hangs: under its own trigger, left edges aligned. */
  const at = (id: string): { x: number; y: number } => {
    const trigger = host.current?.querySelector<HTMLElement>(`[data-menu="${CSS.escape(id)}"]`);
    const box = trigger?.getBoundingClientRect();
    return box ? { x: box.left, y: box.bottom + 2 } : { x: 0, y: 0 };
  };

  const shown = menus.find((one) => one.id === open);

  /**
   * Left and right walk between menus — on the **document**, while one is open.
   *
   * Not on this element, which was the first shape and did not work: the open menu is portalled to
   * the body and the trigger's `pointerdown` is prevented, so by the time a reader presses an arrow
   * the focus is nowhere near this `div` and a handler here never fires. `Menu` already takes its
   * own up/down the same way and for the same reason.
   *
   * Only while one is open. With everything closed the arrows belong to whatever the reader is
   * actually in — a menubar that took them would move the caret's keys to the chrome.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      event.stopPropagation();
      const index = menus.findIndex((one) => one.id === open);
      if (index < 0) return;
      setOpen(menus[(index + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length].id);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, menus]);

  return (
    <div
      ref={host}
      role="menubar"
      aria-label={label}
      className={cn('flex items-center gap-0.5', className)}
    >
      {menus.map((one) => (
        <button
          key={one.id}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={open === one.id}
          data-menu={one.id}
          data-open={open === one.id ? 'true' : undefined}
          onPointerDown={(event) => {
            event.preventDefault();
            setOpen(open === one.id ? undefined : one.id);
          }}
          /*
           * Once one is open, pointing at another opens it — a menubar behaviour that a reader
           * notices only by its absence, when they have to click twice to look in the next menu.
           */
          onPointerEnter={() => open && setOpen(one.id)}
          className={cn(
            'h-[var(--ou-control-h)] rounded-[var(--ou-radius)] px-2',
            'text-[length:var(--ou-text)] text-[color:var(--ou-ink)]',
            'transition-colors duration-[var(--ou-quick)]',
            'hover:bg-[color:var(--ou-ground)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ou-accent)]',
            open === one.id && 'bg-[color:var(--ou-ground)]'
          )}
        >
          {one.label}
        </button>
      ))}

      {shown && (
        <Menu
          at={at(shown.id)}
          blocks={shown.blocks}
          label={shown.label}
          onPick={(id) => {
            setOpen(undefined);
            onPick(id);
          }}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}
