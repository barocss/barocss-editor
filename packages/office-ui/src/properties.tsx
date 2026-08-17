import { cn } from './cn';

/**
 * The properties of the thing that is selected.
 *
 * Every Office product has this panel and they all have the same shape: labelled
 * rows in groups, numbers in columns that line up, and a value that says nothing
 * rather than lying when the selection does not agree. Word calls it Format,
 * PowerPoint calls it Format Shape, and a reader who has used either should not
 * have to learn the other.
 *
 * ## What these controls will not do
 *
 * **Hold state.** A field that remembers what was typed is a field that
 * disagrees with the document after an undo — which is the same rule the toolbar
 * model states and the reason it is repeated here: a property panel is
 * *entirely* fields, so it is where the temptation is greatest. The value comes
 * from the model on every render and goes back through a command.
 *
 * **Guess at a mixed selection.** Two boxes at different widths have no width.
 * `null` is drawn as an empty field with a placeholder, so committing an empty
 * field is a no-op rather than setting both to zero.
 */
export function PropertyPanel({
  title,
  children,
  className
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label={title}
      className={cn(
        'office-properties flex w-64 shrink-0 flex-col overflow-y-auto',
        'border-l border-neutral-200 bg-white text-neutral-900',
        'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100',
        className
      )}
    >
      <h2 className="border-b border-neutral-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800">
        {title}
      </h2>
      <div className="flex flex-col gap-4 p-3">{children}</div>
    </aside>
  );
}

/** A titled group of rows, the way a Format pane divides itself up. */
export function PropertyGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[11px] font-medium text-neutral-500">{label}</h3>
      {children}
    </section>
  );
}

/** A row: a label on the left, the controls on the right. */
export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-neutral-500">{label}</span>
      <span className="flex flex-1 items-center gap-1.5">{children}</span>
    </label>
  );
}

/**
 * A number a reader types, committed when they are done with it.
 *
 * Committed on blur and on Enter, never on every keystroke. Word learned this
 * on the ruler: writing on every pointer move made one drag into ten entries of
 * the document's history. A field that committed per keypress would make
 * "1440" four edits, three of which are positions the box was never meant to be
 * in, and a reader's undo would walk back through them one digit at a time.
 *
 * Escape abandons what was typed, which is the only way out of a half-typed
 * number that does not change the document.
 */
export function PropertyNumber({
  value,
  onCommit,
  suffix,
  disabled,
  ariaLabel,
  step = 1
}: {
  /** `null` when the selection does not agree, drawn as empty. */
  value: number | null;
  onCommit: (value: number) => void;
  suffix?: string;
  disabled?: boolean;
  ariaLabel: string;
  step?: number;
}) {
  const shown = value === null ? '' : String(Math.round(value * 100) / 100);

  const commit = (text: string) => {
    const parsed = Number.parseFloat(text);
    // An emptied field is "leave it alone", not "set it to zero" — the only
    // reading that lets a reader clear a mixed value and change their mind.
    if (!Number.isFinite(parsed)) return;
    if (parsed === value) return;
    onCommit(parsed);
  };

  return (
    <span className="inline-flex flex-1 items-center gap-1">
      <input
        type="number"
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
           * paragraph inside the box being resized: one keystroke, two edits,
           * and two presses of undo to get back. It took measuring to see why,
           * and the reason is worth writing down because it is not the obvious
           * one — the editor listens for `keydown` on its own contenteditable,
           * so the key never reached it. What reached it was **`beforeinput`**:
           * Enter's default action was still pending when `blur()` moved focus,
           * and the browser delivered it to whatever was editable next.
           *
           * So `stopPropagation` alone was not enough and was not the point.
           * Preventing the default is: this field is handling Enter, and a
           * handled key has no default left to run.
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
          'h-7 w-full min-w-0 rounded border border-neutral-300 px-1.5 text-xs tabular-nums',
          'dark:border-neutral-700 dark:bg-neutral-900',
          'disabled:pointer-events-none disabled:opacity-40'
        )}
      />
      {suffix && <span className="shrink-0 text-[11px] text-neutral-400">{suffix}</span>}
    </span>
  );
}

/**
 * A colour.
 *
 * Two controls in one, because a colour picker alone cannot express *no*
 * colour, and "no fill" is a real and common answer — a text box over a picture
 * usually wants it. The swatch sets one and the button beside it clears it.
 */
export function PropertyColor({
  value,
  onChange,
  onClear,
  disabled,
  ariaLabel
}: {
  /** `null` for none, which is not the same as white. */
  value: string | null;
  onChange: (value: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <span className="inline-flex flex-1 items-center gap-1.5">
      <input
        type="color"
        aria-label={ariaLabel}
        disabled={disabled}
        value={value ?? '#ffffff'}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-7 w-9 shrink-0 cursor-pointer rounded border border-neutral-300 bg-transparent p-0.5',
          'dark:border-neutral-700',
          'disabled:pointer-events-none disabled:opacity-40'
        )}
      />
      <span className="flex-1 text-[11px] tabular-nums text-neutral-500">{value ?? '없음'}</span>
      {onClear && (
        <button
          type="button"
          disabled={disabled || value === null}
          onClick={onClear}
          className="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
        >
          지우기
        </button>
      )}
    </span>
  );
}

/** What the panel says when nothing is selected — which is most of the time. */
export function PropertyEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-xs leading-relaxed text-neutral-500">{children}</p>;
}
