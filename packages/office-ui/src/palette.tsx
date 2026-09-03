import { useEffect, useRef, useState } from 'react';
import * as RadixToolbar from '@radix-ui/react-toolbar';
import { cn } from './cn';
import { STATE } from './controls';
import { useInToolbar } from './toolbar';

/**
 * A toolbar control that opens a set of colours.
 *
 * ## Why not a `<select>`
 *
 * A colour is not one of a list. The swatches are a convenience — the answers
 * worth one press — and *any* colour is a legitimate one, so the panel offers
 * both: a grid of the common ones and a free field beside them. A dropdown of
 * fifteen named colours would be a worse version of the grid and would still
 * have nowhere to put the sixteenth.
 *
 * ## The constraint the whole ribbon is built around
 *
 * **Nothing here may take focus from the editor.** A command acts on the
 * selection, and the selection goes the moment focus leaves the document — which
 * is why every button in this toolbar acts on `pointerdown` with the default
 * prevented rather than on `click`. A panel that opened on click, or a swatch
 * that was a focusable button, would apply its colour to a selection that no
 * longer existed.
 *
 * So: the trigger and the swatches are pointer-driven and prevent their default,
 * the panel is closed by a pointer landing outside it or by Escape, and the one
 * element that *is* focusable — the free colour field — is the browser's own
 * input, which opens a picker of its own and hands the value back.
 */
export interface Swatch {
 value: string;
  label: string;
}

/** Word writes colours as bare hex; the browser's input wants a `#`. */
const withHash = (value: string): string => (value.startsWith('#') ? value : `#${value}`);
const withoutHash = (value: string): string => value.replace(/^#/, '').toUpperCase();

export function ColorPalette({
 id,
  label,
  icon,
  value,
  swatches,
  disabled,
  clearLabel,
  onPick,
  onClear
}: {
  id: string;
  label: string;
  /** What the trigger shows above the colour bar. */
  icon: React.ReactNode;
  /** The current colour as bare hex, or `null` for none or a disagreement. */
  value: string | null;
  swatches: Swatch[];
  disabled?: boolean;
  /** The wording for "no colour"; absent when this palette cannot clear. */
 clearLabel?: string;
  onPick: (value: string) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  /*
   * A toolbar button in a toolbar, an ordinary button anywhere else — see `useInToolbar`. The two
   * take the same props and draw the same element; the only difference is the arrow-key order this
   * one joins, which is worth having where there is one and fatal to ask for where there is not.
   */
  const Trigger = useInToolbar() ? RadixToolbar.Button : 'button';

  /**
   * Close on a pointer outside, or on Escape.
   *
   * `pointerdown` rather than `click`, so the panel is gone before the pointer
   * reaches whatever is underneath — a click-based close leaves the panel
   * covering the thing that was clicked for the rest of the gesture.
   */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
 };

    document.addEventListener('pointerdown', onPointerDown, true);
 document.addEventListener('keydown', onKeyDown, true);
 return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
 document.removeEventListener('keydown', onKeyDown, true);
 };
  }, [open]);

  const choose = (colour: string) => {
    onPick(withoutHash(colour));
    setOpen(false);
  };

  return (
    <span ref={host} className="relative inline-flex">
 <Trigger
        type="button"
        data-control={id}
        data-open={open ? 'true' : 'false'}
 aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        // Pointer down with the default prevented, like every other control
        // here: a click moves focus out of the editor and the selection the
        // command needs goes with it.
        onPointerDown={(event) => {
          event.preventDefault();
          setOpen((wasOpen) => !wasOpen);
        }}
        className={cn(
          'inline-flex h-[var(--ou-control-h)] min-w-[var(--ou-control-h)] flex-col items-center justify-center',
          'rounded-[var(--ou-radius)] border border-transparent px-1',
          'text-[length:var(--ou-text)] leading-none hover:bg-[color:var(--ou-ground)]',
          STATE,
          'disabled:pointer-events-none disabled:opacity-40',
          // The suite's accent, not Tailwind's sky — the same second accent the toolbar had.
          'data-[open=true]:border-[color:var(--ou-accent)] data-[open=true]:bg-[color:var(--ou-accent-soft)]'
        )}
      >
        <span>{icon}</span>
        {/* The bar under the letter, which is how every word processor shows
            what this button would apply. Transparent when there is none, so the
            button does not claim a colour the selection does not have. */}
        <span
          data-current={value ?? 'none'}
 className="mt-0.5 h-1 w-4 rounded-sm border border-[color:var(--ou-line)]"
 style={{ background: value ? withHash(value) : 'transparent' }}
 />
      </Trigger>

      {open && (
        <span
          role="group"
 aria-label={label}
          data-palette={id}
          className={cn(
            'absolute left-0 top-full z-[var(--ou-z-popover)] mt-1 w-max p-2',
            'rounded-[var(--ou-radius)] border border-[color:var(--ou-line)] bg-[color:var(--ou-panel)]',
            'shadow-[var(--ou-lift-2)]'
          )}
        >
          <span className="grid grid-cols-5 gap-1">
 {swatches.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
 data-swatch={swatch.value}
                aria-label={swatch.label}
                title={swatch.label}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(swatch.value);
                }}
                className={cn(
                  'h-5 w-5 rounded-sm border border-[color:var(--ou-line)]',
                  'transition-[outline-color] duration-[var(--ou-quick)]',
                  'hover:outline hover:outline-2 hover:outline-[color:var(--ou-accent)]',
                  value === swatch.value && 'outline outline-2 outline-[color:var(--ou-accent)]'
                )}
                style={{ background: withHash(swatch.value) }}
              />
            ))}
          </span>

          <span className="mt-2 flex items-center gap-2">
 {/*
              The sixteenth colour. A real `<input type="color">` because the
 browser already has a colour picker and it is the one the reader
              knows — and because it is the only focusable thing in here, which
              is a deliberate exception: it hands the value back through
              `onChange`, and the command runs against the selection the editor
              still holds.
            */}
            <input
              type="color"
 aria-label={`${label}: 다른 색`}
              value={value ? withHash(value) : '#000000'}
 onChange={(event) => choose(event.target.value)}
              className="h-6 w-8 shrink-0 cursor-pointer rounded-[var(--ou-radius)] border border-[color:var(--ou-line)] bg-transparent p-0.5"
 />
            {clearLabel && (
              <button
                type="button"
 data-swatch="none"
                aria-label={clearLabel}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onClear?.();
                  setOpen(false);
                }}
                className={cn(
                  'rounded-[var(--ou-radius)] border border-[color:var(--ou-line)] px-2 py-0.5 text-[length:var(--ou-text-small)]',
                  'hover:bg-[color:var(--ou-ground)]',
                  STATE
                )}
              >
                {clearLabel}
              </button>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
