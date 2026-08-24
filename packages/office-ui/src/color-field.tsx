import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { cn } from './cn';
import { CONTROL } from './controls';
import { useDismiss } from './stack';
import { ColorPicker } from './color-picker';

/**
 * Choosing a colour, when the document can hold something that is not one.
 *
 * The panel's colour control was `<input type="color">`: the browser's own
 * dialog, which is fine for picking a colour and **cannot express anything
 * else**. A deck's shapes can now say `theme:accent1` — a slot the theme fills —
 * and a control that can only produce a hex string means a slot can be read from
 * a document and never written from the panel. The theme was worth nothing to
 * anybody who had not imported their deck.
 *
 * ## Why a component and not the browser's dialog
 *
 * Three things have to be offered in one place, and the browser's dialog can
 * hold none of them: the theme's slots, by name, so a shape can *follow* the
 * deck; an opacity, which is half of every fill in a real design; and any colour
 * at all, in the notation the reader is working in. Radix has no colour
 * primitive — it stops at behaviour, and a picker is a canvas — so this opens
 * `ColorPicker`, which is where all three live.
 *
 * ## Following, not copying
 *
 * A slot is drawn as the colour it resolves to and *labelled* with its name, and
 * the trigger says which slot the shape follows rather than showing an anonymous
 * swatch. That distinction is the whole feature: two shapes the same blue are a
 * coincidence, two shapes on `accent1` are a decision.
 */

export interface ThemeSwatch {
 /** What the document stores — `theme:accent1`, or `var:강조`. */
 value: string;
  /** What it resolves to today, which is what the swatch draws as. */
  colour: string;
  label: string;
}

