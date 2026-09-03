import { useEffect, useRef, useState } from 'react';
import { RgbaStringColorPicker } from 'react-colorful';
import { cn } from './cn';
import type { ThemeSwatch } from './color-field';

/**
 * A colour picker for people who choose colours for a living.
 *
 * The panel's control was an `<input type="color">` — the operating system's
 * dialog — and then a grid of swatches with a small hue/saturation square. Both
 * are pickers for somebody who wants *a* blue. A design tool has to answer the
 * questions that come after that:
 *
 * - **Opacity**, which is half of every fill in a real design and which neither
 * the OS dialog nor a hex string can express.
 * - **The value, in the notation the reader is working in** — hex when they are
 * copying from a brand guide, RGB when they are matching a screenshot.
 * - **What is already on the screen**, through the eyedropper, because most
 *   colours in a deck are chosen by pointing at something rather than by
 *   naming it.
 * - **The theme's slots**, so the answer can be "the deck's accent" rather than
 * a copy of today's accent.
 *
 * ## Why `rgba` strings and not a colour object
 *
 * Everything downstream of this — a paint, a stop, a shadow — holds *a CSS
 * colour as text*, because that is what a document can carry and a browser can
 * draw without either of them agreeing on a colour model. So the picker speaks
 * the same language, and the conversions live here rather than in five callers.
 */

