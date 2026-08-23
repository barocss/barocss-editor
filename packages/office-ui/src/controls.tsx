import type React from 'react';
import { cn } from './cn';

/**
 * The three controls a product reaches for constantly, and had to hand-roll.
 *
 * ## What was missing, counted
 *
 * `office-ui` exported a colour field, a Radix dropdown, a dialog, a toolbar and
 * nine property-panel rows — and **no button, no bare field**. Measured in the
 * deck app on 2026-08-20: 47 hand-written `<button>`s, 17 `<select>`s and 15
 * `<input>`s, each with its own class list in a 1,619-line stylesheet.
 *
 * That is not carelessness. There was nothing to use, so every new control was a
 * choice between inventing one and inventing one — and the *panel's* rows were no
 * help, because a panel row is 28px and an instrument's is 22px.
 *
 * ## The one that was not only a style
 *
 * `NumberField` exists because the hand-rolled version was **wrong**, and it took
 * a browser to see it. The deck's timeline drew its length as a controlled
 * `<input type="number">` writing on every keystroke, and typing `1.8` one
 * character at a time put **10680ms** in the document: React rewrote the field's
 * value from the model between keystrokes, so the typed characters interleaved
 * with the rewritten ones. Two presses of undo to get back.
 *
 * A number a reader is *typing* is not a value yet. So the field holds its own
 * text until the reader is done with it — blur, or Enter — which is the rule
 * `PropertyNumber` already followed and the reason this is the same code rather
 * than a second copy of it.
 */

/**
 * What a control is drawn with, in tokens — see `tokens.css`.
 *
 * One string, used by every control in this package, so a button and a field
 * beside it cannot come out different heights. Tailwind's arbitrary values rather
 * than its palette: the palette is the product's, and this package is not the
 * product.
 *
 * Exported because the components written before this file — the colour field,
 * the panel's rows — were each carrying their own copy of it in Tailwind greys,
 * which is what made a shared control look foreign in a product's own panel.
 */
export const CONTROL = [
 'h-[var(--ou-control-h)] rounded-[var(--ou-radius)] text-[length:var(--ou-text)]',
 'border border-[color:var(--ou-line)] text-[color:var(--ou-ink)]',
 'disabled:pointer-events-none disabled:opacity-40'
].join(' ');

export type ButtonTone = 'plain' | 'accent';

/**
 * A hit target around one icon, and nothing else.
 *
 * ## Why this is not `Button square`
 *
 * `Button` is a **form control**: it has a border, it is `--ou-control-h` tall, and it
 * belongs in a row of fields. Most of the icons in this suite are not that — they are the
 * eye and the lock in a 26px list row, the × on a pane, the ‹ › of a find bar. Drawn with a
 * form control they are too tall and wear a border nothing else in the row has; so every
 * caller drew its own, and by the time this was counted there were three panes whose close
 * buttons were three different sizes and one of them bordered.
 *
 * ## The label is required, and that is the point
 *
 * An icon has no text, so the accessible name is the only name it has — and it is the thing
 * a hand-rolled one forgets. Three of the callers migrated here had `title` and no
 * `aria-label`; one had neither. Taking one string and writing both is the whole reason this
 * is a component rather than a class name.
 */
export function IconButton({
  label,
  children,
  onClick,
  pressed,
  disabled,
  size = 'md',
  className,
  testClass,
  data
}: {
  /** What it does, in words. Becomes both the title and the accessible name. */
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  /** A toggle's state — the eye, the lock. Omitted for a button that only does something. */
  pressed?: boolean;
  disabled?: boolean;
  /**
   * `sm` for an icon inside a list row, `md` for one standing on its own.
   *
   * Two sizes and no more: the reason a row's icon is smaller is that the row is, and
   * anything between the two would be a size chosen by eye.
   */
  size?: 'sm' | 'md';
  className?: string;
  testClass?: string;
  data?: Record<string, string | undefined>;
}) {
  return (
    <button
      type="button"
      // Both, from the one string: a pointer reads the title and a screen reader reads the
      // name, and an icon button that has one and not the other is a control only half the
      // readers can use.
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      {...Object.fromEntries(
        Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value])
      )}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center',
        'rounded-[var(--ou-radius)] border border-transparent text-[color:var(--ou-ink)]',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 'sm'
          ? 'h-[var(--ou-icon-h)] w-[var(--ou-icon-h)]'
          : 'h-[var(--ou-control-h)] w-[var(--ou-control-h)]',
        // No ground of its own: it sits on a pane, a row or a bar, and a button with a
        // background in a list row draws a grid nobody asked for.
        'bg-transparent hover:bg-[color:var(--ou-ground)]',
        // A pressed toggle is the accent, whatever its size: "this one is on" is one idea
        // and one colour — the same rule `Button` follows.
        pressed && 'bg-[color:var(--ou-accent)] text-[color:var(--ou-accent-ink)]',
        testClass,
        className
      )}
    >
      {children}
    </button>
  );
}