export function ColorField({
  value,
  themeSwatches = [],
  varSwatches = [],
  onChange,
  onClear,
  disabled,
  ariaLabel
}: {
  /** What the document holds: a colour, a `theme:` slot, a `var:` name, or nothing. */
  value: string | null;
  themeSwatches?: ThemeSwatch[];
  /**
   * The **document's** own colours, offered beside the theme's.
   *
   * The same shape and a different list, because they are a different decision: a theme slot is one
   * of a fixed twelve that round-trip with PowerPoint, a document variable is one the author named.
   * Two lists so a reader can see which they are choosing; one control because "follow something"
   * is one gesture.
   */
  varSwatches?: ThemeSwatch[];
  onChange: (value: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLSpanElement>(null);

  // Whatever the value *names*, from either list: the trigger draws the colour it resolves to, so
  // a field showing the literal `var:강조` would be the one place in the product that leaked a
  // reference to the reader.
  const named = [...themeSwatches, ...varSwatches].find((swatch) => swatch.value === value);
  const shown = named ? named.colour : (value ?? null);

  /**
   * Where the panel goes: the window's coordinates, not the field's.
 *
   * It was `absolute … top-full`, which is correct for a field in the middle of
   * a tall panel and wrong at either edge of the screen. Measured on 2026-08-20
   * in the slide app's timeline pane — which sits at the *bottom* of the window —
   * a 360px picker opened 260px below the window's edge, so its notation field
 * and half its swatches were unreachable. A scrolling inspector column is the
   * same problem twice over: an absolutely-placed child is clipped by a
   * scrolling ancestor whichever direction it opens in.
   *
   * So: measured once it is drawn, flipped above the field when there is no room
   * below it, and clamped so no edge of the window can cut it. It stays a DOM
   * child of the field — the outside-pointer rule asks `host.contains(target)`,
   * and a portal would make every click inside the panel an outside click.
   */
  const [at, setAt] = useState<{ top: number; left: number }>();
  const place = useCallback(() => {
    const anchor = dismiss.current?.getBoundingClientRect();
    const box = panel.current?.getBoundingClientRect();
    if (!anchor || !box) return;

    const gap = 4;
    const edge = 8;
    const below = window.innerHeight - anchor.bottom - edge;
    const above = anchor.top - edge;
    // Below unless it does not fit there and does fit above — which is the rule
    // a reader never notices, because the panel is simply where they looked.
    const wanted =
      box.height <= below || above < box.height
        ? anchor.bottom + gap
        : anchor.top - gap - box.height;
    setAt({
      // Clamped both ways: an anchor at either edge of the window leaves one
      // direction that does not fit, and half a picker is no picker.
      top: Math.min(Math.max(edge, wanted), Math.max(edge, window.innerHeight - edge - box.height)),
      // Right-aligned with the field, as it was, until the window says otherwise.
      left: Math.max(edge, Math.min(anchor.right - box.width, window.innerWidth - edge - box.width))
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setAt(undefined);
      return;
    }
    /* The field first: it can sit in a column that scrolls, and a panel placed
       against a control that is out of sight lands out of sight with it. Only on
       the way in — scrolling to it on every re-measure would fight the reader. */
    dismiss.current?.scrollIntoView({ block: 'nearest' });
 place();

    /* And it follows: a fixed panel does not move when the column under it
       scrolls, so its own trigger slides out from beneath it and the click that
       should close it lands on the panel instead. `capture`, because scroll
       events do not bubble. */
    window.addEventListener('scroll', place, true);
 window.addEventListener('resize', place);
 return () => {
      window.removeEventListener('scroll', place, true);
 window.removeEventListener('resize', place);
 };
  }, [open, place]);

  /**
   * Closed by a pointer outside or by Escape — `useDismiss`, which is the third
   * place this was written and now the only one.
   *
   * `pointerdown` rather than `click`, so the panel is gone before the pointer
   * reaches whatever is underneath — the same rule the toolbar's palette
   * follows, and for the same reason.
   */
  const dismiss = useDismiss<HTMLSpanElement>(open, () => setOpen(false));

  return (
    <span ref={dismiss} className="relative inline-flex flex-1 items-center gap-1.5">
 <button
        type="button"
 aria-label={ariaLabel}
        aria-expanded={open}
        data-color-field={ariaLabel}
        data-value={value ?? 'none'}
 disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={cn(
          CONTROL,
          'w-[calc(var(--ou-control-h)*1.3)] shrink-0 p-0.5',
 ''
 )}
      >
        <span
          className="block h-full w-full rounded-[calc(var(--ou-radius)-1px)] border border-[color:var(--ou-line)]"
 style={{ background: shown ?? 'transparent' }}
 />
      </button>

      {/* What the document says, in the document's own words: a slot or a variable shows its
          name, because following something is a different fact from being blue. */}
      <span className="flex-1 truncate text-[length:var(--ou-text-small)] tabular-nums text-[color:var(--ou-muted)]">
 {named ? named.label : (value ?? '없음')}
 </span>

      {onClear && (
        <button
          type="button"
 aria-label={`${ariaLabel} 지우기`}
          disabled={disabled || value === null}
          onClick={onClear}
          className={cn(
            CONTROL,
            'px-1.5 hover:bg-[color:var(--ou-ground)]'
 )}
        >
          지우기
        </button>
      )}

      {open && (
        <span
          ref={panel}
          role="group"
 aria-label={`${ariaLabel} 선택`}
          data-color-panel={ariaLabel}
          /* Hidden for the one frame it is measured in, so the flip is never a
             flicker: `visibility` still lays out, which is what makes it
             measurable at all. */
          style={{ top: at?.top, left: at?.left, visibility: at ? undefined : 'hidden' }}
 className={cn(
            'fixed z-50 w-max rounded-lg border p-2 shadow-xl',
 'border-[color:var(--ou-line)] bg-[color:var(--ou-panel)]'
 )}
        >
          {/*
            * The picker, rather than this control's own grid of swatches.
            *
            * The grid answered "which of these fifteen" and nothing after it —
 * no opacity, no notation, no eyedropper — which is a picker for
            * somebody who wants *a* blue rather than for somebody choosing
            * colours. The swatches it did have are the theme's, and they are in
 * there, where following the deck sits beside naming a colour.
            */}
          <ColorPicker
            value={value ?? '#000000'}
 themeSwatches={themeSwatches}
            varSwatches={varSwatches}
            onChange={(next) => onChange(next)}
          />

          {onClear && (
            <button
              type="button"
 data-swatch="none"
              aria-label={`${ariaLabel} 없음`}
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className={cn(
                CONTROL,
                'mt-2 w-full px-2 hover:bg-[color:var(--ou-ground)]'
              )}
            >
              없음
            </button>
          )}
        </span>
      )}
    </span>
  );
}