export interface ColorPickerProps {
 /** A CSS colour as text: `#rrggbb`, `rgba(...)`, or a theme slot. */
  value: string;
  onChange: (value: string) => void;
  /** The deck's slots, offered above the picker — following, not copying. */
 themeSwatches?: ThemeSwatch[];
  /** The document's own named colours, offered beside them and labelled as their own thing. */
  varSwatches?: ThemeSwatch[];
  /** Recently used colours, which is the other half of how a deck stays coherent. */
  recent?: string[];
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa` → the four channels. */
function parse(value: string): { r: number; g: number; b: number; a: number } {
  const text = value.trim();

  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(text);
  if (hex) {
    const digits = hex[1];
    const pair = (start: number) => parseInt(digits.slice(start, start + 2), 16);
    const single = (at: number) => parseInt(digits[at] + digits[at], 16);

    if (digits.length === 3 || digits.length === 4) {
      return {
        r: single(0),
        g: single(1),
        b: single(2),
        a: digits.length === 4 ? single(3) / 255 : 1
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: pair(0),
        g: pair(2),
        b: pair(4),
        a: digits.length === 8 ? pair(6) / 255 : 1
      };
    }
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => Number(part.trim()));
 if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
  }

  // A named colour, a `color-mix`, a theme slot: not something to take apart.
  return { r: 0, g: 0, b: 0, a: 1 };
}

const hex2 = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');

/** What the fields show: `#rrggbb`, with the alpha as its own percentage. */
function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
 return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

function toCss({ r, g, b, a }: { r: number; g: number; b: number; a: number }): string {
  const round = (value: number) => Math.round(value);
  return a >= 1
    ? toHex({ r, g, b })
    : `rgba(${round(r)}, ${round(g)}, ${round(b)}, ${Math.round(a * 100) / 100})`;
}

export function ColorPicker({
  value,
  onChange,
  themeSwatches = [],
  varSwatches = [],
  recent = []
}: ColorPickerProps) {
  const parsed = parse(value);
  const [hexText, setHexText] = useState(() => toHex(parsed).slice(1).toUpperCase());
  const held = useRef(value);

  /**
   * The field follows the picker, and not the other way round while typing.
   *
   * A hex field that rewrote itself on every keystroke from the colour it had
   * just parsed would fight the reader mid-word: typing `#1` becomes black,
   * which becomes `000000`, which is not what they were typing. So the text is
   * this component's until the *value* changes from somewhere else.
   */
  useEffect(() => {
    if (held.current === value) return;
    held.current = value;
    setHexText(toHex(parse(value)).slice(1).toUpperCase());
  }, [value]);

  const emit = (next: string) => {
    held.current = next;
    onChange(next);
  };

  const setChannel = (patch: Partial<{ r: number; g: number; b: number; a: number }>) => {
    emit(toCss({ ...parsed, ...patch }));
  };

  /**
   * The eyedropper, where the browser has one.
   *
   * Chrome and Edge have `EyeDropper`; Safari and Firefox do not, and a button
   * that throws is worse than a button that is not there — so it is offered
   * only where it works, which is the same rule the rest of this suite follows
   * for a capability it cannot polyfill.
   */
  const hasDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
 const pick = async () => {
    try {
      const dropper = new (window as never as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
      const result = await dropper.open();
      if (result?.sRGBHex) emit(result.sRGBHex);
    } catch {
      // A reader pressing Escape cancels it, which is not a failure.
    }
  };

  return (
    <div className="flex w-[232px] flex-col gap-2" data-color-picker>
 {/* Saturation and value, with hue and alpha under it — the arrangement
          every design tool uses, because the two-dimensional choice is the one
          the eye makes and the sliders are adjustments to it. */}
      <RgbaStringColorPicker
        color={toCss(parsed)}
        onChange={(next) => emit(next)}
        className="!w-full"
 />

      <div className="flex items-center gap-1.5">
 <span
          aria-hidden
          className="h-[var(--ou-control-h)] w-[var(--ou-control-h)] shrink-0 rounded-[var(--ou-radius)] border border-[color:var(--ou-line)]"
 style={{
            // The chequerboard behind it is what makes an alpha visible at all.
            backgroundImage:
              `linear-gradient(${toCss(parsed)}, ${toCss(parsed)}),` +
              'conic-gradient(#d4d4d4 0 25%, #fff 0 50%, #d4d4d4 0 75%, #fff 0)',
 backgroundSize: 'auto, 8px 8px'
 }}
        />

        <label className="flex flex-1 items-center rounded-[var(--ou-radius)] border border-[color:var(--ou-line)] px-1">
 <span className="text-[length:var(--ou-text-small)] text-[color:var(--ou-faint)]">#</span>
 <input
            aria-label="색상 코드"
 value={hexText}
            onChange={(event) => {
              const next = event.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
 setHexText(next.toUpperCase());
              // Written when it becomes a colour and not before: `#f` would
              // paint the shape black on the way to `#ff0000`.
              if (next.length === 3 || next.length === 6) {
                emit(toCss({ ...parse(`#${next}`), a: parsed.a }));
              }
            }}
            className="w-full bg-transparent px-1 py-1 text-[length:var(--ou-text-small)] uppercase tabular-nums outline-none"
 />
        </label>

        <label className="flex w-[62px] items-center rounded-[var(--ou-radius)] border border-[color:var(--ou-line)] px-1">
 <input
            aria-label="불투명도"
 type="number"
 min={0}
            max={100}
            value={Math.round(parsed.a * 100)}
            onChange={(event) => setChannel({ a: Math.min(100, Math.max(0, Number(event.target.value))) / 100 })}
            className="w-full bg-transparent px-1 py-1 text-right text-[length:var(--ou-text-small)] tabular-nums outline-none"
 />
          <span className="text-[length:var(--ou-text-small)] text-[color:var(--ou-faint)]">%</span>
 </label>

        {hasDropper && (
          <button
            type="button"
 aria-label="화면에서 색 고르기"
 data-eyedropper
            onClick={pick}
            className="h-[var(--ou-control-h)] w-[var(--ou-control-h)] shrink-0 rounded-[var(--ou-radius)] border border-[color:var(--ou-line)] text-[length:var(--ou-text-small)]"
 >
            ⌖
          </button>
        )}
      </div>

      {themeSwatches.length > 0 && (
        <div>
          <span className="mb-1 block text-[length:var(--ou-text-label)] uppercase tracking-wide text-[color:var(--ou-muted)]">
 테마 색
          </span>
          <div className="grid grid-cols-6 gap-1">
 {themeSwatches.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
 data-theme-swatch={swatch.value}
                aria-label={swatch.label}
                title={swatch.label}
                onClick={() => emit(swatch.value)}
                className={cn(
                  'h-5 w-5 rounded-sm border border-[color:var(--ou-line)]',
                  'transition-[outline-color] duration-[var(--ou-quick)]',
                  'hover:outline hover:outline-2 hover:outline-[color:var(--ou-accent)]',
                  value === swatch.value && 'outline outline-2 outline-[color:var(--ou-accent)]'
                )}
                style={{ background: swatch.colour }}
              />
            ))}
          </div>
        </div>
      )}

      {/*
        * The document's own colours, in their own section.
        *
        * Not mixed into 테마 색, because the two are different promises: a theme slot is one of a
        * fixed twelve and re-colouring the deck changes it, a document variable is a name the author
        * made and only they change it. A reader choosing "follow something" has to be able to see
        * which something.
        */}
      {varSwatches.length > 0 && (
        <div>
          <span className="mb-1 block text-[length:var(--ou-text-label)] uppercase tracking-wide text-[color:var(--ou-muted)]">
            문서 변수
          </span>
          <div className="grid grid-cols-6 gap-1">
            {varSwatches.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                data-var-swatch={swatch.value}
                aria-label={swatch.label}
                title={swatch.label}
                onClick={() => emit(swatch.value)}
                className={cn(
                  'h-5 w-5 rounded-sm border border-[color:var(--ou-line)]',
                  'transition-[outline-color] duration-[var(--ou-quick)]',
                  'hover:outline hover:outline-2 hover:outline-[color:var(--ou-accent)]',
                  value === swatch.value && 'outline outline-2 outline-[color:var(--ou-accent)]'
                )}
                style={{ background: swatch.colour }}
              />
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <span className="mb-1 block text-[length:var(--ou-text-label)] uppercase tracking-wide text-[color:var(--ou-muted)]">
 최근 사용
          </span>
          <div className="grid grid-cols-6 gap-1">
 {recent.map((colour) => (
              <button
                key={colour}
                type="button"
 data-recent-swatch={colour}
                aria-label={colour}
                title={colour}
                onClick={() => emit(colour)}
                className="h-5 w-5 rounded-sm border border-[color:var(--ou-line)]"
                style={{ background: colour }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
