import { ColorField, type ThemeSwatch } from './color-field';
import { TextField } from './controls';
import {
  PropertyChoice,
  PropertyGroup,
  PropertyNumber,
  PropertyRow,
  PropertySegmented,
  PropertyToggle
} from './properties';

/**
 * A property panel, drawn from a declaration.
 *
 * ## What this is for
 *
 * Every editor in this suite has a panel, and until now each one wrote its own rows in JSX — the
 * deck's is 2,863 lines, the site builder's was 615. They drew the *same five controls* over and
 * over: a name, a number with a unit, a colour, a list of values, a switch. This draws those, and
 * hands anything else back to the product.
 *
 * The declaration itself lives with the product (`office-controls`' `PanelRow`), because which
 * attribute a row writes and which command writes it are facts about a document model this package
 * has never heard of. What is here is the half that is genuinely the same everywhere: the grid, the
 * label column, the override mark, and which control a kind means.
 *
 * ## Why it is generic over the row, and why it declares its own shape
 *
 * `office-ui` has **no editor dependency**, which is a property that was won rather than inherited:
 * a three-state toggle was importing `MarkState` from `editor-core` and now does not. Importing
 * `office-controls` would put it back, because a `Control` reads a selection.
 *
 * So this declares the minimum a row must have to be drawn, and `PanelRow` satisfies it
 * structurally. They meet at the app, which depends on both — and if they ever diverge, the app
 * stops compiling. That is the check, and it costs nothing to keep.
 *
 * ## What it deliberately does not do
 *
 * Decide anything. Which rows apply to what is selected, what the current value is, what a change
 * means — all of that is the product's, passed in. A panel that resolved its own values would be a
 * second place that knows what a document says.
 */

/** The minimum a row must state to be drawn here — `office-controls`' `PanelRow` satisfies it. */
export interface SheetRow {
  attr: string;
  group: string;
  label: string;
  ariaLabel: string;
  /**
   * A picture in the label column, for a row a reader picks out by shape — a corner of a box, a side
   * of its padding. The label stays as the tooltip and `ariaLabel` as the name; see `PropertyRow`.
   */
  icon?: string;
  control: string;
  /** `icon` turns the row into a segmented group rather than a dropdown — see the `choice` case. */
  options?: { id: string; label: string; icon?: string }[];
  /** How far an arrow key moves it, and what the browser will accept typed — see `PanelRow.step`. */
  step?: number;
  fallback?: unknown;
  unit?: string;
  min?: number;
  max?: number;
  needs?: string;
  /** More controls in this row, drawn after it under its one label — see `PanelRow.with`. */
  with?: SheetRow[];
}

export interface SheetGroup<Row extends SheetRow> {
  label: string;
  rows: Row[];
}

