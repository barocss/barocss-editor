import { useEffect, useRef, useState } from 'react';
import { RgbaStringColorPicker } from 'react-colorful';
import { cn } from './cn';
import { Choice, NumberField, FIELD_CONTROL } from './controls';
import type { ThemeSwatch } from './color-field';
import { parseColor as parse, colorHex as toHex, colorCss as toCss, colorChannels, channelsColor, type ColorChannels, type ColorFormat } from './color-formats';

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
  /** Resolved CSS colour when value names a theme slot or variable. */
  resolvedValue?: string;
  onChange: (value: string) => void;
  /** The deck's slots, offered above the picker — following, not copying. */
 themeSwatches?: ThemeSwatch[];
  /** The document's own named colours, offered beside them and labelled as their own thing. */
  varSwatches?: ThemeSwatch[];
  /** Recently used colours, which is the other half of how a deck stays coherent. */
  recent?: string[];
}

export function ColorPicker({
  value,
  onChange,
  resolvedValue,
  themeSwatches = [],
  varSwatches = [],
  recent = []
}: ColorPickerProps) {
  const displayValue = resolvedValue ?? [...themeSwatches, ...varSwatches].find(swatch => swatch.value === value)?.colour ?? value;
  const parsed = parse(displayValue);
  const [format, setFormat] = useState<ColorFormat>('hex');
  // Preserve hue/saturation while editing grey or black, where RGB cannot encode them.
  const [channelDraft, setChannelDraft] = useState<{ format: ColorFormat; value: string; channels: ColorChannels }>();
  const channels = format === 'hex' ? null : channelDraft?.format === format && channelDraft.value === displayValue
    ? channelDraft.channels : colorChannels(parsed, format);
  const editChannel = (index: number, value: number) => {
    if (!channels || format === 'hex') return;
    const next: ColorChannels = [...channels];
    next[index] = value;
    const css = toCss(channelsColor(next, format, parsed.a));
    setChannelDraft({ format, value: css, channels: next });
    emit(css);
  };
  const [hexText, setHexText] = useState(() => toHex(parsed).slice(1).toUpperCase());
  const held = useRef(displayValue);

  /**
   * The field follows the picker, and not the other way round while typing.
   *
   * A hex field that rewrote itself on every keystroke from the colour it had
   * just parsed would fight the reader mid-word: typing `#1` becomes black,
   * which becomes `000000`, which is not what they were typing. So the text is
   * this component's until the *value* changes from somewhere else.
   */
  useEffect(() => {
    if (held.current === displayValue) return;
    held.current = displayValue;
    setHexText(toHex(parse(displayValue)).slice(1).toUpperCase());
  }, [displayValue]);

  const emit = (next: string, typing = false) => {
    const resolved = [...themeSwatches, ...varSwatches].find(swatch => swatch.value === next)?.colour ?? next;
    held.current = resolved;
    if (!typing) setHexText(toHex(parse(resolved)).slice(1).toUpperCase());
    onChange(next);
  };

  const setChannel = (patch: Partial<{ r: number; g: number; b: number; a: number }>) => {
    const css = toCss({ ...parsed, ...patch });
    if (channelDraft?.value === displayValue) setChannelDraft({ ...channelDraft, value: css });
    emit(css);
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
    <div className="office-color-picker" data-color-picker onKeyDown={event => {
      // Colour controls own typing and slider keys, not the editor behind them.
      event.stopPropagation();
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (event.target instanceof HTMLInputElement) event.target.blur();
      }
    }}>
 {/* Saturation and value, with hue and alpha under it — the arrangement
          every design tool uses, because the two-dimensional choice is the one
          the eye makes and the sliders are adjustments to it. */}
      <RgbaStringColorPicker
        color={`rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${parsed.a})`}
        onChange={(next) => emit(next)}
        className="!w-full"
 />

      <div className="office-color-values">
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

        <Choice ariaLabel="색상 형식" value={format} onChange={next => setFormat(next as ColorFormat)}>
          <option value="hex">HEX</option>
          <option value="rgb">RGB(A)</option>
          <option value="hsl">HSL</option>
          <option value="hsb">HSB</option>
          <option value="okhsl">OKHSL</option>
        </Choice>
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
      <div className={format === 'hex' ? 'office-color-values' : 'office-color-channels'}>
        {format === 'hex' ? (
        <label className="office-color-hex">
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
                emit(toCss({ ...parse(`#${next}`), a: parsed.a }), true);
              }
            }}
            onBlur={() => setHexText(toHex(parsed).slice(1).toUpperCase())}
            className={cn(FIELD_CONTROL, 'w-full min-w-0 px-2 uppercase tabular-nums')}
            spellCheck={false}
            autoComplete="off"
 />
        </label>
        ) : channels?.map((value, index) => {
          const names = format === 'rgb' ? ['R', 'G', 'B'] : ['H', 'S', format === 'hsb' ? 'B' : 'L'];
          const suffix = format === 'rgb' ? '' : index === 0 ? '°' : '%';
          return <label className="office-color-channel" key={`${format}-${index}`}>
            <span>{names[index]}{suffix}</span>
            <NumberField ariaLabel={`${format.toUpperCase()} ${names[index]}`} value={value}
              min={0} max={format === 'rgb' ? 255 : index === 0 ? 360 : 100}
              className="min-w-0 w-full" decimals={format === 'rgb' ? 0 : 1} step={1} onCommit={next => editChannel(index, next)} />
          </label>;
        })}

        <label className="office-color-channel office-color-alpha">
        {format !== 'hex' && <span>A %</span>}
        <NumberField ariaLabel="불투명도" value={Math.round(parsed.a * 100)} min={0} max={100}
          suffix={format === 'hex' ? '%' : undefined} onCommit={alpha => setChannel({ a: alpha / 100 })} className="min-w-0 w-full" />
        </label>


      </div>

      {themeSwatches.length > 0 && (
        <div>
          <span className="mb-1 block text-[length:var(--ou-text-label)] uppercase tracking-wide text-[color:var(--ou-muted)]">
 테마 색
          </span>
          <div className="office-color-swatches">
 {themeSwatches.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
 data-theme-swatch={swatch.value}
                aria-label={swatch.label}
                title={swatch.label}
                aria-pressed={value === swatch.value}
                onClick={() => emit(swatch.value)}
                className={cn(
                  'office-color-swatch',
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
          <div className="office-color-swatches">
            {varSwatches.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                data-var-swatch={swatch.value}
                aria-label={swatch.label}
                title={swatch.label}
                aria-pressed={value === swatch.value}
                onClick={() => emit(swatch.value)}
                className={cn(
                  'office-color-swatch',
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
          <div className="office-color-swatches">
 {recent.map((colour) => (
              <button
                key={colour}
                type="button"
 data-recent-swatch={colour}
                aria-label={colour}
                title={colour}
                aria-pressed={value === colour}
                onClick={() => emit(colour)}
                className="office-color-swatch"
                style={{ background: colour }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
