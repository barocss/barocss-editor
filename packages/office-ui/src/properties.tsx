import { cn } from './cn';
import { CONTROL, NumberField } from './controls';

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
  className,
  /**
   * Something small beside the title — a unit picker, and nothing bigger.
   *
   * The panel's own header is the one place a setting *about* the panel belongs:
   * putting a unit control in a group would make it look like a property of
   * whatever is selected, which it is not.
   */
  action
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <aside
      aria-label={title}
      className={cn(
        /*
         * 288px, up from 256.
         *
         * A fill row is a swatch, a kind, an opacity, an eye and a bin — five
         * controls — and at 256 the opacity box showed "10C". The panel's width
 * is not a taste: it is whatever the widest row honestly needs.
 */
        'office-properties flex w-72 shrink-0 flex-col overflow-y-auto',
 'border-l border-[color:var(--ou-line)] bg-[color:var(--ou-panel)] text-[color:var(--ou-ink)]',
 className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--ou-line)] px-3 py-1.5">
 <h2 className="text-[length:var(--ou-text-small)] font-semibold uppercase tracking-wider text-[color:var(--ou-muted)]">
 {title}
        </h2>
        {action}
      </div>
      {/* No padding here: a section's rule has to reach both edges, so the
          padding belongs to the sections. */}
      <div className="flex flex-col">{children}</div>
 </aside>
  );
}

/** A titled group of rows, the way a Format pane divides itself up. */
/**
 * A section of the panel, with a rule above it.
 *
 * The panel was a stack of headed lists with even spacing throughout, and a
 * reader scanning it had nothing to tell them where one thing ended and the next
 * began — everything looked like one long form. Figma's answer, which every
 * design tool has since copied, is a hairline between sections and a header row
 * that can hold an action: the rule does the separating, so the spacing can be
 * tight, and the header is where "add another fill" belongs because that is what
 * the section *is*.
 *
 * `action` rather than a slot for anything: a section header holds one control,
 * and a second would be a toolbar nobody asked for.
 */
export function PropertyGroup({
 label,
 action,
  children
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-1.5 px-3 py-2.5',
 // The rule between sections, and none above the first: a line at the top
        // of a panel is a line under its own header.
        'border-t border-[color:var(--ou-line)] first:border-t-0'
 )}
    >
      <div className="flex h-5 items-center justify-between">
 <h3 className="text-[length:var(--ou-text-small)] font-semibold uppercase tracking-wide text-[color:var(--ou-muted)]">
 {label}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The panel's tabs.
 *
 * A shape has two kinds of answer — what it *is* and what it *does* — and they
 * are used at different times: nobody sets a corner radius and an entrance
 * effect in the same minute. One column of nine sections made the second kind
 * something a reader scrolled past, which is how a feature comes to look
 * missing.
 */
export function PropertyTabs({
  tabs,
  active,
  onChange
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
 aria-label="속성 탭"
 className="flex border-b border-[color:var(--ou-line)] px-1"
 >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
 role="tab"
 data-tab={tab.id}
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex-1 border-b-2 px-2 py-1.5 text-[11px] font-medium',
 tab.id === active
              ? 'border-[color:var(--ou-accent)] text-[color:var(--ou-ink)]'
 : 'border-transparent text-[color:var(--ou-muted)] hover:text-[color:var(--ou-ink)]'
 )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** A row: a label on the left, the controls on the right. */
export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-xs">
 <span className="w-[var(--ou-label-w)] shrink-0 truncate text-[color:var(--ou-muted)]">{label}</span>
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
  /**
   * `NumberField` in a row's shape — and it used to be a **second copy** of it.
   *
   * The two were the same control written twice: the same `key`/`defaultValue`
   * trick, the same "an emptied field means leave it alone", the same Enter that
   * has to be prevented rather than merely stopped. `controls.tsx` even said it
   * was "the same code rather than a second copy of it", which was true of the
   * rule and not of the code. One of them is enough, and the lesson that took a
   * browser to find — Enter's pending `beforeinput` splitting the paragraph inside
   * the box being resized — now lives in exactly one place.
   *
   * What a row genuinely wants differently is the two decimals (a third decimal of
   * a centimetre is noise) and a little more padding.
   */
  return (
    <NumberField
      value={value}
      onCommit={onCommit}
      suffix={suffix}
      step={step}
      decimals={2}
      padding="px-1.5"
      disabled={disabled}
      ariaLabel={ariaLabel}
    />
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
          CONTROL,
          'w-[calc(var(--ou-control-h)*1.3)] shrink-0 cursor-pointer bg-transparent p-0.5',
 'disabled:pointer-events-none disabled:opacity-40'
 )}
      />
      <span className="flex-1 text-[length:var(--ou-text-small)] tabular-nums text-[color:var(--ou-muted)]">
 {value ?? '없음'}
 </span>
      {onClear && (
        <button
          type="button"
 disabled={disabled || value === null}
          onClick={onClear}
          className="rounded-[var(--ou-radius)] px-1.5 py-0.5 text-[length:var(--ou-text-small)] text-[color:var(--ou-muted)] hover:bg-[color:var(--ou-ground)] disabled:opacity-40"
 >
          지우기
        </button>
      )}
    </span>
  );
}

/**
 * A property that is either on or off.
 *
 * A checkbox rather than a toggle switch: the panel is a form, the value is the
 * document's, and a switch reads as a setting the panel owns. `label` sits
 * beside it rather than in the row's label so a group can hold several without
 * a column of near-empty rows.
 */
export function PropertyToggle({
 value,
  onChange,
  label,
  disabled,
  ariaLabel
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <label className="inline-flex flex-1 items-center gap-1.5 text-[length:var(--ou-text)] text-[color:var(--ou-ink)]">
 <input
        type="checkbox"
 aria-label={ariaLabel}
        disabled={disabled}
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 shrink-0 accent-blue-600 disabled:opacity-40"
 />
      {label}
    </label>
  );
}

/**
 * One of a few named choices.
 *
 * A plain `<select>` rather than the toolbar's `ChoiceSelect`: that one is built
 * for a ribbon — a wide trigger, a long list, a value that may be nothing at all
 * — and a property row wants the browser's own control, which is already
 * keyboard-accessible and already looks like a form.
 */
export function PropertyChoice({
 value,
  options,
  onChange,
  disabled,
  ariaLabel
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        CONTROL,
        'w-full min-w-0 bg-transparent px-1'
      )}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * What the panel says when nothing is selected — which is most of the time.
 *
 * Padded like the panel's own header, because it is the only child that arrives without a group
 * around it: a group brings its own padding, and this had `px-1`, so the one thing a reader sees
 * most often was the one thing pressed against the edge. Found in a third product and fixed here
 * rather than there — a control that needs the app to finish its layout is a control every app will
 * finish differently.
 */
export function PropertyEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-2 text-[length:var(--ou-text)] leading-relaxed text-[color:var(--ou-muted)]">
      {children}
    </p>
  );
}
