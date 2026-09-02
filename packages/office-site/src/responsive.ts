/**
 * What a node says **differently at a narrower width**, and how a view drawing that width reads it.
 *
 * ## An override is not a second document
 *
 * A page edited at 390 is the same page as the one edited at 1280. What a narrower width holds is
 * only what *differs* — a row that stacks, a padding that shrinks — and everything else is still the
 * page's own answer. That is the rule a page's variables already follow against the document's, and
 * it is the rule that makes editing three widths at once mean anything: a heading typed in the
 * mobile frame is the heading, because there is only one.
 *
 * The cascade runs **widest to narrowest**, which is CSS's own `max-width` shape: at 390 the page
 * answers, then the tablet's overrides, then the mobile's, and the last word wins. So a padding set
 * on tablet is inherited by mobile unless mobile says otherwise — one statement covers both narrow
 * widths, which is what a reader means by "on small screens".
 *
 * ## Why a map here, when the schema refuses maps elsewhere
 *
 * `componentBind` is a *node* and its comment says why: a binding names an attribute of a part it is
 * **not on**, and nothing can check that a part declares `cornerRadius` from over here. So a map
 * there would be a value nothing could check, which is the fault this schema keeps finding.
 *
 * An override is the other case, and the difference is the whole argument: it names attributes of
 * **the node it is written on**, and the schema knows exactly what that node declares. So the check
 * is available — `overrideFaults` below makes it, against the node's own declared attributes, and a
 * test holds it. A map that can be checked is not the thing that was refused.
 *
 * The alternative was a child node, and it was refused for a reason worth writing down: a paragraph
 * and a heading would then hold non-text children at the front of their content, and every offset in
 * the text stack counts from there. A responsive layout is not worth a change to what a paragraph
 * contains.
 *
 * ## Where this is read
 *
 * In the renderers, from the env — never in the store's content resolver. The resolver belongs to
 * the store and the store has one, so every view would get the same answer to the one question whose
 * whole point is that three views answer it differently (`breakpoints.ts`).
 */
import { BREAKPOINTS, baseOf, overridableIn, scopesFor, type BreakpointId, type SiteWidth } from './breakpoints';

/** What a node says at widths narrower than its own. The widest is the node itself. */
export type OverrideMap = Partial<Record<BreakpointId, Record<string, unknown>>>;

/**
 * The widest breakpoint, which is the one a node's own attributes *are*.
 *
 * **A default, not a fact.** It used to be `'desktop'` and it is the widest of whatever the document
 * declares now — see `baseOf`. Kept as a constant for the callers that have no document to hand and
 * for every document that declares no widths, which is what makes the change invisible to them.
 */
export const BASE_BREAKPOINT: BreakpointId = baseOf();

/** The widths an override may be written at: every one but the base, which is the node itself. */
export const OVERRIDABLE: BreakpointId[] = overridableIn();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * What a node states at narrower widths, or nothing when it states nothing.
 *
 * **Every scope it names is kept**, not only the ones a list knows about — which is the half that had
 * to change when the list stopped being a constant. An override written at a width the document no
 * longer has is *kept and never applied*: deleting a width is not a reason to destroy the work done
 * at it, and a file that silently lost half a design because somebody tidied a list is the worst kind
 * of data loss, because it is invisible. What decides whether a scope applies is `scopesFor`, which
 * reads the document's own list.
 */
export function overridesOf(attrs: Record<string, unknown> | undefined): OverrideMap {
  const map = attrs?.overrides;
  if (!isRecord(map)) return {};

  const kept: OverrideMap = {};
  for (const [id, at] of Object.entries(map)) {
    if (isRecord(at)) kept[id] = at;
  }
  return kept;
}

/**
 * The attributes this node is **drawn with** at one width.
 *
 * The node's own, then each narrower scope in turn down to the one being drawn. `scopesFor` lists
 * them narrowest-first because that is the order a resolver asks in; the cascade applies them the
 * other way round, so the narrowest has the last word — the same answer either way, said in the
 * direction each caller needs.
 *
 * A node with no overrides is returned **as it is**, not copied: silence has to cost nothing, since
 * the overwhelming majority of blocks on a page say the same thing at every width.
 */
export function attrsAt(
  attrs: Record<string, unknown> | undefined,
  breakpoint: BreakpointId,
  /**
   * The document's own widths, when the caller has them.
   *
   * Defaulted rather than required, and the default is the three every site starts with: a caller
   * that has no document to hand — a test, a probe, a renderer whose host predates the list — gets
   * exactly the behaviour it had. A caller that *does* have one passes it, and a fourth width works.
   */
  widths: SiteWidth[] = BREAKPOINTS
): Record<string, unknown> {
  return attrsThrough(attrs, scopesFor(breakpoint, widths));
}

/**
 * The same, given the **scopes** rather than a width and a list.
 *
 * Which is what a renderer has: it is handed a node and an env, and the env carries the order this
 * view resolves through because the order is a fact about the document's list of widths and a
 * renderer cannot reach one (`breakpoints.ts`).
 *
 * Narrowest-first, ending at the base — so the last entry is the base and this drops it, which is
 * how the function knows which one is the node's own without being told twice.
 */
