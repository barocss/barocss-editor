import { ChoiceSelect } from './select';
import { ColorField, type ThemeSwatch } from './color-field';
import { NumberField, TextField } from './controls';
import { PropertyGroup, PropertyRow, PropertyToggle } from './properties';

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
  return (
    <>
      {groups.map((group) => (
        <PropertyGroup key={group.label} label={heading?.(group) ?? group.label}>
          {group.rows.map((row) => {
            const own = render?.(row);
            if (own === null) return null;
            if (own !== undefined) return <Cell key={key(row)} row={row} marked={marked}>{own}</Cell>;

            const disabled = row.needs !== undefined && !groupValue(group, row.needs, value);
            const current = value(row);

            switch (row.control) {
              case 'text':
                return (
                  <Cell key={key(row)} row={row} marked={marked}>
                    <TextField
                      value={String(current ?? '')}
                      onCommit={(next) => onWrite(row, next || undefined)}
                      ariaLabel={row.ariaLabel}
                      disabled={disabled}
                    />
                  </Cell>
                );

              case 'number':
                return (
                  <Cell key={key(row)} row={row} marked={marked}>
                    <NumberField
                      value={current === undefined ? (row.fallback === undefined ? null : Number(row.fallback)) : Number(current)}
                      onCommit={(next) => onWrite(row, next)}
                      ariaLabel={row.ariaLabel}
                      suffix={row.unit}
                      min={row.min}
                      max={row.max}
                      disabled={disabled}
                    />
                  </Cell>
                );

              case 'colour':
                return (
                  <Cell key={key(row)} row={row} marked={marked}>
                    <ColorField
                      value={typeof (raw ?? value)(row) === 'string' ? String((raw ?? value)(row)) : null}
                      varSwatches={swatches}
                      onChange={(next) => onWrite(row, next)}
                      onClear={() => onWrite(row, undefined)}
                      ariaLabel={row.ariaLabel}
                    />
                  </Cell>
                );

              case 'toggle':
                return (
                  <Cell key={key(row)} row={row} marked={marked}>
                    <PropertyToggle
                      value={current === true}
                      onChange={(next) => onWrite(row, next)}
                      label={row.label}
                      ariaLabel={row.ariaLabel}
                      disabled={disabled}
                    />
                  </Cell>
                );

              case 'choice':
                return (
                  <Cell key={key(row)} row={row} marked={marked}>
                    <ChoiceSelect
                      value={String(current ?? row.fallback ?? '')}
                      options={row.options ?? []}
                      onChange={(next) => onWrite(row, next || undefined)}
                      ariaLabel={row.ariaLabel}
                      disabled={disabled}
                    />
                  </Cell>
                );

              default:
                /*
                 * A kind this does not know and the product did not draw. Nothing, rather than a
                 * guess: an empty row is visible and askable, and a guessed control is a control
                 * that writes the wrong thing.
                 */
                return null;
            }
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