/**
 * A button.
 *
 * `plain` is every button in a panel; `accent` is the one that commits — and a
 * surface with two accented buttons has none, so the tone is deliberately not a
 * per-button decision a reader makes by feel.
 *
 * `pressed` rather than a variant, because a toggle is a *state* of a button and
 * drawing it as a different component is how a toolbar ends up with two kinds of
 * on. It writes `aria-pressed`, which is also what a test asks about.
 */
export function Button({
 children,
 onClick,
  tone = 'plain',
 pressed,
  disabled,
  ariaLabel,
  title,
  square,
  className,
  testClass,
  data
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: ButtonTone;
  /** A toggle's state. Omitted for a button that only does something. */
  pressed?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  /** An icon button: as wide as it is tall, which is what a strip of them needs. */
  square?: boolean;
  className?: string;
  /** The product's own hook, for its tests and its styles. */
 testClass?: string;
  /** `data-` attributes the product hangs its own behaviour on. */
  data?: Record<string, string | undefined>;
}) {
  return (
    <button
      type="button"
 aria-label={ariaLabel}
      aria-pressed={pressed}
      title={title}
      disabled={disabled}
      onClick={onClick}
      {...Object.fromEntries(
        Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value])
      )}
      className={cn(
        CONTROL,
        'inline-flex shrink-0 items-center justify-center gap-1 leading-none',
 square ? 'w-[var(--ou-control-h)] px-0' : 'px-2',
 tone === 'accent'
 ? 'border-transparent bg-[color:var(--ou-accent)] text-[color:var(--ou-accent-ink)]'
 : 'bg-transparent hover:bg-[color:var(--ou-ground)]',
 // A pressed toggle is the accent, whatever its tone: "this one is on" is
 // one idea and one colour.
        pressed && 'border-transparent bg-[color:var(--ou-accent)] text-[color:var(--ou-accent-ink)]',
 'cursor-pointer',
 testClass,
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * A dropdown, native.
 *
 * Native rather than Radix — which `ChoiceSelect` is — and the two are not
 * competing: a ribbon's font picker draws its options in their own faces and has
 * to be built; a panel's dropdown is a list of words, where the platform's own
 * control is smaller, faster, and already knows how to be typed into. The
 * products had already sorted themselves this way (the ribbon uses
 * `ChoiceSelect`, the panels a plain `<select>`); this is that rule with a name.
 */
export function Choice({
 value,
  onChange,
  children,
  disabled,
  ariaLabel,
  className,
  testClass,
  data
}: {
  value: string;
  onChange: (value: string) => void;
  /** `<option>`s and `<optgroup>`s — a grouped list is most of the interesting ones. */
  children: React.ReactNode;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  testClass?: string;
  data?: Record<string, string | undefined>;
}) {
  return (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      {...Object.fromEntries(
        Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value])
      )}
      className={cn(CONTROL, 'w-full min-w-0 bg-transparent px-1', testClass, className)}
 >
      {children}
    </select>
  );
}

/**
 * A number a reader types, committed when they are done with it.
 *
 * Not on every keystroke, and this is the measured reason rather than a
 * preference:
 *
 * - **The value fights the typing.** A controlled field written from the model
 *   each keystroke interleaves the reader's characters with the model's — `1.8`
 * typed into the deck's length field produced 10.68 seconds.
 * - **The history fills with positions nothing was ever meant to be in.** Three
 *   characters was two undos.
 *
 * So: `defaultValue`, keyed by the model's value so an undo or a drag from
 * elsewhere redraws it, committed on blur and on Enter, abandoned on Escape.
 *
 * The keys are stopped and Enter's default prevented, which is a *third* thing
 * measured rather than guessed — in Word, the Enter that committed a number also
 * split the paragraph inside the box being resized, because `blur()` left
 * `beforeinput`'s default action pending and the browser delivered it to whatever
 * was editable next. It does not reproduce from a deck's timeline (nothing is
 * being edited there), and it is the same field.
 */
