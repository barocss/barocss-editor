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
}

/**
 * A claim that a finding is expected, and why.
 *
 * The reason is not decoration. It is what a reader needs six months later to
 * decide whether the exemption still applies, and it is the only thing that
 * separates "we decided" from "nobody noticed".
 */
export type Exemptions = Record<string, string>;

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
}

export interface Check {
  /** The name findings carry, and the key `examined` counts under. */
  name: string;
  /** One sentence on what holding means, shown when the check fails. */
  describe: string;
  run: (subject: Subject) => { findings: Finding[]; examined: number };
}
