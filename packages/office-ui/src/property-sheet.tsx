import { ColorField, type ThemeSwatch } from './color-field';
import { NumberField, TextField } from './controls';
import { PropertyChoice, PropertyGroup, PropertyRow, PropertyToggle } from './properties';

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
  control: string;
  options?: { id: string; label: string }[];
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
  /** A product's own named colours, offered beside any colour at all. */
  swatches?: ThemeSwatch[];
  /** The heading to draw for a group, when it is not the declared one. */
  heading?: (group: SheetGroup<Row>) => string;
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
  const control = (row: Row | SheetRow): React.ReactNode | null | undefined => {
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
          <NumberField
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
            suffix={suffix ? suffix(one) : one.unit}
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
            label={one.label}
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
        <PropertyGroup key={group.label} label={heading?.(group) ?? group.label}>
          {group.rows.map((row) => {
            const drawn = control(row);
            if (drawn === null) return null;
            /*
             * A row and its companions under one label — 이름표 꾸미기 is a size, a colour and a
             * weight, and three rows of it would be three labels saying almost the same word down a
             * 280px column. A companion that draws nothing is left out rather than left blank.
             */
            const beside = (row.with ?? []).map(control).filter((one) => one !== null && one !== undefined);
            if (drawn === undefined && beside.length === 0) return null;

            return (
              <Cell key={key(row)} row={row} marked={marked}>
                {drawn}
                {beside}
              </Cell>
            );
          })}
        </PropertyGroup>
      ))}
    </>
  );
}

/** A row is identified by where it is and what it writes — two groups may both set `name`. */
const key = (row: SheetRow) => `${row.group}.${row.attr}`;

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
  children
}: {
  row: Row;
  marked?: (row: Row) => boolean;
  children: React.ReactNode;
}) {
  return <PropertyRow label={`${row.label}${marked?.(row) ? ' ·' : ''}`}>{children}</PropertyRow>;
}