export function NumberField({
 value,
  onCommit,
  suffix,
  min,
  max,
  step = 1,
  decimals = 3,
  disabled,
  ariaLabel,
  className,
  testClass,
  padding = 'px-1'
}: {
  /** `null` when the selection does not agree, drawn as empty. */
  value: number | null;
  onCommit: (value: number) => void;
  /** The unit, after the number it belongs to. */
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  /**
   * How many decimals to *show* — not to store, which is the model's business.
   *
   * A real difference rather than a knob: a length in centimetres wants two (a
   * third decimal of a centimetre is noise a reader has to read past), and a
   * duration in seconds wants three, because 125ms is `0.125` and rounding it to
   * `0.13` would write 130ms back to the document the next time the field
   * committed. Both callers are in this package.
   */
  decimals?: number;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  testClass?: string;
  /** The field's own padding, which a panel row and an instrument disagree about. */
  padding?: string;
}) {
  const scale = 10 ** decimals;
  const shown = value === null ? '' : String(Math.round(value * scale) / scale);

 const commit = (text: string) => {
    const parsed = Number.parseFloat(text);
    // An emptied field is "leave it alone", not "set it to zero" — the only
 // reading that lets a reader clear a mixed value and change their mind.
    if (!Number.isFinite(parsed)) return;
    if (parsed === value) return;
    onCommit(parsed);
  };

  return (
    <span className={cn('inline-flex min-w-0 flex-1 items-center gap-1', className)}>
 <input
        type="number"
 min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        disabled={disabled}
        // Keyed by the model's value so a change from elsewhere — an undo, a
        // drag, another reader — is drawn. Without this the field keeps whatever
        // the browser has and quietly disagrees with the document.
        key={shown}
        defaultValue={shown}
        placeholder={value === null ? '—' : undefined}
 onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          /**
           * A field's keys are the field's, not the document's.
           *
           * Without this, the Enter that commits a number also split the very
           * paragraph inside the box being resized: one keystroke, two edits, and
           * two presses of undo to get back. It took measuring to see why, and the
           * reason is worth keeping because it is not the obvious one — the editor
           * listens for `keydown` on its own contenteditable, so the key never
           * reached it. What reached it was **`beforeinput`**: Enter's default
           * action was still pending when `blur()` moved focus, and the browser
           * delivered it to whatever was editable next.
           *
           * So `stopPropagation` alone was not enough and was not the point.
           * Preventing the default is: this field is handling Enter, and a handled
           * key has no default left to run.
           */
 event.stopPropagation();
          if (event.key === 'Enter' || event.key === 'Escape') event.preventDefault();
 if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
 if (event.key === 'Escape') {
 (event.target as HTMLInputElement).value = shown;
            (event.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          CONTROL,
          'w-full min-w-0 bg-transparent text-right tabular-nums',
          padding,
 testClass
        )}
      />
      {suffix && (
        <span className="shrink-0 text-[length:var(--ou-text-small)] text-[color:var(--ou-faint)] whitespace-nowrap">
 {suffix}
        </span>
      )}
    </span>
  );
}

/**
 * A plain text field, with the same commit rules as the number one.
 *
 * ## Why this exists at last
 *
 * Four callers were writing their own: Word's find panel, Word's comments pane, the
 * deck's find bar and now a connector's label. `NumberField` is numeric and `Field` is
 * the label *around* a control — there was nothing for "a line of text a reader types
 * and commits", so each one hand-rolled an `<input>` with its own idea of when the
 * value reaches the document, and the deck's raw-control ratchet counted every one.
 *
 * ## Committed, not live
 *
 * On blur and on Enter, and Escape puts back what was there. A field that wrote every
 * keystroke to the document would be a hundred history entries for one word — the same
 * reason the timeline's bars and the rulers' guides commit on release.
 *
 * The key handling is `NumberField`'s and the reason is the one worth repeating: the
 * Enter that commits also reached the paragraph inside the shape being edited, because
 * what carried it was `beforeinput` rather than `keydown`. `stopPropagation` alone does
 * not stop it; preventing the default does.
 */
