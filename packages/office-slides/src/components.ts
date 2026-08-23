import { childrenOf, copyOf, type DeckAccess, type DeckNode } from './deck';

/**
 * A component's definition, and what a placement of it draws.
 *
 * ## The two decisions, and where they came from
 *
 * **A definition is a surface of its own kind.** Not a box on a slide (which would be drawn
 * twice — once as itself, once through every instance — and selectable by clicking the master
 * copy), and not a node in `resources` (which would have no editing surface, because a
 * surface is the thing this editor edits). `SurfaceKind.Component`, so the stage, the overlay,
 * the panel, the guides and the layer list all work on one without being told anything.
 *
 * **A placement holds its own children, and they win by role.** Which is not Figma's model,
 * on purpose: there, any property of any descendant may be overridden and the override is
 * matched structurally, so renaming a layer mis-applies it and nothing shows a reader which
 * properties have stopped following the definition. Here an instance is to a component
 * exactly what a **slide is to a layout** — it references one, holds its own boxes, and those
 * override by *role, never by position* (§3, `layout-format.ts`).
 *
 * Three things follow, and they are the answer to why this model rather than the incumbent:
 *
 * - Renaming or reordering the definition's children **cannot break a placement**, because
 *   nothing is matched positionally.
 * - What a placement overrides *is* its list of children: there is no hidden state, and no
 *   "reset override" a reader has to go hunting for.
 * - An override is an ordinary node, so the validator checks it and the conformance probe can
 *   read it — the argument this repository has already made twice against keeping structured
 *   values in one opaque attribute.
 *
 * ## And a placement is **materialised**
 *
 * Measured in the render pipeline: a template cannot draw a foreign node. `slot(name)` renders
 * `data[name]` — this node's own proxy — and a raw node object among an element's children is
 * silently dropped. So an instance holds *real* nodes, and what makes it a component rather
 * than a copy is that editing the definition rewrites them **in the entry of that edit**
 * (`appendToPreviousEntry`, §8.11a): one press of undo takes back the definition's change and
 * every placement it updated. `instanceParts` below is what that rewrite is computed from.
 */

/** A component's definition: the surface it is edited on. */
export interface ComponentDef {
  /** The surface's own sid, which is what an instance points at. */
  sid: string;
  name: string;
  /** What the definition draws, as the sids of its children. */
  parts: string[];
}

/** Every component this document defines, in document order. */
export function deckComponents(doc: DeckAccess): ComponentDef[] {
  const root = doc.getNode(doc.rootId);
  if (!root) return [];

  const found: ComponentDef[] = [];
  for (const sid of childrenOf(root)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'surface' || node.attributes?.kind !== 'component') continue;
    found.push({
      sid,
      name: typeof node.attributes?.name === 'string' ? node.attributes.name : '',
      parts: childrenOf(node)
    });
  }
  return found;
}

/** The definition a placement points at, or nothing when it is gone. */
export function componentOf(doc: DeckAccess, instance: DeckNode | undefined): ComponentDef | undefined {
  const id = instance?.attributes?.componentId;
  if (typeof id !== 'string') return undefined;
  return deckComponents(doc).find((one) => one.sid === id);
}

/**
 * What one part of a placement is: where it came from, and whether it still says the same
 * thing.
 *
 * `instanceParts` used to live here — it resolved "what an instance draws" from the
 * definition's children plus role-matched overrides. The render pipeline refuted the design
 * it was written for (a template cannot draw a foreign node, §10b-2), so a placement holds
 * real nodes and there is nothing to resolve at draw time. What is left is the question
 * apply has to answer, which is a different one.
 */
export interface PartState {
  sid: string;
  /** The definition part this was copied from, or nothing when the reader added it. */
  origin?: string;
  /** Whether it still says what its origin says. Absent origin means nothing to compare. */
  changed: boolean;
}

