import { Icon } from '@barocss/office-icons';
import { cn } from './cn';
import { CONTROL, NumberField, STATE } from './controls';

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
      /*
       * **A handle**, so the panel can be aimed at without knowing what it is styled with.
       *
       * It had none: no data attribute anywhere in this file, so a test reaching for "the panel"
       * matched a Tailwind class it does not own or an `aside` that turned out to be the rail. Which
       * is what happened — a probe written to read the panel's rows read the left sidebar's instead
       * and reported the panel as holding two groups it has never had.
       *
       * On the shared component rather than in each product, so the three panels answer to one name.
       */
      data-property-panel
      className={cn(
        /*
         * **240px**, which is what a design tool's inspector is.
         *
         * It was 288 — up from 256 because a fill row is a swatch, a kind, an opacity, an eye and a
         * bin, and at 256 the opacity box read "10C". That reasoning was right and the remedy was
         * the wrong one: the answer to a row that does not fit is a row that **wraps**, not a panel
         * that grows, and a panel grows once and then never comes back. Every serious tool of this
         * kind is between 232 and 248 — Figma 240, Sketch 240, Illustrator 232 — and the number is
         * not a taste either: it is about how far the eye travels between a label and its value.
         *
         * 48 pixels of canvas back, on every screen, for the whole life of the product.
         */
        'office-properties flex w-60 shrink-0 flex-col overflow-y-auto',
        /*
         * Inside a panel a field has no resting edge — see `--ou-field-line`. Set here rather than in
         * every control, because it is a fact about *this surface* and not about any one row.
         */
        '[--ou-field-line:transparent]',
        /*
         * And the panel's own **scale**, for the same reason: this surface is denser than a toolbar.
         *
         * A ribbon's control is a thing to press once and wants a press-sized target; a panel is
         * twenty rows a reader scans, and 28px rows with a 68px label column put a two-line gap
         * between what a value is called and what it says. The tokens are the mechanism the
         * stylesheet already had — `[data-density='dense']` says the same thing about instruments —
         * used here on the surface that needed it rather than by changing what a control is
         * everywhere.
         */
        '[--ou-control-h:24px] [--ou-text:11px] [--ou-text-small:10px] [--ou-label-w:58px]',
 'border-l border-[color:var(--ou-line)] bg-[color:var(--ou-panel)] text-[color:var(--ou-ink)]',
 className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--ou-line)] px-2 py-1.5">
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
  folded,
  onFold,
  children
}: {
  label: string;
  action?: React.ReactNode;
  /**
   * **Whether this section is put away**, and the switch that puts it away.
   *
   * Measured on a site builder's own panel: **959 pixels** of controls in five sections, all of them
   * open, so a reader who wanted a shadow scrolled past a whole arrangement and a whole size to
   * reach it. Every inspector in this class folds; this one had no way to.
   *
   * Held by the **caller**, not here, and that is the same rule the rest of this package follows: a
   * fold is a fact about *this reader, this minute* — like which width they are editing or which row
   * of a list they are looking at — and a control that remembered its own would disagree with the
   * next panel drawn from the same state. A caller that passes neither gets what it always had.
   */
  folded?: boolean;
  onFold?: (folded: boolean) => void;
  children: React.ReactNode;
}) {
  const name = `property-group-${label}`;
  return (
    <section
      className={cn(
        'flex flex-col gap-0.5 px-2 py-2',
 // The rule between sections, and none above the first: a line at the top
        // of a panel is a line under its own header.
        'border-t border-[color:var(--ou-line)] first:border-t-0'
 )}
    >
      <div className="mb-0.5 flex h-4 items-center justify-between">
        {/*
          10px and tracked, which is the size a *label* is rather than a heading: a section's name is
          there to be found when a reader looks for it and to disappear when they do not. At the
          panel's own text size it competed with the rows under it.
        */}
        {onFold ? (
          /*
            The **whole heading** is the switch, not a chevron beside it: a 10px label with a
            separate 12px target next to it is two things to aim at for one act, and the heading is
            already the width of the panel. The chevron says which way it goes.
          */
          <button
            type="button"
            /*
             * **24 tall**, which is the smallest thing a pointer is *moved to* rather than aimed at —
             * the chrome's own check, and it caught this at 16. Pulled back up by its own margin so
             * the section's rhythm is what it was: the target grew and the drawing did not.
             */
            className="-mx-1 -my-1 flex h-6 flex-1 items-center gap-1 rounded px-1 text-left hover:bg-[color:var(--ou-ground)]"
            aria-expanded={!folded}
            aria-controls={name}
            onClick={() => onFold(!folded)}
          >
            <Icon name={folded ? 'collapsed' : 'disclosed'} size={11} />
            <h3 className="text-[length:var(--ou-text-label)] font-semibold uppercase tracking-[0.08em] text-[color:var(--ou-faint)]">
              {label}
            </h3>
          </button>
        ) : (
          <h3 className="text-[length:var(--ou-text-label)] font-semibold uppercase tracking-[0.08em] text-[color:var(--ou-faint)]">
            {label}
          </h3>
        )}
        {action}
      </div>
      {/*
        `hidden` rather than not rendered: a folded section's controls keep their state — a
        half-typed number, a colour picker's open popover — and a reader who folds and unfolds
        expects to find what they left. It is also what `[hidden]` is for.
      */}
      <div id={name} hidden={folded} className="flex flex-col gap-0.5">
        {children}
      </div>
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
            'flex-1 border-b-2 px-2 py-1.5 text-[length:var(--ou-text-label)] font-medium',
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

/**
 * A row: a label on the left, the controls on the right.
 *
 * A stated **minimum** height, because a row whose height comes from whatever is in it makes a column
 * of twenty of them ripple — a toggle is 20px, a field is 28, a swatch is 24, and the eye reads the
 * ripple as misalignment rather than as variety. The label is the panel's quiet ink and truncates
 * rather than wrapping: a two-line label pushes its own control out of the rhythm it keeps.
 *
 * ## The controls wrap, and that was found in a browser
 *
 * Measured in the site builder's page tab at the panel's own width: 그라디언트 carries four controls —
 * two swatches, an angle and a shape — and needs **296 pixels in 263**. The last two were simply
 * **not on screen**: not clipped in a way a reader could scroll to, not greyed, gone. A gradient's
 * angle and whether it is linear or radial could not be reached at all. 배경 그림 was the same at 273.
 *
 * `flex-wrap` costs nothing until a row overflows and then costs one line, which is the right trade
 * for a panel where most rows hold one control and a few hold four. The alternative — capping what a
 * row may carry — moves the decision to every declaration and gets it wrong the first time somebody
 * adds a fifth.
 */
export function PropertyRow({
  label,
  icon,
  mark,
  children
}: {
  label: string;
  /**
   * A small control **beside the label**, for a row whose value came from somewhere the reader can
   * take back — a narrower width's, a state's.
   *
   * In the label column rather than beside the field, because it is about *where the value came
   * from* rather than about the value: put next to the control it reads as another way to change the
   * number, which is the one thing it does not do.
   *
   * Safe inside the `<label>` because activation is skipped when a click lands on interactive
   * content — the same rule that stops a link inside a label toggling its control.
   */
  mark?: React.ReactNode;
  /**
   * A **picture** in the label column, for a row a reader picks out by shape.
   *
   * The four corners of a box and the four sides of its padding are what every design tool draws
   * here, and this suite spelled them: 상좌 상우 하우 하좌 over four number fields. Honest, and
   * eight words where a reader is matching a shape rather than reading one.
   *
   * The column narrows to the picture, which is the point — four of these fit on a line where four
   * labelled fields wrapped onto two. `title` and the accessible name still carry the words, so
   * nothing is lost to a screen reader or to a reader who hovers.
   */
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-[var(--ou-control-h)] items-start gap-1.5 text-[length:var(--ou-text)]">
      <span
        className={`flex h-[var(--ou-control-h)] shrink-0 items-center gap-1 text-[length:var(--ou-text-small)] text-[color:var(--ou-muted)] ${
          icon ? 'w-[var(--ou-control-h)] justify-center' : 'w-[var(--ou-label-w)]'
        }`}
        title={label}
      >
        <span className={icon ? '' : 'truncate'} aria-hidden={icon ? true : undefined}>
          {icon ? <Icon name={icon} size={14} /> : label}
        </span>
        {mark}
      </span>
      {/* `items-center` within a line, so a wrapped row's two lines each sit on their own centre. */}
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</span>
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
  onClear,
  suffix,
  prefix,
  prefixIcon,
  min,
  max,
  disabled,
  ariaLabel,
  step = 1
}: {
  /** `null` when the selection does not agree, drawn as empty. */
  value: number | null;
  onCommit: (value: number) => void;
  /**
   * What an **emptied** field means, for a caller that has an answer.
   *
   * Here because `PropertySheet` needed it and could not use this wrapper without it — so the sheet
   * drew `NumberField` directly, and for a while there were two paths to one control. A caller with
   * no meaning for *take it back* leaves it off, and an emptied field stays what it was.
   */
  onClear?: () => void;
  suffix?: string;
  /** A short name inside the field, for a number that shares a line — see `NumberField`. */
  prefix?: string;
  /** A picture in place of the prefix — see `NumberField.prefixIcon`. */
  prefixIcon?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  ariaLabel: string;
  step?: number;
}) {
  /**
   * `NumberField` in a row's shape — and it used to be a **second copy** of it.
   *
   * The two were the same control written twice: the same `key`/`defaultValue`
   * trick, the same reading of an emptied field, the same Enter that has to be
   * prevented rather than merely stopped. `controls.tsx` even said it
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
      onClear={onClear}
      suffix={suffix}
      prefix={prefix}
      prefixIcon={prefixIcon}
      min={min}
      max={max}
      step={step}
      decimals={2}
      /*
       * A prefixed field has its left padding **already**, in the shape of its own name — measured
       * on the gradient row, `각도` plus `px-1.5` left an input 40 pixels wide needing 44, so the
       * last digit of `180` was cut. Padding twice is what made it four short.
       */
      padding={prefix || prefixIcon ? 'pl-0 pr-1.5' : 'px-1.5'}
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
  /**
   * The word beside the box — **or nothing**, when the row it sits in already carries it.
   *
   * A toggle that is a row's own control was drawing its name a second time: `보임  ☐ 보임`, on every
   * switch in the panel. A companion keeps its text, because there is no label beside it to borrow.
   */
  label?: string;
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
        /**
         * **A box of 14 and a target of 24**, which are two different numbers on purpose.
         *
         * A tick that *looks* right at 14 is a thing a pointer has to be aimed at rather than moved
         * to, and on a trackpad that is the difference between one gesture and two. Every design
         * tool draws a small box and gives it a large hit area; this drew a small box and a small hit
         * area, and the chrome sweep said so the moment the page pane grew three of them.
         *
         * A negative margin so the row's rhythm is unchanged: the target grows outwards into padding
         * that was already there, which is why this costs nothing above or below it.
         */
        /**
         * **A box of 16 and a target of 24**, which are two numbers on purpose.
         *
         * A tick that looks right at 14 is a thing a pointer has to be *aimed at* rather than moved
         * to, and on a trackpad that is the difference between one gesture and two. Measured by the
         * chrome sweep the moment the page pane grew three of them: `14×14`, against a floor of 22.
         *
         * ## Why the box is drawn rather than the browser's
         *
         * Two attempts failed before this one and both are worth the line. Padding and a transparent
         * border on a native checkbox are **ignored**: Chrome's `appearance: auto` drops them and
         * reports `border-width: 0` back, so an inline style that plainly said `5px solid` measured
         * as nothing at all. A native control's box is the browser's, and the only way to have one of
         * a different size is to stop it being native.
         *
         * So `appearance: none`, a box drawn in the panel's own line and accent, and a tick as a
         * background image — which is what every design system that wanted a 24-pixel target ended up
         * doing, for exactly this reason.
         */
        className={cn(
          'relative h-6 w-6 shrink-0 cursor-pointer appearance-none rounded-[4px]',
          'border border-[color:var(--ou-line)] bg-[color:var(--ou-panel)]',
          'bg-[length:14px_14px] bg-center bg-no-repeat',
          'checked:border-[color:var(--ou-accent)] checked:bg-[color:var(--ou-accent)]',
          'disabled:pointer-events-none disabled:opacity-40',
          'focus-visible:shadow-[0_0_0_2px_var(--ou-accent-soft)]'
        )}
        style={{
          backgroundImage: value
            ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23fff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 8.5l3.5 3.5L13 5'/%3E%3C/svg%3E\")"
            : undefined
        }}
 />
      {label ? <span className="truncate">{label}</span> : null}
    </label>
  );
}

/**
 * A few choices as **pictures**, side by side — a panel's segmented row.
 *
 * ## Why this is not a dropdown
 *
 * Because of how often the row is used. A stack's direction is picked twenty times an hour and a
 * `<select>` costs two gestures every time — one to open it, one to choose — and hides the other
 * options until the first. Three pictures cost one gesture, and the current answer is *visible*
 * rather than remembered. Every design tool draws its layout row this way and its font row as a
 * list, and the difference is exactly that: how often, and how few.
 *
 * ## Why the panel's and not the toolbar's
 *
 * `SegmentedControl` is a ribbon's — it takes a text label per option and sits at a toolbar's
 * height. A panel's is one control height tall, fills the row's width so the three share it evenly,
 * and is keyed by icon with the word kept for the tooltip and the screen reader. Those are different
 * enough to be two components and near enough that the second one is fifteen lines.
 */
export function PropertySegmented({
  value,
  options,
  onChange,
  disabled,
  ariaLabel
}: {
  value: string;
  options: { id: string; label: string; icon?: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <span
      role="radiogroup"
      aria-label={ariaLabel}
      data-segmented={ariaLabel}
      className={cn(
        'flex min-w-0 flex-1 items-center gap-0.5 rounded-[var(--ou-radius)] p-0.5',
        // The enclosure is what makes these one control rather than three buttons.
        'bg-[color:var(--ou-ground)]',
        disabled && 'pointer-events-none opacity-40'
      )}
    >
      {options.map((one) => (
        <button
          key={one.id}
          type="button"
          role="radio"
          aria-checked={value === one.id}
          aria-label={one.label}
          title={one.label}
          data-segment={one.id}
          data-state={value === one.id ? 'on' : 'off'}
          disabled={disabled}
          onClick={() => onChange(one.id)}
          className={cn(
            'flex h-[calc(var(--ou-control-h)-4px)] flex-1 items-center justify-center',
            'rounded-[calc(var(--ou-radius)-1px)] text-[color:var(--ou-muted)]',
            STATE,
            /*
             * Lifted rather than outlined, which is `SegmentedControl`'s reasoning and the same here:
             * an outline is what a *toggle* uses for on, and a reader who has one of three has not
             * turned anything on — they have said which one it is.
             */
            'data-[state=on]:bg-[color:var(--ou-panel)] data-[state=on]:text-[color:var(--ou-ink)]',
            'data-[state=on]:shadow-[var(--ou-lift-1)]'
          )}
        >
          <Icon name={one.icon ?? ''} size={13} />
        </button>
      ))}
    </span>
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
        'w-full min-w-0 bg-transparent px-1',
        /**
         * And a **ring**, which a field does not need and this does.
         *
         * `CONTROL` answers focus by changing the border's colour, and the reasoning there is about a
         * field: the caret is already saying where a reader is, so a ring on top of it is the stray
         * ring every tool learned to avoid. A `<select>` has no caret. One pixel of accent on a
         * border is the whole signal, and it is below what anybody can see.
         *
         * Found by the chrome sweep — tab through everything and name what the keyboard reaches and
         * nothing marks — the moment the page pane grew three of these.
         */
        /*
         * A **shadow** rather than an outline, and not by preference: `CONTROL` already says
         * `focus:outline-none`, which has the same specificity as a `focus-visible:outline` and wins
         * or loses on source order — a fight nothing here controls. A ring drawn as a shadow is the
         * same two pixels and answers to nobody.
         */
        'focus-visible:shadow-[0_0_0_2px_var(--ou-accent)]'
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
/**
 * **A row whose value is somewhere else** — a name to press, and the chord that presses it.
 *
 * ## What it is for
 *
 * Every tool of this kind has one: Figma's parent chip, Webflow's breadcrumb, the layer name at the
 * top of Sketch's inspector. It is how a panel says *this decision is not made here* while still
 * letting the reader get to where it is made — which a panel needs exactly when it has least to
 * show. The site builder's was measured at its worst: select a paragraph and the whole 240px panel
 * held **one** row, `종류 · 본문`, restating what the reader had just clicked.
 *
 * ## Why the chord is beside it and not only in a menu
 *
 * Because this is the affordance a reader uses ten times a minute once they know it exists, and the
 * second time they use it they would rather press a key. That is the same argument `Tip` makes for
 * putting a chord in a tooltip, and it is possible for the same reason: a key map answers `chordFor`
 * rather than a label being typed beside a string.
 *
 * Rendered as a `button` inside a `PropertyRow`'s value area, so it lines up with every other value
 * in the panel — a link that sat where a control sits but did not align with it would read as a
 * sentence that had escaped from somewhere.
 */
export function PropertyLink({
  label,
  value,
  shortcut,
  onPress,
  disabled
}: {
  label: string;
  /** What is over there — a block's name, a page's title. */
  value: string;
  /** Already written the way a reader reads it: `keyLabel` in `office-controls`. */
  shortcut?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <PropertyRow label={label}>
      <button
        type="button"
        data-property-link
        disabled={disabled}
        onClick={onPress}
        title={value}
        className={cn(
          'flex h-[var(--ou-control-h)] min-w-0 flex-1 items-center gap-1.5 rounded-[var(--ou-radius)]',
          'px-1.5 text-left text-[length:var(--ou-text)] text-[color:var(--ou-ink)]',
          'hover:bg-[color:var(--ou-ground)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ou-accent)]',
          'disabled:opacity-40'
        )}
      >
        <span className="min-w-0 flex-1 truncate">{value}</span>
        {shortcut ? (
          // Quieter than the name, which is the order a reader reads them in — `Tip`'s rule.
          <span className="shrink-0 text-[length:var(--ou-text-small)] tabular-nums text-[color:var(--ou-faint)]">
            {shortcut}
          </span>
        ) : null}
      </button>
    </PropertyRow>
  );
}

export function PropertyEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-2 text-[length:var(--ou-text)] leading-relaxed text-[color:var(--ou-muted)]">
      {children}
    </p>
  );
}