export function TextField({
  value,
  onCommit,
  onChange,
  onKeys,
  placeholder,
  maxLength,
  disabled,
  ariaLabel,
  className,
  testClass,
  inputRef,
  data,
  padding = 'px-1'
}: {
  /** `null` when the selection does not agree, drawn as empty. */
  value: string | null;
  /** Committed on blur and on Enter. Leave out for a live field. */
  onCommit?: (value: string) => void;
  /**
   * Every keystroke, for a field whose *answer* changes as it is typed.
   *
   * The two are a real difference rather than a preference. A **name** is committed:
   * writing every keystroke to the document would put a hundred entries in the history
   * for one word. A **search box** is live: the count beside it answers the query as it
   * grows, and a reader who has to press Enter to see how many matches there are has
   * been given a form to fill in instead of a search.
   *
   * Given `onChange`, the caller owns the value and this draws exactly what it is
   * handed; without it the field keeps its own until it commits.
   */
  onChange?: (value: string) => void;
  /** Keys the caller wants, after this one has taken what is its own. */
  onKeys?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  testClass?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  data?: Record<string, string>;
  padding?: string;
}) {
  const shown = value ?? '';
  const live = !!onChange;

  const commit = (text: string) => {
    const next = text.trim();
    // An unchanged value is not an edit: committing it would put an entry in the
    // history for having clicked into a field and out again.
    if (next === shown.trim()) return;
    onCommit?.(next);
  };

  return (
    <input
      type="text"
      ref={inputRef}
      aria-label={ariaLabel}
      disabled={disabled}
      maxLength={maxLength}
      /**
       * A live field is drawn from the value it is given; a committed one keeps its own
       * until it commits, and is **keyed** by the model's value so a change from
       * elsewhere — an undo, a drag, another reader — is drawn rather than quietly
       * disagreed with.
       */
      {...(live ? { value: shown } : { key: shown, defaultValue: shown })}
      placeholder={placeholder ?? (value === null ? '—' : undefined)}
      onChange={live ? (event) => onChange!(event.target.value) : undefined}
      onBlur={live ? undefined : (event) => commit(event.target.value)}
      onKeyDown={(event) => {
        /**
         * A field's keys are the field's.
         *
         * Without this the Enter that commits also reaches the paragraph inside the
         * shape being edited — and `stopPropagation` alone does not stop it, because
         * what carries it is `beforeinput` rather than `keydown`. Preventing the
         * default is what does. See `NumberField` for the measurement.
         */
        event.stopPropagation();
        if (!live) {
          if (event.key === 'Enter' || event.key === 'Escape') event.preventDefault();
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          if (event.key === 'Escape') {
            (event.target as HTMLInputElement).value = shown;
            (event.target as HTMLInputElement).blur();
          }
        }
        onKeys?.(event);
      }}
      {...Object.fromEntries(
        Object.entries(data ?? {}).map(([key, value_]) => [`data-${key}`, value_])
      )}
      className={cn(CONTROL, 'w-full min-w-0 bg-transparent', padding, testClass, className)}
    />
  );
}

/**
 * A labelled row, in the shape every properties panel has: one label column, the
 * control, and the unit after it.
 *
 * The label column is a **token**, so every control on a surface starts at the
 * same x — which is the whole reason a panel of sixteen rows is readable and a
 * row of sixteen controls is not.
 *
 * A `<div>` rather than the `<label>` `PropertyRow` uses, because a row may hold
 * *two* controls (a colour and its clear button) and a label may only name one.
 * The control carries its own `aria-label`, which is what a screen reader and a
 * test both read.
 */
export function Field({
  label,
  unit,
  children,
  className,
  testClass
}: {
  label: string;
  unit?: string;
  children: React.ReactNode;
  className?: string;
  testClass?: string;
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-1.5',
 'grid-cols-[var(--ou-label-w)_minmax(0,1fr)_auto]',
 'text-[length:var(--ou-text)]',
 testClass,
        className
      )}
    >
      <span className="truncate whitespace-nowrap text-[color:var(--ou-muted)]">{label}</span>
 <span className="flex min-w-0 items-center gap-1">{children}</span>
 {unit && (
        <span className="shrink-0 whitespace-nowrap text-[length:var(--ou-text-small)] tabular-nums text-[color:var(--ou-faint)]">
 {unit}
        </span>
      )}
    </div>
  );
}

/**
 * A group of fields, named by the question its fields answer, and foldable.
 *
 * `<details>` rather than a heading and a state hook: folding is a behaviour the
 * element already has, keyboard and all, and one a reader can leave folded. Open
 * by default — a control that has to be found before it can be used is a control
 * that is not there.
 */
export function FieldGroup({
  label,
  open = true,
  children,
  className,
  testClass
}: {
  label: string;
  open?: boolean;
  children: React.ReactNode;
  className?: string;
  testClass?: string;
}) {
  return (
    <details open={open} className={cn(testClass, className)}>
      <summary
        className={cn(
          'cursor-pointer select-none py-[3px]',
 'text-[length:var(--ou-text-small)] uppercase tracking-wide text-[color:var(--ou-muted)]'
        )}
      >
        {label}
      </summary>
      <div className="flex flex-col gap-[3px] pb-1">{children}</div>
    </details>
  );
}
