/**
 * What a product must satisfy.
 *
 * A product here is a schema and a kit — a set of renderers, commands, key
 * bindings and operations — and the engine has no way to say whether those four
 * agree with each other. This is that way.
 *
 * It exists because of one pattern, found five times in one product before
 * anybody named it: **something is declared, nothing reads it, and no test can
 * tell.** A schema is a promise. A promise nothing keeps is not a bug in any
 * file, so no file's tests fail. Measured on the first product: 15 of 27
 * declared node types had no renderer, and an entire second document shape sat
 * in the schema unused.
 *
 * The other half of the pattern is worse and this is shaped around it. The
 * answer to "we know about that one" is a note, and **a note rots**. Fourteen
 * exemptions in the operation roster said "declares no inverse" about
 * operations that had since been given one, so the check stayed switched off
 * for fourteen things that would have passed it. A note that can go stale looks
 * exactly like coverage.
 *
 * So an exemption here is not a way to silence a finding. It is a *claim that
 * the finding is expected*, and a claim that stops being true is itself a
 * failure. Exempting something that no longer needs exempting fails just as
 * loudly as the thing it was exempting.
 */

/** One thing that does not hold. */
export interface Finding {
  /** Which check produced it, so a report can be read by category. */
  check: string;
  /** What the finding is about — a node type, an attribute, an operation. */
  subject: string;
  /** What is wrong, in a sentence a reader can act on. */
  detail: string;
  /**
   * A name several findings share, so one decision can cover all of them.
   *
   * An exemption keyed by a family exempts every finding in it, and goes stale
   * when the family is empty — the same claim, at the size the decision was
   * actually made at.
   *
   * This exists because of a smell in the first product's list: `locked` came back
   * unread on eleven node types, and eleven exemptions saying *"the commands refuse
   * to move it"* is the twenty-three-`inherited`-lines failure again. Eleven notes
   * rot eleven times; the decision was one decision.
   *
   * A family is not a wildcard for convenience. It is for a fact about **the
   * attribute** rather than about the node — `locked` is read by the commands
   * wherever it appears — and the per-subject key is still there for a fact about
   * one node, like a line having no interior to fill.
   */
  family?: string;
}

/**
 * A claim that a finding is expected, and why.
 *
 * The reason is not decoration. It is what a reader needs six months later to
 * decide whether the exemption still applies, and it is the only thing that
 * separates "we decided" from "nobody noticed".
 */
export type Exemptions = Record<string, string>;

/**
 * How many findings a check is *currently* allowed, while a product works them off.
 *
 * ## Why a number and not a list of exemptions
 *
 * A product adopting a check late finds hundreds of them at once. Slides met this
 * harness with sixty-four undrawn node types and adopted it as a count that could
 * only go down; every one of those was worked off, and the test asserts today.
 * Writing three hundred exemptions instead would have been three hundred notes, and
 * a note rots — which is the failure this whole package is shaped around.
 *
 * A ratchet claims nothing about *which* findings are expected, so it cannot go
 * stale in the way a reason can. What it claims is a **direction**, and it is checked
 * in both: more findings than the number is a regression, and *fewer* is a failure
 * too — the number has to come down with the work, or a product that fixed forty
 * would leave room to break forty more silently.
 *
 * It is the weaker instrument on purpose. An exemption says why one thing is
 * expected forever; a ratchet says how much of a known pile is left.
 */
export type Ratchets = Record<string, number>;

export interface Report {
  /** What does not hold. Empty is what a product is aiming for. */
  findings: Finding[];
  /**
   * Exemptions that no longer exempt anything.
   *
   * Reported as failures, not swept up: this is the fourteen-stale-notes case,
   * and it is the reason the whole harness exists in this shape.
   */
  staleExemptions: { subject: string; reason: string }[];
  /** How many subjects each check looked at, so a silent check is visible. */
  examined: Record<string, number>;
  /**
   * Checks whose findings are being worked off against a count, and how it stands.
   *
   * `allowed` is what the product declared; `found` is what the run measured. Equal is
   * the passing case, and either direction is a failure — see `Ratchets`.
   */
  ratcheted: { check: string; allowed: number; found: number; families: string[] }[];
}

/** Everything a check is given. */
export interface Subject {
  /** The product's schema. */
  schema: {
    nodes: Map<
      string,
      { name: string; group?: string; content?: string; attrs?: Record<string, unknown> }
    >;
    /** Where a document starts, which is where reachability is walked from. */
    topNode?: string;
  };
  /** Whether the product has a renderer registered for a node type. */
  hasRenderer: (nodeType: string) => boolean;
  /**
   * Every icon name the product's controls ask for, from its own declarations.
   *
   * The declarations rather than the screen: a control on a tab nobody opened is
   * declared exactly like a visible one, and the browser test that watches for a
   * fallback can only see what is drawn. `iconsIn` in `@barocss/office-controls`
   * collects them.
   */
  iconsAsked?: string[];
  /** Whether the suite draws a picture for that name. */
  iconDrawn?: (name: string) => boolean;
  /**
   * The tag a product actually draws a node type as, or null if it cannot say.
   *
   * Rendered rather than declared. A product that *states* what it draws can
   * state something that stopped being true — which is the whole failure this
   * harness is shaped around — so the answer is taken from a real render, and a
   * node type that cannot be rendered on its own returns null and is skipped.
   *
   * Optional because a product can adopt the checks one at a time. A check that
   * needs it and does not get it reports `examined: 0`, which is how a check
   * that is quietly doing nothing stays visible.
   */
  drawnAs?: (nodeType: string) => string | null;
  /**
   * The element a node type's *children* land in, or null if it cannot say.
   *
   * Not the same question as `drawnAs`, and the difference is the whole of
   * containment. A node draws a tree, not an element: `bTableHeader` draws a
   * `<thead>` with a `<tr>` inside it and puts its cells in the `<tr>`. Asked
   * "what tag is it", the answer is `thead`; asked "what will hold its
   * children", the answer is `tr`, and only the second one decides whether a
   * cell is legally placed.
   *
   * They were one function, which made a renderer that put the required element
   * *inside itself* look broken — the fix for a real fault reported as the fault
   * it fixed. Falls back to `drawnAs` when a product does not supply it, which
   * is right for the overwhelming majority of renderers: one element with the
   * content slot directly inside it.
   */
  holdsIn?: (nodeType: string) => string | null;
  /**
   * What the product calls a node type, in a list a reader reads.
   *
   * Asked of the product rather than read from a list of its own making, for the
   * same reason `drawnAs` is rendered rather than declared: a stated fact is a
   * note, and a note outlives the thing it describes.
   *
   * Nothing for a type the product has no word for — including one it would draw
   * a *fallback* for. A fallback makes a missing name look like a name, which is
   * the whole failure `every-drawing-can-be-named` is about.
   *
   * Optional, so a product can adopt the checks one at a time.
   */
  nameOf?: (nodeType: string) => string | null;
  /**
   * Whether the product's drawing of a node type **changes** when an attribute is
   * set — which is the only definition of "read" that can be taken from the product
   * rather than claimed about it.
   *
   * `null` when the product cannot be asked: a renderer that will not run on a bare
   * node. The check skips those and does not count them, so its `examined` number is
   * the number of real answers.
   *
   * Optional, so a product can adopt the checks one at a time.
   */
  attributeRead?: (nodeType: string, attr: string) => boolean | null;
}

export interface Check {
  /** The name findings carry, and the key `examined` counts under. */
  name: string;
  /** One sentence on what holding means, shown when the check fails. */
  describe: string;
  run: (subject: Subject) => { findings: Finding[]; examined: number };
}