export function PropertySheet<Row extends SheetRow>({
  groups,
  value,
  raw,
  onWrite,
  marked,
  onUnmark,
  folded,
  onFold,
  follows,
  weightOf,
  onWeight,
  swatches,
  heading,
  suffix,
  render
}: {
  /** The groups to draw, in order — the product's declaration, already filtered. */
  groups: SheetGroup<Row>[];
  /** What a row's attribute currently is. */
  value: (row: Row) => unknown;
  /**
   * And the value **before** anything resolved it, for a control that must not show the resolution.
   *
   * A site's `fill` may hold `var:강조` rather than a hex: two blocks the same blue are a
   * coincidence and two blocks on one token are a decision, so a colour field that showed the hex
   * would be hiding the only thing worth seeing. Falls back to `value` when a product has no such
   * distinction.
   */
  raw?: (row: Row) => unknown;
  onWrite: (row: Row, next: unknown) => void;
  /**
   * Whether this row's value is *this* view's own rather than inherited.
   *
   * A responsive builder marks what a narrow width overrides; a deck could mark what a slide changes
   * about its layout. Drawn as a mark after the label rather than as a colour, because a panel of
   * sixteen rows with two colours in it is a panel nobody reads.
   */
  marked?: (row: Row) => boolean;
  /**
   * What pressing a mark does — *take this value back*, in whatever sense the host marked it.
   *
   * Optional, and the mark stays a plain dot without it: a product whose marks are informational
   * (nothing to undo) should not grow a button that does nothing. See `Cell`.
   */
  onUnmark?: (row: Row) => void;
  /**
   * **A colour that follows a token *at a weight***, which is a spelling this panel must not know.
   *
   * The document writes it — one product says `var:강조/40` and another may say something else — so
   * the three questions come in as callbacks: which swatch the value is following, how much of it,
   * and what to do when a reader changes that. A caller with no weights passes none of them and the
   * colour field behaves exactly as it did.
   */
  follows?: (row: Row) => string | undefined;
  weightOf?: (row: Row) => number | undefined;
  onWeight?: (row: Row, weight: number | undefined) => void;
  /** A product's own named colours, offered beside any colour at all. */
  swatches?: ThemeSwatch[];
  /** The heading to draw for a group, when it is not the declared one. */
  heading?: (group: SheetGroup<Row>) => string;
  /**
   * **Which sections are put away**, and the switch that puts one away.
   *
   * Held by the caller for the reason every other answer here is: a fold is a fact about *this
   * reader, this minute*, and a sheet that remembered its own would disagree with the next one drawn
   * from the same state. A caller that passes neither gets a panel that never folds, which is what
   * every caller had until a site builder's own measured **959 pixels** in five open sections.
   */
  folded?: (group: SheetGroup<Row>) => boolean;
  onFold?: (group: SheetGroup<Row>, folded: boolean) => void;
  /**
   * What to write after a number, when the row cannot say.
   *
   * `row.unit` is a **declaration** and is right where a product has one unit: a page is drawn in
   * pixels and stores twips, and that never changes. A deck lets the reader choose — px, cm, inches —
   * so its suffix is a fact about the *session* rather than about the row, and a deck that declared
   * `unit: 'px'` would print the wrong word beside every length in the panel.
   *
   * Collapsing a whole control kind into the shared five: without this the deck needed its own
   * `length`, which is a `number` with a different label on it.
   */
  suffix?: (row: Row) => string | undefined;
  /**
   * Anything this does not know how to draw.
   *
   * The extension point, and the reason a product can keep its own kinds without this package
   * learning them: a page's dataset picker, a deck's paint stack, a placement's answers.
   *
   * Three answers, and the difference between the last two is a row a reader can see:
   *
   * - a **node** — the product drew it, and it goes in the label/control grid like any other row;
   * - **`null`** — *hide the row*, for a row whose whole reason is conditional on something the
   *   declaration cannot hold (the note that says which width is being edited says nothing at the
   *   widest one). Without this the panel drew a labelled row with an empty right-hand side, which
   *   reads as a control that failed to load;
   * - **`undefined`** — this sheet draws it, which is how the five shared kinds stay shared.
   */
  render?: (row: Row) => React.ReactNode;
}) {
  /**
   * One control, or nothing.
   *
   * `null` means the product asked for this row to be hidden; `undefined` means it drew nothing and
   * this sheet has no kind for it either, which is visible as an empty row rather than guessed at.
   */
  const control = (
    row: Row | SheetRow,
    /**
     * That this is a **companion** — one of the controls sharing a row's single label.
     *
     * A companion cannot borrow that label: it is one of two, three or five things on the line, and
     * the label names the first of them. So a companion draws its own short name inside the field,
     * which is what `W`/`H` are in every inspector, and costs no line to do it. See `PanelRow.with`.
     */
    beside = false
  ): React.ReactNode | null | undefined => {
    const one = row as Row;
    const own = render?.(one);
    if (own === null) return null;
    if (own !== undefined) return own;

    const group = groups.find((maybe) => maybe.rows.some((other) => other === one || (other.with ?? []).includes(one)));
    const disabled = one.needs !== undefined && group !== undefined && !groupValue(group, one.needs, value);
    const current = value(one);

    switch (one.control) {
      case 'text':
        return (
          <TextField
            key={key(one)}
            value={String(current ?? '')}
            onCommit={(next) => onWrite(one, next || undefined)}
            ariaLabel={one.ariaLabel}
            disabled={disabled}
          />
        );

      case 'number':
        return (
          /*
           * `PropertyNumber`, not `NumberField` — one path to one control.
           *
           * The sheet drew the raw field because the wrapper had no `onClear`, `min` or `max`, so for
           * a while a decision made in the wrapper (a prefixed field needs less left padding, since
           * its own name already provides some) reached the deck's dialogs and not the panel. The
           * wrapper carries all three now.
           */
          <PropertyNumber
            key={key(one)}
            /*
             * `null` is **mixed**, and it has to survive the fallback.
             *
             * A product answers `null` when there is no one value to show — several things selected
             * that disagree, or a shorthand whose four sides do. This read `current === undefined`
             * for "say nothing", so a deliberate `null` fell through to `Number(null)`, which is
             * **0**: a panel telling a reader their section has no padding while they are looking at
             * the air above its heading.
             */
            value={
              current === null
                ? null
                : current === undefined
                  ? one.fallback === undefined
                    ? null
                    : Number(one.fallback)
                  : Number(current)
            }
            onCommit={(next) => onWrite(one, next)}
            /*
             * Emptying a panel row means **the attribute is not stated**, which is a value a panel
             * row can hold and had no gesture for. It is the difference between a corner that is 0
             * and a corner that follows the radius, and between a side that overrides the padding
             * and one that does not — and until this line the second of each pair could be typed
             * into and never typed back out of.
             *
             * A row already showing nothing clears nothing: `readNumberField` will not call this
             * when the field's value is `null`, which is what a disagreeing selection draws as.
             */
            onClear={() => onWrite(one, undefined)}
            ariaLabel={one.ariaLabel}
            /*
             * A companion's own short name, or its **picture** where it has one — a corner of a box,
             * a side of its padding. The picture wins because that is what a reader is matching; the
             * label stays as the fallback for a companion with no drawing, which is most of them.
             */
            prefix={beside ? one.label : undefined}
            prefixIcon={beside ? one.icon : undefined}
            step={one.step}
            /*
             * A companion carrying its own name does **not** repeat the unit. Measured at 240px:
             * five fields in one row's control area is 34 pixels each, and `상 112 px` in 34 pixels
             * draws as `p상`. The row's own field says `px` once, which is where a reader reads it —
             * the four sides of a padding are the same unit by definition.
             */
            suffix={beside ? undefined : suffix ? suffix(one) : one.unit}
            min={one.min}
            max={one.max}
            disabled={disabled}
          />
        );

      case 'colour':
        return (
          <ColorField
            key={key(one)}
            value={typeof (raw ?? value)(one) === 'string' ? String((raw ?? value)(one)) : null}
            varSwatches={swatches}
            follows={follows?.(one)}
            weight={weightOf?.(one)}
            onWeight={onWeight ? (next) => onWeight(one, next) : undefined}
            onChange={(next) => onWrite(one, next)}
            onClear={() => onWrite(one, undefined)}
            ariaLabel={one.ariaLabel}
          />
        );

      case 'toggle':
        return (
          <PropertyToggle
            key={key(one)}
            value={current === true}
            onChange={(next) => onWrite(one, next)}
            /*
             * **The word once.** A toggle that is a row's own control sits beside that row's label,
             * and drawing its own text there made every switch read `보임  ☐ 보임`. A companion keeps
             * its text, because there is no label beside it to borrow — the same split the number
             * fields make with `prefix`.
             */
            label={beside ? one.label : undefined}
            ariaLabel={one.ariaLabel}
            disabled={disabled}
          />
        );

      case 'choice':
        /*
         * The **platform's** dropdown, not Radix's — `canvas-model.md` §6 has said so since before
         * this file existed: *"Native dropdown in a panel, Radix in a ribbon … a panel's dropdown is
         * a list of words, where the platform's control is smaller, faster and already knows how to
         * be typed into."*
         *
         * The first version of this sheet used `ChoiceSelect`, which is the ribbon's, and the deck's
         * browser suite said so immediately: `selectOption` on a Radix trigger is *"Element is not a
         * <select> element"*. The site builder's panel had been using the ribbon's control all along
         * and nothing had noticed, because nothing had a reason to open it.
         */
        /*
         * …**unless every option has a picture**, in which case it is a segmented row.
         *
         * The decision is the declaration's and it is made by giving the options icons or not: a
         * stack's direction is three choices a reader makes constantly and a `<select>` costs two
         * gestures every time, while a `분배` is six and six unlabelled glyphs across 159 pixels is
         * a puzzle. So a product says which of its rows is which, and this reads the answer rather
         * than guessing from how many there are.
         */
        if ((one.options ?? []).length > 0 && (one.options ?? []).every((option) => option.icon)) {
          return (
            <PropertySegmented
              key={key(one)}
              value={String(current ?? one.fallback ?? '')}
              options={one.options ?? []}
              onChange={(next) => onWrite(one, next || undefined)}
              ariaLabel={one.ariaLabel}
              disabled={disabled}
            />
          );
        }
        return (
          <PropertyChoice
            key={key(one)}
            value={String(current ?? one.fallback ?? '')}
            options={one.options ?? []}
            onChange={(next) => onWrite(one, next || undefined)}
            ariaLabel={one.ariaLabel}
            disabled={disabled}
          />
        );

      default:
        /*
         * A kind this does not know and the product did not draw. Nothing, rather than a guess: an
         * empty row is visible and askable, and a guessed control is one that writes the wrong thing.
         */
        return undefined;
    }
  };

  return (
    <>
      {groups.map((group) => (
        <PropertyGroup
          key={group.label}
          label={heading?.(group) ?? group.label}
          folded={folded?.(group)}
          onFold={onFold ? (next) => onFold(group, next) : undefined}
        >
          {group.rows.map((row) => {
            const drawn = control(row);
            if (drawn === null) return null;
            /*
             * A row and its companions under one label — 이름표 꾸미기 is a size, a colour and a
             * weight, and three rows of it would be three labels saying almost the same word down a
             * 280px column. A companion that draws nothing is left out rather than left blank.
             */
            const drawnBeside = (row.with ?? [])
              .map((one) => ({ one, what: control(one, true) }))
              .filter(({ what }) => what !== null && what !== undefined);
            const kept = drawnBeside.map(({ one }) => one);
            const beside = drawnBeside.map(({ what }) => what);
            /*
             * **A grid is for a set of the same kind.**
             *
             * Three or more numbers are a box's four sides or a shadow's three amounts: they are one
             * idea measured several ways, they read as a block, and two to a line is the shape every
             * inspector draws them in. A *mixed* set is not that — `그라디언트` is an end colour, an
             * angle and a shape, three different questions — and forcing those into equal cells cut
             * the colour's own name to `없` to make room for a cell it had nothing to do with.
             */
            const grid = kept.length >= 3 && kept.every((one) => one.control === 'number');
            if (drawn === undefined && beside.length === 0) return null;

            return (
              <Cell key={key(row)} row={row} marked={marked} onUnmark={onUnmark}>
                {drawn}
                {/*
                  **Three or more companions go two to a line**, which is what a padding is.

                  Four numbers strung along one line are four numbers 34 pixels wide; two lines of
                  two are 80, which is a number a reader can read and retype. It is also the shape
                  every inspector draws for a box's four sides, and the shape says what the labels
                  would otherwise have to say twice — these belong together, and there are four.

                  One or two stay on the line: `그라디언트`'s end colour beside its start colour is a
                  pair a reader reads across, and a grid would separate them.
                */}
                {grid ? <span className="grid w-full grid-cols-2 gap-1">{beside}</span> : beside}
              </Cell>
            );
          })}
        </PropertyGroup>
      ))}
    </>
  );
}