/**
 * What a node **says**, as a string that ignores who it is.
 *
 * Two copies of the same box have different sids and the same signature, which is the whole
 * point: it is what lets a placement be compared with the definition it came from without
 * either of them knowing about the other.
 *
 * What is deliberately left out: `sid` and `parentId` (identity, not content), and `partOf`
 * (a fact about where a copy came from, which the original does not have). Everything else
 * is in, including position — a part a reader has *moved* has been changed, and pretending
 * otherwise would let apply put it back.
 */
export function partSignature(doc: DeckAccess, sid: string, depth = 0): string {
  if (depth > 24) return '…';
  const node = doc.getNode(sid);
  if (!node) return '';

  const attrs = { ...((node.attributes ?? {}) as Record<string, unknown>) };
  delete attrs.partOf;
  const own = (node as { text?: unknown }).text;

  return JSON.stringify([
    node.stype,
    Object.keys(attrs)
      .sort()
      .map((key) => [key, attrs[key]]),
    typeof own === 'string' ? own : null,
    childrenOf(node).map((child) => partSignature(doc, child, depth + 1))
  ]);
}

/**
 * What a whole definition says, for telling "the definition has moved on" from "the reader
 * edited this placement".
 *
 * ## Why a signature and not a version number
 *
 * With materialised placements, comparing a part with its origin cannot tell the two apart —
 * both show up as a difference. A counter on the definition would tell them apart and would
 * have to be *maintained*: a write on the definition every time it changed, which is derived
 * state in the document and the fault this repository keeps finding.
 *
 * A signature needs no maintenance. A placement records the definition's signature at the
 * moment it was applied (`appliedFrom`), and staleness is that string against a freshly
 * computed one — so nothing is written until a reader asks for the definition to be applied.
 */
export function componentSignature(doc: DeckAccess, definition: ComponentDef | undefined): string {
  if (!definition) return '';
  return JSON.stringify(definition.parts.map((sid) => partSignature(doc, sid)));
}

/**
 * Whether the definition has moved on since this placement was last given its parts.
 *
 * Not "does anything differ" — a reader who typed into a placement differs on purpose. This
 * is the other question, the one a badge answers: *there is something new to take.* Which is
 * the same relationship Figma has **across files**, where it also cannot be live: library
 * updates are offered and accepted rather than applied behind the reader's back.
 */
export function componentStale(
  doc: DeckAccess,
  instance: DeckNode | undefined,
  definition: ComponentDef | undefined
): boolean {
  if (!definition) return false;
  const applied = instance?.attributes?.appliedFrom;
  // A placement that has never recorded one is not stale — it is a placement from before
  // this was written, and calling every one of them stale would be a badge on the whole deck.
  if (typeof applied !== 'string' || applied.length === 0) return false;
  return applied !== componentSignature(doc, definition);
}

/**
 * Each of a placement's parts: where it came from, and whether it still says that.
 *
 * The four things apply needs to know, and the reason the pairing is an **origin id** rather
 * than a role or a position:
 *
 * - a part with **no origin** is the reader's own — apply never touches it, which is what
 *   makes adding a whole region inside a placement possible at all (§10e);
 * - a part whose origin still says the same thing is the definition's, and apply may rewrite
 *   it;
 * - a part that **differs** from its origin is an override, and apply leaves it — a reader
 *   who typed a number into a card does not lose it to somebody else's edit;
 * - a part whose origin is **gone** is reported with `origin` set and nothing to compare, so
 *   apply can drop it only when the reader had not touched it.
 */
export function instanceState(
  doc: DeckAccess,
  instance: DeckNode | undefined,
  definition: ComponentDef | undefined
): PartState[] {
  const origins = new Set(definition?.parts ?? []);

  return childrenOf(instance).map((sid) => {
    const origin = doc.getNode(sid)?.attributes?.partOf;
    if (typeof origin !== 'string' || origin.length === 0) {
      return { sid, changed: false };
    }
    if (!origins.has(origin)) {
      // The definition no longer has it. Whether it may go is apply's decision, and it needs
      // to know whether the reader had touched it — which cannot be compared against a part
      // that is not there, so "changed" is the honest false and apply asks another way.
      return { sid, origin, changed: false };
    }
    return {
      sid,
      origin,
      changed: partSignature(doc, sid) !== partSignature(doc, origin)
    };
  });
}