export function attrsThrough(
  attrs: Record<string, unknown> | undefined,
  scopes: BreakpointId[]
): Record<string, unknown> {
  const overrides = overridesOf(attrs);
  const apply = scopes
    .slice(0, Math.max(0, scopes.length - 1))
    .filter((id) => overrides[id])
    .reverse();
  if (apply.length === 0) return attrs ?? {};

  let merged = { ...(attrs ?? {}) };
  for (const id of apply) {
    for (const [name, value] of Object.entries(overrides[id] ?? {})) {
      /**
       * **`null` un-says it**, which a merge on its own could not.
       *
       * An override could change a number and could not take one back: `{ mobile: { maxWidth: … } }`
       * says *this much instead*, and there was no way to say *none at all here*. Every real design
       * needs it — a sidebar that is a sidebar at 1280 and the whole column at 390, a card with a
       * maximum width that a phone should ignore — and the workaround is a number large enough to
       * mean nothing, which is a lie in the document that a later reader has to decode.
       *
       * Found by drawing the sample's contact form rather than by reading this file: it wanted to be
       * 340 wide beside the words and full width under them, and the second half could not be said.
       *
       * `null` and not `undefined`, and the difference is the whole point: `undefined` is what
       * `withOverride` writes to **take the override back**, leaving the page's own answer. Two
       * gestures a reader genuinely means differently — *nothing here* and *the same as everywhere* —
       * and one of them was unreachable.
       */
      if (value === null) delete merged[name];
      else merged[name] = value;
    }
  }
  // The map itself is not an attribute anything draws with, and leaving it in would hand `frameCss`
  // a key it has no answer for. Taken off here, once, rather than in every renderer.
  delete merged.overrides;
  return merged;
}

/**
 * Which attributes this width actually changes — what a panel marks so a reader can see that the
 * value in front of them is this width's rather than the page's.
 *
 * Every layout tool that has overrides has this mark, and every one that lacks it produces the same
 * complaint: a reader edits a value on mobile, cannot tell it did not apply everywhere, and finds
 * out on the desktop frame.
 */
export function overriddenAt(
  attrs: Record<string, unknown> | undefined,
  breakpoint: BreakpointId,
  widths: SiteWidth[] = BREAKPOINTS
): string[] {
  const overrides = overridesOf(attrs);
  const base = baseOf(widths);
  const names = new Set<string>();
  for (const id of scopesFor(breakpoint, widths)) {
    if (id === base) continue;
    for (const name of Object.keys(overrides[id] ?? {})) names.add(name);
  }
  return [...names].sort();
}

/**
 * The overrides a node would have after saying one thing at one width.
 *
 * Pure, and returned rather than written, so the command has one thing to put in a transaction and a
 * test can hold the arithmetic without an editor. `undefined` takes the statement off, and a scope
 * with nothing left in it is removed — an empty `{ mobile: {} }` in a saved file is a reader
 * wondering what it means.
 */
export function withOverride(
  attrs: Record<string, unknown> | undefined,
  at: BreakpointId,
  name: string,
  value: unknown
): OverrideMap {
  const overrides: OverrideMap = { ...overridesOf(attrs) };
  const scope: Record<string, unknown> = { ...(overrides[at] ?? {}) };

  if (value === undefined) delete scope[name];
  else scope[name] = value;

  if (Object.keys(scope).length === 0) delete overrides[at];
  else overrides[at] = scope;

  return overrides;
}

/**
 * What is wrong with a node's overrides, against what that node declares.
 *
 * The check the map's own comment promises. Two faults, and both are things a reader can produce:
 * a width nobody draws (`{ watch: {...} }`), and an attribute the node does not have — which is how
 * `layoutMode` written on a `heading` is caught rather than silently drawing nothing.
 */
export function overrideFaults(
  attrs: Record<string, unknown> | undefined,
  declared: Iterable<string>,
  /**
   * The widths this **document** is designed at, when the caller has them.
   *
   * It asked `OVERRIDABLE` — the three every site starts with — and that was right for exactly as
   * long as the list was a constant. A reader who added a fourth width and said something at it got
   * *'width-4' 너비는 그려지지 않습니다* about a width their own document declares: the fault list
   * calling correct work wrong, which is worse than not checking, because the reader believes it.
   */
  widths: SiteWidth[] = BREAKPOINTS
): string[] {
  const map = attrs?.overrides;
  if (map === undefined) return [];
  if (!isRecord(map)) return ['너비별 설정이 목록이 아닙니다'];

  const known = new Set(declared);
  const drawn = overridableIn(widths);
  const faults: string[] = [];

  for (const [id, scope] of Object.entries(map)) {
    if (!drawn.includes(id as BreakpointId)) {
      faults.push(`'${id}' 너비는 그려지지 않습니다`);
      continue;
    }
    if (!isRecord(scope)) {
      faults.push(`'${id}'에 적힌 것이 설정이 아닙니다`);
      continue;
    }
    for (const name of Object.keys(scope)) {
      if (name === 'overrides') faults.push(`'${id}'가 너비별 설정을 또 담고 있습니다`);
      else if (known.size > 0 && !known.has(name))
        faults.push(`'${id}'에서 '${name}'을(를) 바꾸는데, 이 블록에는 없는 속성입니다`);
    }
  }
  return faults;
}