/** A row is identified by where it is and what it writes — two groups may both set `name`. */
/**
 * What identifies a row, for React and for nothing else.
 *
 * The accessible name is in it because `attr` is not unique: a row that writes a **child node**
 * names a node type rather than an attribute, so two rows in one group can legitimately both say
 * `componentVar` — one declaring a variable, one renaming the one a part is bound to. Keyed by
 * `group.attr` alone those two are the same row, and React draws one of them.
 *
 * A panel already guarantees the accessible name is unique — a screen reader has the same problem
 * with two rows called the same thing — so this borrows the guarantee rather than inventing one.
 */
const key = (row: SheetRow) => `${row.group}.${row.attr}.${row.ariaLabel}`;

/** The value of another row's attribute, for a row that is only editable once that one is set. */
function groupValue<Row extends SheetRow>(
  group: SheetGroup<Row>,
  attr: string,
  value: (row: Row) => unknown
): unknown {
  const found = group.rows.find((row) => row.attr === attr);
  return found ? value(found) : undefined;
}

/** The label column, the control, and the mark that says this width owns the value. */
function Cell<Row extends SheetRow>({
  row,
  marked,
  onUnmark,
  children
}: {
  row: Row;
  marked?: (row: Row) => boolean;
  onUnmark?: (row: Row) => void;
  children: React.ReactNode;
}) {
  /*
   * A picture where the row has one — the four corners of a box and the four sides of its padding,
   * which is what every design tool draws and this suite spelled. The label goes with it as the
   * tooltip and the accessible name, so nothing is lost; see `PropertyRow`.
   *
   * The mark stays a character either way: `·` says *this width owns the value* and belongs to the
   * row rather than to what the row is about, so drawing it into the picture would say the wrong
   * thing about the shape.
   */
  const owned = marked?.(row) === true;

  /**
   * And **pressing the mark takes the value back**, where the host says what that means.
   *
   * The mark said *this width owns this value* and there was no way to stop it owning one. A reader
   * could type the page's number back in, which looks identical and is a different document: the
   * width still states a value, it now happens to match, and it stops following when the page's
   * changes. Every layout tool has this control and this one had the dot without it.
   *
   * Drawn only when there is something to take back, so a panel of forty rows carries no buttons a
   * reader would have to learn to ignore.
   */
  const mark = owned ? (
    onUnmark ? (
      <button
        type="button"
        className="shrink-0 rounded-[3px] px-1 leading-none text-[color:var(--ou-accent)] hover:bg-[color:var(--ou-accent-soft)]"
        /*
         * Named by `ariaLabel` and not by `label`, which is the same reason the row has both: two
         * rows in different panes can each be called 최대, and an accessible name has to be unique in
         * the panel. Written with `label` first, and the button was unfindable by the name a reader
         * — or a test — would say out loud.
         */
        title={`${row.ariaLabel} — 이 값을 되돌립니다`}
        aria-label={`${row.ariaLabel} 되돌리기`}
        onClick={() => onUnmark(row)}
      >
        ·
      </button>
    ) : (
      <span aria-hidden>·</span>
    )
  ) : undefined;

  return (
    <PropertyRow label={row.label} icon={row.icon} mark={mark}>
      {children}
    </PropertyRow>
  );
}
