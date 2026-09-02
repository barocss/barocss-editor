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
  /**
   * A **picture** for this choice, as a name in the shared icon table.
   *
   * What turns a dropdown into the segmented row every design tool uses for the two or three
   * choices a reader makes constantly: a stack's direction is picked twenty times an hour and a
   * `<select>` costs two gestures and hides the other options until the first one. Three pictures
   * side by side cost one, and the current one is *visible* rather than remembered.
   *
   * Only where it earns it. A list of six — a stack's `분배` — is a list, and six unlabelled glyphs
   * across 159 pixels is a puzzle. A product says which of its rows is which by giving the options
   * icons or not, and `every-icon-has-a-picture` holds the names it uses to the table.
   */
  icon?: string;
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
  /**
   * A **picture** in place of the label, for a row a reader picks out by shape.
   *
   * The four corners of a box and the four sides of its padding are the two places every design tool
   * draws and this suite spelled — 상좌 상우 하우 하좌 over four number fields, and 상 우 하 좌 over
   * four more. Honest, and eight words where a reader is matching a shape rather than reading.
   *
   * The label stays: it is what a narrow panel falls back to, and `ariaLabel` is still what a screen
   * reader gets — a picture with no name is the fault this replaces, not a new one.
   */
  icon?: string;
  control: Kind;
  /** The fixed set, for a `choice`. */
  options?: PanelOption[];
  /**
   * The node type this row **writes**, when it is not the one whose selection shows it.
   *
   * Almost never. A panel row is a fact about the thing a reader has selected, and the two are the
   * same node — which is why `on` alone was enough until a site wanted an address.
   *
   * A **site's** address is a fact about the document: there is one of it and five pages. The row
   * appears in the pane a reader reaches by selecting nothing (which is the page's, so `on` says
   * `surface`) and writes the *document*. Said out loud because a check reads it: `sets only
   * attributes those node types declare` looked the attribute up on `surface`, correctly found
   * nothing, and reported a row that lies about what it writes — which it was.
   */
  of?: string;
  /**
   * How far one press of an arrow key moves a **number**, and what a browser will accept in it.
   *
   * Both, and the second is what made this necessary: `<input type="number">` sanitises what is typed
   * against `step`, so a field left at the default of 1 turned a typed `0.4` into `0`. Measured on
   * the day 투명도 was added — the row said `min: 0, max: 1` and could store nothing between them.
   *
   * A row with a range under about ten wants a fraction here; everything measured in pixels or
   * degrees wants the default.
   */
  step?: number;
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
   * Which node types the row appears for — a **narrowing**, and usually unnecessary.
   *
   * Absent means *"wherever the schema declares this attribute"*, which is nearly always the right
   * answer and is the one that cannot drift. A hand-written list can, and did: the deck's first
   * declaration carried five of them and **27 of their entries were wrong** when measured against
   * the schema — offering a `너비` on a connector, which has none, and hiding a `선 색` from a line,
   * which has one. Every entry was either a control that writes nothing or a control a reader cannot
   * reach.
   *
   * So a list is for the rows that are genuinely narrower than the schema: one that writes a node
   * rather than an attribute (`attr` names a node type, so there is nothing to ask about), or one a
   * product offers in fewer places than it could.
   */
  on?: string[];
  /**
   * Shown only when another attribute says so.
   *
   * With `is`, when it holds one of those values — a grid has columns and nothing else does. Without
   * it, **when it has any value at all**: a connector's label decorations appear once there is a
   * label to decorate, and its waypoint count once there is a waypoint. Both readings were needed
   * within a day of each other, and a row that is always drawn and means nothing half the time is a
   * row a reader learns to ignore.
   */
  when?: { attr: string; is?: unknown[] };
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
  /**
   * More controls in **this** row, drawn after it under its one label.
   *
   * A property panel is full of these and every one of them is a reader-facing decision rather than
   * a layout convenience: 이름표 꾸미기 is a size, a colour and a weight, and three rows of it would
   * be three labels saying almost the same word down a 280px column. Measured on the deck's panel:
   * 42 rows hold one control and **10 hold two to five**.
   *
   * The companions are rows in their own right — they write their own attribute with their own
   * command, and `panelAttrs` and `panelCommands` walk them — so nothing about the harness's
   * questions changes. What changes is only where they are drawn.
   */
  with?: PanelRow<Kind>[];
  /**
   * **The whole width, with no label column** — for a control that is a list rather than a value.
   *
   * Read by the sheet that draws it; declared here so a product says it once, beside everything else
   * it says about the row. See `SheetRow.wide` for the measurement that asked for it.
   */
  wide?: boolean;
}

/** A row and everything drawn beside it, which is what the harness's questions are asked of. */
function flatten<Row extends PanelRow>(rows: Row[]): PanelRow[] {
  return rows.flatMap((row) => [row, ...flatten((row.with ?? []) as Row[])]);
}

/**
 * Where a row applies, asked of one node type.
 *
 * **The schema decides by default.** A row appears wherever its attribute is declared, which is the
 * answer a hand-written list is trying to approximate and keeps getting wrong — measured on the
 * deck's first declaration, five lists and 27 wrong entries, each one a control that writes nothing
 * or a control a reader cannot reach. The deck's own panel had been asking the schema all along
 * (`declares('layoutMode')`); the declaration that replaced it was the thing that regressed.
 */
export function panelRowsFor<Row extends PanelRow>(
  rows: Row[],
  stype: string | undefined,
  tab?: string,
  asks: {
    /**
     * Whether a node type declares an attribute — the schema, which only the product has.
     *
     * Without it a row with no `on` falls back to `anything`, which is how a product adopts this
     * before it has a schema to hand.
     */
    declares?: (stype: string, attr: string) => boolean;
    /**
     * What a row with no `on` applies to when its attribute is not an attribute at all.
     *
     * Three kinds of row are in that position, and asking the schema about any of them gets the
     * wrong answer:
     *
     * - one that writes a **node** (`writes: 'child'`) names a node type in `attr`;
     * - one that writes **nothing** — the kind of block a reader is told, the sentence that says
     *   which width is being edited. `stype` is not an attribute of anything, so the first version
     *   of this made the 종류 row vanish from every panel;
     * - a product that has no schema to hand, which is how one adopts this before it does.
     *
     * The two products mean different things by "anything" besides: a page's panel means every
     * block and a deck's means every box on a slide.
     */
    anything?: (stype: string) => boolean;
  } = {}
): Row[] {
  return rows.filter((row) => {
    if (tab !== undefined && row.tab !== undefined && row.tab !== tab) return false;
    if (stype === undefined) return false;
    if (row.on !== undefined) return row.on.includes(stype);
    if (row.writes === 'child' || !row.command || !asks.declares) return asks.anything?.(stype) ?? true;
    return asks.declares(stype, row.attr);
  });
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
  return [...new Set(flatten(rows).map((row) => row.command).filter((one): one is string => !!one))];
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
      flatten(rows)
        .filter((row) => row.command && row.writes !== 'child')
        .flatMap((row) => [row.attr, ...(also[row.attr] ?? [])])
    )
  ];
}
