/**
 * A **property panel**, as data — the shape all three products declare theirs in.
 *
 * ## Why this is shared and the toolbar's `Control` is not enough
 *
 * `Control` is a *button*: an id, an icon, a command, and how to read its state out of a selection.
 * A panel row is a different thing — it is a **named value a reader edits**, and what it needs to
 * say is which attribute, which command, which kind of control, and when it appears at all.
 *
 * Two products wrote that type separately within a week of each other, and the rule this repository
 * uses is that two copies is a coincidence and three is a component nobody wrote. This is the third
 * moment: the site builder's panel and the deck's panel share **eight of their fields and five of
 * their control kinds**, measured, and Word's ruler declares a fourth surface of the same shape.
 * More to the point, every editor after these three will want a panel and none of them should have
 * to invent one.
 *
 * ## What is shared and what stays the product's
 *
 * Shared: the row, the grouping, and the four questions the conformance harness asks of it — which
 * commands can a reader reach, which attributes can a reader change, which rows apply to this node
 * type, and in what order are they drawn.
 *
 * The product's: **which kinds of control exist.** `Kind` is a type parameter rather than a union
 * here, so a page's panel can have a `dataset` picker and a deck's can have a paint `list` without
 * either one having to know about the other — and each closes its own set, so its panel's `switch`
 * stays total. The five they already agree on (`text`, `number`, `colour`, `choice`, `toggle`) are
 * what `office-ui`'s `PropertySheet` draws without being told anything else.
 *
 * ## What is deliberately *not* here
 *
 * How anything looks, and any React at all. This package is declaration; `office-ui` is drawing;
 * `office-ui` has no editor dependency and must keep none, so it declares the minimal row shape it
 * needs and the two meet structurally at the app that uses both. A divergence stops the app
 * compiling, which is the cheapest check there is.
 */

/** The five kinds every panel so far has wanted. A product's own `Kind` should include them. */
export type CommonPanelControl = 'text' | 'number' | 'colour' | 'choice' | 'toggle';

/** One offered value, for a `choice`. */
export interface PanelOption {
  id: string;
  label: string;
}

export interface PanelRow<Kind extends string = string> {
  /**
   * The attribute this row writes — the document's word, not the panel's: `sizing`, not `폭`.
   *
   * This is the key `every-property-can-be-edited` asks about, which is why it is the document's:
   * a panel that named its own rows would be answering a different question from the one asked.
   */
  attr: string;
  /**
   * Whether it writes an attribute **of the selected node**, or of a node that node owns.
   *
   * The schema prefers declarations made of nodes — a placement's answers are `componentValue`
   * children, a slide's transition is `effect` on a `motion` the slide owns — so a row's `attr`
   * sometimes names a node type or an attribute of a different node. One field meaning both was
   * caught twice by tests reading these models, once per product.
   */
  writes?: 'attr' | 'child';
  /** The command that writes it. Absent for a row that only reads. */
  command?: string;
  /** The heading it sits under, which is what a reader navigates by. */
  group: string;
  /** Which pane, for a panel that has them. */
  tab?: string;
  /** What a reader reads at the start of the row. */
  label: string;
  /**
   * What a screen reader and a test read.
   *
   * Separate from `label` because two rows in different panes can both be called 이름, and an
   * accessible name has to be unique in the panel. Both products found real mismatches here — a row
   * labelled 맞춤 whose name is 교차 축 맞춤, a 열 whose name is 열 수 — which is exactly the kind
   * of thing a declaration gets wrong and only a browser can catch.
   */
  ariaLabel: string;
  control: Kind;
  /** The fixed set, for a `choice`. */
  options?: PanelOption[];
  /**
   * What the control shows when the node says nothing.
   *
   * A **product** decision rather than a control's default: a page's stack shows 채우기 with nothing
   * stated, and that is a claim about what silence means (`renderers.ts`), not about how a select
   * behaves.
   */
  fallback?: unknown;
  /** A length shown in one unit and stored in another — twips in, pixels out. */
  unit?: string;
  min?: number;
  max?: number;
  /**
   * Which node types the row appears for. Absent means every selectable thing.
   *
   * A list rather than a predicate so a check can read it: *which rows can ever set `fit`* is then a
   * question about an array and not about running the panel.
   */
  on?: string[];
  /** Shown only when another attribute holds one of these values. */
  when?: { attr: string; is: unknown[] };
  /** Drawn, but not editable until another attribute has a value. */
  needs?: string;
  /** Only when exactly one thing is selected — a name is one block's. */
  single?: boolean;
  /**
   * Shown only when the selection is **inside** something.
   *
   * `on` says which node type a row is about and cannot say where that node is, and some rows need
   * the second question: what a box asks of the frame arranging it means nothing where there is no
   * frame, and a part's variable binding is a fact about the definition it belongs to.
   */
  inside?: string;
}

/** Where a row applies, asked of one node type — everything a row itself can decide. */
export function panelRowsFor<Row extends PanelRow>(
  rows: Row[],
  stype: string | undefined,
  tab?: string,
  /**
   * What a row with no `on` applies to.
   *
   * The two products mean different things by "anything": a page's panel means every block, and a
   * deck's means every box on a slide. Passed in rather than guessed, because guessing here is how
   * a page's panel would start offering a connector's rows.
   */
  anything?: (stype: string) => boolean
): Row[] {
  return rows.filter(
    (row) =>
      (tab === undefined || row.tab === undefined || row.tab === tab) &&
      (row.on === undefined
        ? stype !== undefined && (anything?.(stype) ?? true)
        : stype !== undefined && row.on.includes(stype))
  );
}

/**
 * The groups a pane has, in order, with their rows — which is how a panel is drawn.
 *
 * Contiguous runs rather than a map, because **order is meaning**: a panel draws these top to
 * bottom, so moving a row in the declaration moves it on screen, and two runs of one heading would
 * draw the heading twice rather than silently merging.
 */
export function panelGroupsFor<Row extends PanelRow>(
  rows: Row[]
): { label: string; rows: Row[] }[] {
  const groups: { label: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.label === row.group) last.rows.push(row);
    else groups.push({ label: row.group, rows: [row] });
  }
  return groups;
}

/** Every command the panel can run — a product's third answer to "what can a reader reach". */
export function panelCommands(rows: PanelRow[]): string[] {
  return [...new Set(rows.map((row) => row.command).filter((one): one is string => !!one))];
}

/**
 * Every attribute the panel can set.
 *
 * Rows that write a **child node** contribute nothing: they name a node type or another node's
 * attribute, and this answers "which attributes of the selected node can a reader change". Rows with
 * no command contribute nothing either — a kind of block a reader is *told* is not a thing they can
 * set.
 *
 * `also` is for the rows that write more than one without naming them: a destination picker writes
 * `goTo`, `goToKind` and `goToDeck` together because a reader chooses one thing, and three rows
 * would be two controls nobody wants.
 */
export function panelAttrs(
  rows: PanelRow[],
  also: Record<string, string[]> = {}
): string[] {
  return [
    ...new Set(
      rows
        .filter((row) => row.command && row.writes !== 'child')
        .flatMap((row) => [row.attr, ...(also[row.attr] ?? [])])
    )
  ];
}