/** What applying a definition to one placement changes. */
export interface ApplyPlan {
  /** Parts to take out: their origin is gone and the reader had not touched them. */
  remove: string[];
  /** Parts to write again from the definition: `{ sid, from }`. */
  rewrite: { sid: string; from: string }[];
  /** Definition parts this placement does not have yet, in the definition's order. */
  add: string[];
  /** What to record on the placement, so staleness can be asked later. */
  appliedFrom: string;
}

/**
 * What apply does to one placement — the four rules, and the reason each is a rule.
 *
 * ## Why apply is a command and not a reaction
 *
 * A reaction on every edit means typing one character in a definition rewrites every
 * placement — forty placements of a five-node card is two hundred writes per keystroke, which
 * is the fault the ruler had (a document write per pointer move) in a new place. A reaction
 * *on closing* the definition would be cheap and would split the two on undo: the definition
 * new, the placements old.
 *
 * So it is asked for. Which is not a compromise but the same relationship **Figma has across
 * files**, where it also cannot be live: a library's updates are offered and accepted rather
 * than applied behind the reader's back. `componentStale` is what offers them.
 *
 * ## The four rules
 *
 * 1. **A part with no origin is untouched.** It is the reader's own — including a whole frame
 *    they added with things under it (§10e) — and apply has nothing to compare it against.
 * 2. **A part that still says what its origin says is rewritten** from the definition. It is
 *    the definition's, and this is how a change arrives.
 * 3. **A part that differs from its origin is left.** That is what an override *is*, with
 *    nothing declared and nothing hidden — a reader who typed a number into a card does not
 *    lose it to somebody else's edit. (The cost, stated in §10b: the granularity is a whole
 *    part, so a definition's colour change does not reach a part whose text was edited.)
 * 4. **A part whose origin is gone goes**, unless the reader had touched it — and "touched"
 *    cannot be compared against a part that is not there, so the honest test is whether it
 *    still matches *any* signature the definition has ever had. It cannot, so the rule is
 *    narrower and says so: it goes only if it is identical to another part of the definition
 *    (a rename) or if the reader never edited *anything* about it. See the note in the body.
 */
export function componentApplyPlan(
  doc: DeckAccess,
  instance: DeckNode | undefined,
  definition: ComponentDef | undefined
): ApplyPlan | undefined {
  if (!definition || !instance) return undefined;

  const state = instanceState(doc, instance, definition);
  const held = new Set(
    state.map((part) => part.origin).filter((origin): origin is string => !!origin)
  );

  const rewrite = state
    .filter((part) => part.origin && !part.changed && definition.parts.includes(part.origin))
    .map((part) => ({ sid: part.sid, from: part.origin as string }));

  /**
   * A part whose origin the definition no longer has.
   *
   * Removed, because leaving it would mean a definition can never lose a part: every
   * placement would keep a copy for ever and a reader deleting something from the card would
   * watch it stay on forty slides.
   *
   * The reader's own boxes are safe from this by rule 1 — they have no origin at all — so
   * what is at risk is a part they *edited* whose original was then deleted. That is a real
   * loss and the honest answer is not to guess: it is removed, and the removal is in the
   * reader's own undo entry, which is where a decision they can disagree with belongs.
   */
  const remove = state
    .filter((part) => part.origin && !definition.parts.includes(part.origin))
    .map((part) => part.sid);

  const add = definition.parts.filter((sid) => !held.has(sid));

  return { remove, rewrite, add, appliedFrom: componentSignature(doc, definition) };
}

/**
 * A definition part, ready to be put in a placement.
 *
 * A **copy**, with `partOf` written on it: the copy is what makes editing one placement's
 * heading not rewrite the definition, and `partOf` is what makes it possible to tell later
 * that this box came from there. Both halves of the same sentence.
 */
export function partCopy(doc: DeckAccess, origin: string): DeckNode | undefined {
  const copy = copyOf(doc, origin);
  if (!copy) return undefined;
  return { ...copy, attributes: { ...(copy.attributes ?? {}), partOf: origin } };
}
