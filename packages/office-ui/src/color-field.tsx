import { useLayoutEffect, useRef, useState } from 'react';
import { useMovablePanel } from './movable-panel';
import { Icon } from '@barocss/office-icons';
import { cn } from './cn';
import { CONTROL, FIELD_CONTROL, STATE, Button } from './controls';
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
  follows,
  weight,
  onWeight,
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
  /**
   * **Which swatch this value follows**, when the value is not the swatch itself.
   *
   * A document may name a colour *at a weight* — the same token, at a fraction — and how it spells
   * that is the editor's business, not this control's. So the caller says which swatch is being
   * followed and this draws that one as chosen; without it the field falls back to matching the
   * value, which is what every caller that has no weights does.
   */
  follows?: string | null;
  /**
   * And **how much of it**, 0–100, or nothing for the colour itself.
   *
   * Offered only when the value follows a swatch, because a weight on a literal colour is a colour
   * the reader could simply have typed. `undefined` from `onWeight` means *the colour itself*.
   */
  weight?: number | null;
  onWeight?: (weight: number | undefined) => void;
  onChange: (value: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLSpanElement>(null);
  const keyboardOpen = useRef(false);

  // Whatever the value *names*, from either list: the trigger draws the colour it resolves to, so
  // a field showing the literal `var:강조` would be the one place in the product that leaked a
  // reference to the reader.
  const named = [...themeSwatches, ...varSwatches].find((swatch) => swatch.value === (follows ?? value));
  /*
   * And at the weight, so a swatch a document holds at 40% draws as 40% rather than as the colour it
   * is a fraction of — a trigger that lied about that is a reader choosing the wrong thing twice.
   */
  const shown = named
    ? typeof weight === 'number'
      ? `color-mix(in srgb, ${named.colour} ${weight}%, transparent)`
      : named.colour
    : (value ?? null);

  /**
   * Closed by a pointer outside or by Escape — `useDismiss`, which is the third
   * place this was written and now the only one.
   *
   * `pointerdown` rather than `click`, so the panel is gone before the pointer
   * reaches whatever is underneath — the same rule the toolbar's palette
   * follows, and for the same reason.
   */
  const close = () => {
    if (panel.current?.contains(document.activeElement)) {
      dismiss.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }
    setOpen(false);
  };
  const dismiss = useDismiss<HTMLSpanElement>(open, close);
  const movable = useMovablePanel(open, dismiss, panel);

  useLayoutEffect(() => {
    if (!open || !movable.ready || !keyboardOpen.current) return;
    keyboardOpen.current = false;
    const input = panel.current?.querySelector<HTMLInputElement>('input[aria-label="색상 코드"]');
    input?.focus({ preventScroll: true });
    input?.select();
  }, [open, movable.ready]);

  return (
    <span ref={dismiss} className="relative inline-flex min-w-0 max-w-full flex-1 items-center gap-1.5"
      onBlur={event => {
        // Tab may leave this non-modal picker. Keep the destination's focus.
        if (open && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
 <button
        type="button"
 aria-label={ariaLabel}
        aria-expanded={open}
        data-color-field={ariaLabel}
        data-value={value ?? 'none'}
 disabled={disabled}
        onClick={event => {
          keyboardOpen.current = event.detail === 0;
          setOpen((wasOpen) => !wasOpen);
        }}
        className={cn(
          CONTROL,
          /**
           * **`STATE` as well**, which every other button in this library has and this one did not.
           *
           * `CONTROL` answers focus by drawing the border in the accent — a field's rule, and the
           * right one for a field: one pixel of accent where the caret is. A swatch is a **button**,
           * and its border is a hairline around a filled square, so the accent lands on the one part
           * of the control a reader is least likely to be looking at. Measured by tabbing through
           * the app: six colour swatches and nothing on screen saying where the keyboard was.
           *
           * `focus-visible`, so a mouse click still leaves nothing behind — which is the reason the
           * rings this library does have get used rather than avoided.
           */
          STATE,
          'w-[calc(var(--ou-control-h)*1.3)] shrink-0 p-0.5',
 ''
 )}
      >
        <span
          className="office-color-preview block h-full w-full rounded-[calc(var(--ou-radius)-1px)] border border-[color:var(--ou-line)]"
 style={{ backgroundImage: `linear-gradient(${shown ?? 'transparent'}, ${shown ?? 'transparent'}), conic-gradient(#d4d4d4 25%, #fff 0 50%, #d4d4d4 0 75%, #fff 0)`, backgroundSize: 'auto, 8px 8px' }}
 />
      </button>

      {/* What the document says, in the document's own words: a slot or a variable shows its
          name, because following something is a different fact from being blue. */}
      <span title={named ? named.label : (value ?? '없음')} className="min-w-0 flex-1 truncate text-[length:var(--ou-text-small)] tabular-nums text-[color:var(--ou-muted)]">
 {named ? named.label : (value ?? '없음')}
 </span>

      {onClear && (
        <button
          type="button"
          aria-label={`${ariaLabel} 지우기`}
          title={`${ariaLabel} 지우기`}
          disabled={disabled || value === null}
          onClick={onClear}
          className={cn(
            CONTROL,
            /*
             * A picture, because the word did not fit.
             *
             * Measured in the site builder's 모양 pane: 지우기 wrapped to two lines inside the
             * 그라디언트 and 그림자 rows, where two colour fields share one row's control column.
             * Three characters and their padding is 46px in a column that had 40 to give — and every
             * other *clear* in this suite is already a glyph. `shrink-0` as well, because the fault
             * underneath was a button that agreed to be squeezed.
             */
            // A button, so it answers focus the way a button does — see the swatch above.
            STATE,
            'shrink-0 px-1.5 hover:bg-[color:var(--ou-ground)]',
            'inline-flex items-center text-[color:var(--ou-faint)] hover:text-[color:var(--ou-ink)]'
          )}
        >
          <Icon name="close" size={13} />
        </button>
      )}

      {open && (
        <span
          ref={panel}
          popover="manual"
          role="dialog"
 aria-label={`${ariaLabel} 선택`}
          data-color-panel={ariaLabel}
          data-motion-ready={movable.ready ? 'true' : undefined}
          /* Hidden for the one frame it is measured in, so the flip is never a
             flicker: `visibility` still lays out, which is what makes it
             measurable at all. */
          style={movable.style}
 className={cn(
            'office-color-panel office-movable-panel fixed z-[var(--ou-z-popover)] w-max rounded-lg border p-3 shadow-[var(--ou-lift-2)]',
 'border-[color:var(--ou-line)] bg-[color:var(--ou-panel)]'
 )}
        >
          <span className="office-color-panel-header office-panel-drag-handle" tabIndex={-1} onPointerDown={movable.onPointerDown}>{ariaLabel}<Button square tone="quiet" ariaLabel={`${ariaLabel} 닫기`}
            onClick={event => { event.preventDefault(); close(); }}><Icon name="close" size={16} /></Button></span>
          {/*
            * The picker, rather than this control's own grid of swatches.
            *
            * The grid answered "which of these fifteen" and nothing after it —
 * no opacity, no notation, no eyedropper — which is a picker for
            * somebody who wants *a* blue rather than for somebody choosing
            * colours. The swatches it did have are the theme's, and they are in
 * there, where following the deck sits beside naming a colour.
            */}
          <span className="office-movable-panel-body">
          <ColorPicker
            value={value ?? '#000000'}
            resolvedValue={named?.colour ?? shown ?? undefined}
 themeSwatches={themeSwatches}
            varSwatches={varSwatches}
            onChange={(next) => onChange(next)}
          />

          {named && onWeight && (
            /*
             * **How much of it**, beside the picker rather than inside it: the picker answers *which
             * colour*, and this answers *how much of that one*, which is only a question once a
             * colour has been followed rather than typed.
             */
            <label className="mt-2 flex items-center justify-between gap-2 px-1 text-[length:var(--ou-text-small)] text-[color:var(--ou-muted)]">
              진하기
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                aria-label={`${ariaLabel} 진하기`}
                value={weight ?? 100}
                onChange={(event) => {
                  const said = Number(event.currentTarget.value);
                  onWeight(Number.isFinite(said) && said >= 0 && said < 100 ? said : undefined);
                }}
                className={cn(FIELD_CONTROL, 'w-[72px] px-2 text-right')}
              />
            </label>
          )}

          {onClear && (
            <button
              type="button"
 data-swatch="none"
              aria-label={`${ariaLabel} 없음`}
              onClick={event => {
                event.preventDefault();
                onClear();
                close();
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
        </span>
      )}
    </span>
  );
}
