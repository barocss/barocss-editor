import { childrenOf, copyOf, type DeckAccess, type DeckNode } from './deck';

/**
 * A component's definition, and what a placement of it draws.
 *
 * ## The two decisions, and where they came from
 *
 * **A definition lives in the document's library**, a `components` container beside
 * `resources`. It took three tries to land there and each move was measured:
 *
 * - Not a box on a slide: it would be drawn twice, once as itself and once through every
 *   placement, and be selectable by clicking the master copy.
 * - Not a *surface*, which was the first answer. A surface is a **page**, so saying a
 *   definition was one made every reader of the page sequence ask whether each page counted,
 *   and two of them leaked before the third was written.
 * - Not a corner of `resources`, which was the second answer and *worked* — a definition drew
 *   hidden exactly as `slideLayout` does, and the stage's focus rule showed it. What moved it
 *   out was **display and ownership**: everything in `resources` is hidden as a group because
 *   none of it belongs on the screen, and a definition being edited is the one thing that
 *   does, so showing it meant reaching through the container that exists to hide things —
 *   a `:has()` rule, written because un-hiding the container outright put the ruler 6px off.
 *   A container whose whole purpose is components can simply be shown. And a library is a
 *   thing to own: a name, a source, a brand kit.
 *
 * Hidden is still how a definition draws when nobody has opened it — *a node with no element
 * has no place in the sid map, and every mapping from a DOM position back to the model goes
 * through that* — and the overlay, the panel and the guides key on sids rather than on what
 * kind of thing they are looking at.
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

/** A component's definition, as its readers need it. */
export interface ComponentDef {
  /**
   * The **durable** id a placement points at — the `id` attribute, not the sid.
   *
   * Saving strips sids, so a reference written in one breaks the first time the deck is opened
   * again. A layout is referenced this way for the same reason.
   */
  id: string;
  /** Where the definition is *now*, for reading its parts out of this document. */
  sid: string;
  name: string;
  /** What the definition holds, as the sids of its parts in this session. */
  parts: string[];
  /** What a placement of it can be asked for, in the order it declares them. */
  vars: ComponentVar[];
  /**
   * Which piece of it takes which variable, and in what.
   *
   * On the definition rather than on the parts, which is the correction §10g-2 makes: three
   * attributes on every canvas node meant a variable could drive exactly three things, and a
   * `number` could only ever be text. A declaration made of nodes costs nothing per attribute, so
   * a variable can drive anything a part declares — and a placement's copies carry nothing at all.
   */
  binds: ComponentBind[];
}

/** One binding: a piece of the definition, an attribute (or `text`), and the variable it takes. */
export interface ComponentBind {
  /** A durable `partId` anywhere inside the definition — a nested piece may be bound too. */
  part: string;
  /** The attribute to write, or `text` for the words, which are content rather than an attribute. */
  attr: string;
  var: string;
}

/**
 * One thing a placement can be asked for.
 *
 * Read out of the definition's `componentVar` children rather than parsed from an attribute,
 * which is the same argument this repository has made against every structured value in one
 * opaque string: a declaration made of nodes is one the validator checks, the conformance
 * probe reads, and a panel draws without a parser.
 */
export interface ComponentVar {
  name: string;
  label: string;
  kind: 'text' | 'color' | 'number' | 'boolean' | 'choice';
  /** The values a `choice` may take; empty for every other kind. */
  choices: string[];
  /** What a placement gets when it says nothing. */
  value: string;
}

const VAR_KINDS = ['text', 'color', 'number', 'boolean', 'choice'] as const;

/** The variables one definition declares, in document order. */
function componentVarsOf(doc: DeckAccess, definition: DeckNode): ComponentVar[] {
  const found: ComponentVar[] = [];
  for (const sid of childrenOf(definition)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'componentVar') continue;
    const name = node.attributes?.name;
    // A variable with no name is one nothing can bind to, which is not a variable.
    if (typeof name !== 'string' || name.length === 0) continue;
    const kind = node.attributes?.kind;
    found.push({
      name,
      label: typeof node.attributes?.label === 'string' ? node.attributes.label : name,
      // The schema's own set, so a kind this does not know reads as text rather than as
      // nothing: a field a reader can still type in beats a field that vanishes.
      kind: VAR_KINDS.includes(kind as never) ? (kind as ComponentVar['kind']) : 'text',
      choices: Array.isArray(node.attributes?.choices)
        ? node.attributes.choices.filter((one: unknown): one is string => typeof one === 'string')
        : [],
      value: typeof node.attributes?.value === 'string' ? node.attributes.value : ''
    });
  }
  return found;
}

/** The bindings one definition declares, in document order. */
function componentBindsOf(doc: DeckAccess, definition: DeckNode): ComponentBind[] {
  const found: ComponentBind[] = [];
  for (const sid of childrenOf(definition)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'componentBind') continue;
    const part = node.attributes?.part;
    const attr = node.attributes?.attr;
    const name = node.attributes?.var;
    // A binding missing any of its three is a binding nothing could follow, which is not one.
    if (typeof part !== 'string' || !part) continue;
    if (typeof attr !== 'string' || !attr) continue;
    if (typeof name !== 'string' || !name) continue;
    found.push({ part, attr, var: name });
  }
  return found;
}

/**
 * What one placement says its variables are: the definition's declaration, with the
 * placement's own `componentValue` children on top.
 *
 * Every declared variable comes back whether the placement mentions it or not, because the
 * question a panel asks is "what can this be asked for", and a field that appears only once a
 * value exists is a field a reader cannot use to set the first one.
 */
export function instanceVars(
  doc: DeckAccess,
  instance: DeckNode | undefined,
  definition: ComponentDef | undefined
): Array<ComponentVar & { set: boolean }> {
  if (!definition) return [];
  const said = new Map<string, string>();
  for (const sid of childrenOf(instance)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'componentValue') continue;
    const name = node.attributes?.name;
    if (typeof name !== 'string' || name.length === 0) continue;
    said.set(name, typeof node.attributes?.value === 'string' ? node.attributes.value : '');
  }
  return definition.vars.map((one) => ({
    ...one,
    value: said.has(one.name) ? (said.get(one.name) as string) : one.value,
    /** Whether *this placement* said it, which is what a panel shows as "changed". */
    set: said.has(one.name)
  }));
}

/** Every component this document defines, in document order. */
export function deckComponents(doc: DeckAccess): ComponentDef[] {
  const root = doc.getNode(doc.rootId);
  if (!root) return [];

  const found: ComponentDef[] = [];
  for (const sid of childrenOf(root)) {
    const node = doc.getNode(sid);
    // The library, not `resources`: see the header for why they are two containers.
    if (node?.stype !== 'components') continue;

    for (const child of childrenOf(node)) {
      const definition = doc.getNode(child);
      if (definition?.stype !== 'component') continue;
      const id = definition.attributes?.id;
      // A definition with no id is one nothing can point at, which is not a definition.
      if (typeof id !== 'string' || id.length === 0) continue;
      found.push({
        id,
        sid: child,
        name: typeof definition.attributes?.name === 'string' ? definition.attributes.name : '',
        /**
         * What it draws — its **variables left out**.
         *
         * A declaration is not a part: nothing copies it into a placement, nothing pairs it by
         * `partId`, and counting it as one would make every placement look one part behind.
         */
        parts: childrenOf(definition).filter((child) => {
          const stype = doc.getNode(child)?.stype;
          // A declaration is not a part: nothing copies it into a placement, and counting one
          // would make every placement look a part behind.
          return stype !== 'componentVar' && stype !== 'componentBind';
        }),
        vars: componentVarsOf(doc, definition),
        binds: componentBindsOf(doc, definition)
      });
    }
  }
  return found;
}

/**
 * The definition a node is **inside**, walking out through whatever contains it.
 *
 * The question a panel about a *part* has to ask: a box selected while a definition is open is
 * a part of it, and a box on a slide is not — and the difference decides whether the panel
 * offers "what this part takes from the card" at all. `slideAt` is the same walk for the same
 * reason, and this is the other half of it: a definition is not a surface, so that one walks
 * past it.
 */
export function definitionAt(doc: DeckAccess, sid: string | undefined): string | undefined {
  let current = sid ? doc.getNode(sid) : undefined;
  let depth = 0;
  while (current && depth++ < 64) {
    if (current.stype === 'component') return (current.sid ?? sid) as string;
    const parentId = (current as { parentId?: unknown }).parentId;
    current = typeof parentId === 'string' ? doc.getNode(parentId) : undefined;
  }
  return undefined;
}

/** The definition a placement points at, or nothing when it is gone. */
export function componentOf(
  doc: DeckAccess,
  instance: DeckNode | undefined
): ComponentDef | undefined {
  const id = instance?.attributes?.componentId;
  if (typeof id !== 'string') return undefined;
  return deckComponents(doc).find((one) => one.id === id);
}

/** A definition part's durable name, which is what a placement's copy points at. */
export function partIdOf(doc: DeckAccess, sid: string): string | undefined {
  const id = doc.getNode(sid)?.attributes?.partId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
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
export function partSignature(
  doc: DeckAccess,
  sid: string,
  depth = 0,
  /**
   * `'own'` leaves the children out, which is the **slot** comparison.
   *
   * Measured: a slot part is *always* different from its origin, because the reader's own boxes
   * are inside it. So rule 3 protected it — and with that, a definition's change to the slot
   * frame itself (its gap, its padding, its size) could never reach a placement a reader had
   * put anything in. Comparing the part without its contents is the question apply actually
   * has about a slot: *has the container changed*, not *is it still empty*.
   */
  scope: 'all' | 'own' = 'all'
): string {
  if (depth > 24) return '…';
  const node = doc.getNode(sid);
  if (!node) return '';

  const attrs = { ...((node.attributes ?? {}) as Record<string, unknown>) };
  /**
   * And what an **arrangement** decided is not what the node says either.
   *
   * A part told to fill its container is given a box by `fillChildren` (or by
   * `layoutChildren` inside a frame), so its numbers are a consequence of the container's size
   * rather than something a reader chose. Comparing them would make every placement a reader
   * had resized look edited in every part — and apply would then leave the whole card alone for
   * ever, which is the granularity cost turning into the whole feature.
   */
  if (attrs.layoutStretch === true) {
    delete attrs.x;
    delete attrs.y;
    delete attrs.width;
    delete attrs.height;
  }
  // Identity and bookkeeping rather than content: `partOf` is a fact about a copy, `partId` is
  // the original's own name — a copy is not different from its original for having one — and
  // `appliedFrom` is the copy's record of what it was *given*, which is a fact about the last
  // apply and not about what the part says.
  delete attrs.partOf;
  delete attrs.partId;
  delete attrs.appliedFrom;
  const own = (node as { text?: unknown }).text;

  return JSON.stringify([
    node.stype,
    Object.keys(attrs)
      .sort()
      .map((key) => [key, attrs[key]]),
    typeof own === 'string' ? own : null,
    scope === 'own' ? null : childrenOf(node).map((child) => partSignature(doc, child, depth + 1))
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
  return definitionSignature(
    definition.vars,
    definition.parts.map((sid) => partSignature(doc, sid))
  );
}

/**
 * The **shape** of a definition's signature, in one place.
 *
 * Two callers compute one: this file, from a definition in the document, and `createComponent`,
 * from a definition that is not in the document yet — the placement it leaves behind has to
 * record what it was given, and the transaction that adds the definition has not run. Two
 * places writing the same JSON by hand is how the two answers come to disagree about a deck,
 * so the shape is stated once and both hand it their pieces.
 */
export function definitionSignature(vars: ComponentVar[], parts: string[]): string {
  return JSON.stringify([
    /**
     * The declaration as well as the drawing.
     *
     * A definition that gains a variable, renames one, or changes a default has moved on just
     * as surely as one whose card grew a badge — and a placement's fields come from the
     * declaration, so leaving it out would let the panel go quietly out of date while the
     * badge said everything was current.
     */
    vars.map((one) => [one.name, one.kind, one.choices, one.value]),
    parts
  ]);
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
  /**
   * The definition's parts by their **durable** names.
   *
   * Not by sid: a placement's `partOf` has to survive being saved, and saving strips sids —
   * so a sid-paired placement would come back from a file with every part looking orphaned,
   * and apply would take them all out. Caught before it shipped, and it is the same rule
   * motion follows for naming a shape.
   */
  const origins = new Map<string, string>();
  for (const part of definition?.parts ?? []) {
    const id = partIdOf(doc, part);
    if (id) origins.set(id, part);
  }

  return (
    childrenOf(instance)
      /**
       * The parts, not what the placement *says*.
       *
       * A `componentValue` is an answer to the declaration, and it has no origin — so counting
       * it here would report it as a part the reader added, and a panel would show a card with
       * three parts as having four.
       */
      .filter((sid) => doc.getNode(sid)?.stype !== 'componentValue')
      .map((sid) => {
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
        const from = origins.get(origin) as string;
        // A slot is compared without its contents: see `partSignature`'s `scope`.
        const scope = slotNameOf(doc, from) ? 'own' : 'all';
        /**
         * Against what this part was **given**, not against what the definition says now.
         *
         * Measured, and it is the correction that makes apply work at all: comparing a part
         * with its origin as it stands means that the moment a definition changes, *every*
         * part differs from it — so rule 3 ("a part that differs is the reader's") protected
         * all of them and apply did nothing whatever. The question is not "does this part
         * match the definition" but "has the reader touched it since it was written", and the
         * answer is the signature the copy recorded when it was made (`appliedFrom` on the
         * part).
         *
         * A part with no record is one from before this was written — a hand-authored
         * placement, a deck saved by an earlier version — and the honest fallback is the old
         * comparison: it cannot tell a stale part from an edited one, so it treats a
         * difference as the reader's and leaves it alone.
         */
        const given = doc.getNode(sid)?.attributes?.appliedFrom;
        if (typeof given === 'string' && given.length > 0) {
          return { sid, origin, changed: partSignature(doc, sid, 0, scope) !== given };
        }
        return {
          sid,
          origin,
          changed: partSignature(doc, sid, 0, scope) !== partSignature(doc, from, 0, scope)
        };
      })
  );
}

/**
 * The signature of a node that is **not in the document yet** — a copy on its way in.
 *
 * The same string `partSignature` computes, from a literal tree instead of from sids, because
 * the copy has to record what it was given *before* anything can look it up. Two functions
 * saying the same thing is the fault this repository keeps finding, so the shape is stated
 * once here and both walk it the same way: type, attributes without the bookkeeping, own text,
 * children.
 */
export function signatureOfLiteral(node: DeckNode, scope: 'all' | 'own', depth = 0): string {
  if (depth > 24) return '…';
  const attrs = { ...((node.attributes ?? {}) as Record<string, unknown>) };
  delete attrs.partOf;
  delete attrs.partId;
  delete attrs.appliedFrom;
  const own = (node as { text?: unknown }).text;
  const children = Array.isArray((node as { content?: unknown }).content)
    ? ((node as { content: unknown[] }).content as DeckNode[])
    : [];

  return JSON.stringify([
    node.stype,
    Object.keys(attrs)
      .sort()
      .map((key) => [key, attrs[key]]),
    typeof own === 'string' ? own : null,
    scope === 'own' ? null : children.map((child) => signatureOfLiteral(child, 'all', depth + 1))
  ]);
}

/**
 * Bringing a definition in **from another deck**, and telling later that it has moved on.
 *
 * ## Why a copy and not a reference
 *
 * The measurement the whole materialised design rests on: a template cannot draw a foreign node
 * (§10b-2). A definition in another document could not be drawn here however it was referenced, so
 * it is **copied** — and what makes it a library rather than a paste is that the copy remembers
 * where it came from and can be brought in again. Which is the relationship Figma has across files,
 * and for the same reason: it cannot be live there either, so updates are offered and accepted.
 *
 * ## What a copy remembers
 *
 * The deck (a library name or an address, resolved by the host), the definition's id **there**, and
 * what it said at that moment. The last one is a signature rather than a version, for the reason a
 * placement's `appliedFrom` is: a number would have to be maintained by a write on every edit, and
 * a signature is maintained by nobody.
 */
export interface ImportPlan {
  /** The definition to add here, ready for a transaction. */
  node: DeckNode;
  /** The id it will have **here**, which may not be the id it has there. */
  id: string;
  /** The definition it replaces, when this deck already has that import. */
  replaces?: string;
}

/**
 * What bringing `id` from `source` into `host` changes.
 *
 * The renaming is the part with a rule. Two decks can both define `card`, so an import cannot
 * simply keep its id — and it cannot mint a fresh one each time either, or bringing the same
 * definition in twice would leave two cards and every placement pointing at the older one. So: if
 * this deck already has *that import* (same deck, same id there), it is **replaced**; otherwise a
 * free id is taken, derived from the id it has there so a person reading the file can still tell
 * what it is.
 */
export function importComponentPlan(
  host: DeckAccess,
  source: DeckAccess,
  id: string,
  /** What the source deck is called, as this deck will remember it. */
  fromDeck: string
): ImportPlan | undefined {
  const definition = deckComponents(source).find((one) => one.id === id);
  if (!definition) return undefined;

  const copy = copyOf(source, definition.sid);
  if (!copy) return undefined;

  const here = deckComponents(host);
  const already = here.find(
    (one) =>
      doc(host, one.sid)?.fromDeck === fromDeck &&
      (doc(host, one.sid)?.fromId ?? doc(host, one.sid)?.id) === id
  );

  const taken = new Set(here.map((one) => one.id).filter((one) => one !== already?.id));
  let mine = already?.id ?? id;
  if (!already) {
    let next = 2;
    while (taken.has(mine)) mine = `${id}-${next++}`;
  }

  return {
    id: mine,
    ...(already ? { replaces: already.sid } : {}),
    node: {
      ...copy,
      attributes: {
        ...(copy.attributes ?? {}),
        id: mine,
        fromDeck,
        fromId: id,
        // What it said when it was copied, so staleness is a comparison and not a record to keep.
        fromSignature: componentSignature(source, definition)
      }
    }
  };
}

/** A definition's own attributes, which this file otherwise reads through `ComponentDef`. */
function doc(access: DeckAccess, sid: string): Record<string, any> | undefined {
  return access.getNode(sid)?.attributes as Record<string, any> | undefined;
}

/**
 * Where an imported definition came from, as its readers need it.
 *
 * Absent for a definition this deck made itself, which is the ordinary case — so a panel can say
 * "this one is the brand kit's" only about the ones that are.
 */
export interface ComponentSource {
  deck: string;
  /** Its id in that deck. */
  id: string;
  /** What that definition said when this copy was made. */
  signature?: string;
}

export function componentSourceOf(
  doc: DeckAccess,
  definition: ComponentDef | undefined
): ComponentSource | undefined {
  const attrs = definition ? doc.getNode(definition.sid)?.attributes : undefined;
  const deck = attrs?.fromDeck;
  if (typeof deck !== 'string' || deck.length === 0) return undefined;
  const id = attrs?.fromId;
  return {
    deck,
    id: typeof id === 'string' && id.length > 0 ? id : definition!.id,
    signature: typeof attrs?.fromSignature === 'string' ? attrs.fromSignature : undefined
  };
}

/**
 * Whether the deck it came from has moved on since this copy was made.
 *
 * The same question `componentStale` asks about a placement, one level up — and the same honest
 * answer when there is nothing to compare: a copy with no recorded signature is not behind, it is
 * a copy from before this was written, and calling every one of them behind would put a badge on
 * every deck.
 *
 * `source` is the other deck, which the caller has to have in hand: this file cannot fetch, and the
 * host is what knows whether a name is in a library or an address to get (§11i).
 */
export function componentBehindSource(
  host: DeckAccess,
  definition: ComponentDef | undefined,
  source: DeckAccess | undefined
): boolean {
  const from = componentSourceOf(host, definition);
  if (!from?.signature || !source) return false;
  const there = deckComponents(source).find((one) => one.id === from.id);
  if (!there) return false;
  return componentSignature(source, there) !== from.signature;
}

/** A placement's values by name, which is what a copy is bound with. */
export function instanceValues(
  doc: DeckAccess,
  instance: DeckNode | undefined,
  definition: ComponentDef | undefined
): Map<string, string> {
  const said = new Map<string, string>();
  for (const one of instanceVars(doc, instance, definition)) said.set(one.name, one.value);
  return said;
}

/** What applying a definition to one placement changes. */
export interface ApplyPlan {
  /** Parts to take out: their origin is gone and the reader had not touched them. */
  remove: string[];
  /**
   * Parts to write again from the definition.
   *
   * `keepChildren` is the **slot** rule: the part is a container the reader puts their own
   * things in, so its own attributes come from the definition and what is inside it stays.
   * Without it a slot would be the one place in this model where apply destroys the reader's
   * work — their boxes are descendants of a part that *does* have an origin, so rule 1 does
   * not protect them.
   */
  rewrite: { sid: string; from: string; keepChildren?: boolean }[];
  /** Definition parts this placement does not have yet, in the definition's order. */
  add: string[];
  /**
   * The placement's own box, when the definition is a different size from it.
   *
   * Because a placement's extent **is** its definition's (§10b-4), and nothing kept them in
   * agreement: a card grown from 5040×3960 to 6000×4200 left every placement of it drawing a
   * bigger card inside a smaller selection outline. The same fault the group fitter exists for,
   * one node type along — and the reason a placement gets no resize handles of its own.
   */
  box?: { width: number; height: number };
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
 * 5. **A slot's contents are the reader's.** A part the definition marks as a `slot` is
 *    rewritten like any other, but what is *inside* it stays: it is the one place a reader's
 *    own boxes live under a part that has an origin, so rule 1 does not reach them.
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

  /** The definition's parts by durable name, which is what a placement points at. */
  const byId = new Map<string, string>();
  for (const part of definition.parts) {
    const id = partIdOf(doc, part);
    if (id) byId.set(id, part);
  }

  const rewrite = state
    .filter((part) => part.origin && !part.changed && byId.has(part.origin))
    .map((part) => {
      const from = byId.get(part.origin as string) as string;
      const entry: { sid: string; from: string; keepChildren?: boolean } = {
        sid: part.sid,
        from
      };
      // Rule 5: a slot's contents are the reader's, whatever the definition now says the slot
      // itself looks like.
      if (slotNameOf(doc, from)) entry.keepChildren = true;
      return entry;
    });

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
    .filter((part) => part.origin && !byId.has(part.origin))
    .map((part) => part.sid);

  const add = definition.parts.filter((sid) => {
    const id = partIdOf(doc, sid);
    // A part with no durable name cannot be pointed at, so it cannot be given to a placement
    // — and saying so here is better than copying one that could never be paired again.
    return !!id && !held.has(id);
  });

  /** What the definition is, against what this placement says it is. */
  const size = {
    width: numberOf(doc.getNode(definition.sid)?.attributes?.width),
    height: numberOf(doc.getNode(definition.sid)?.attributes?.height)
  };
  /**
   * Corrected only for a placement that does **not** own its size.
   *
   * A card whose parts fill it is a card the reader may resize, and dragging its box back to the
   * definition's on the next apply would undo their work — the definition says how big the card
   * is *by default*, not how big every placement of it must stay.
   */
  const box =
    !placementFills(doc, instance) &&
    size.width !== undefined &&
    size.height !== undefined &&
    (size.width !== numberOf(instance.attributes?.width) ||
      size.height !== numberOf(instance.attributes?.height))
      ? { width: size.width, height: size.height }
      : undefined;

  return {
    remove,
    rewrite,
    add,
    ...(box ? { box } : {}),
    appliedFrom: componentSignature(doc, definition)
  };
}

/**
 * Whether this placement **owns its size** — because something in it fills it.
 *
 * The condition that decides whether a reader may resize a card in place. A placement has no
 * arrangement of its own, so if nothing in it was told to fill it, dragging its corner writes a
 * box and changes nothing that can be seen (measured: 8280×6440 onto a card whose parts stayed
 * 5040×3960). With a part that fills it, the reader's drag reaches the card: the part takes the
 * new box and, when it is a frame, arranges its own children one pass later.
 *
 * *Some*, not all: a card is usually a background and a body that fill it plus a badge that does
 * not, and the badge staying where it was put is the honest answer until this schema has
 * constraints (§10b-12).
 */
export function placementFills(doc: DeckAccess, instance: DeckNode | undefined): boolean {
  return childrenOf(instance).some((sid) => doc.getNode(sid)?.attributes?.layoutStretch === true);
}

/** A number as itself, or nothing — so "absent" and "0" are not the same answer. */
function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The name a part gives its slot, when it is one. */
export function slotNameOf(doc: DeckAccess, sid: string): string | undefined {
  const name = doc.getNode(sid)?.attributes?.slot;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

/**
 * The part in a placement that a reader's own boxes belong in.
 *
 * Figma added slots because instance-swap could not say "put whatever you like here", and paid
 * for it with a second layout system inside components. Here a slot is an ordinary part — very
 * often a `frame`, so the arrangement is the frame's, which already exists and already knows
 * that a drag inside it means the order (§5a) — and this is the one sentence the marker buys:
 * a placement's own children go **in** it rather than beside the definition's parts.
 */
export function instanceSlot(
  doc: DeckAccess,
  instance: DeckNode | undefined,
  definition: ComponentDef | undefined,
  name?: string
): string | undefined {
  if (!definition) return undefined;
  const wanted = new Set<string>();
  for (const part of definition.parts) {
    const slot = slotNameOf(doc, part);
    if (!slot) continue;
    if (name && slot !== name) continue;
    const id = partIdOf(doc, part);
    if (id) wanted.add(id);
  }
  if (wanted.size === 0) return undefined;

  for (const sid of childrenOf(instance)) {
    const origin = doc.getNode(sid)?.attributes?.partOf;
    if (typeof origin === 'string' && wanted.has(origin)) return sid;
  }
  return undefined;
}

/**
 * What a part **takes**, once a placement's values are known.
 *
 * Substituted here, when the definition is applied, and *not* when the placement is drawn — for
 * exactly the reason the parts themselves are copied: a template cannot draw a foreign node
 * (§10b-2), so the drawing stays plain and every reader of the document sees the value that is
 * really there. A renderer resolving a binding would also mean a placement's text could not be
 * searched, spell-checked or measured without the definition in hand.
 *
 * The bindings arrive from the **definition** and are matched to a node by its durable `partId`,
 * which is why a nested piece can be bound: it only has to have a name.
 */
function bindValues(
  node: DeckNode,
  values: Map<string, string>,
  binds: ComponentBind[]
): DeckNode {
  const attrs = { ...((node.attributes ?? {}) as Record<string, unknown>) };
  let next: DeckNode & { text?: string; content?: unknown } = { ...node };

  const partId = typeof attrs.partId === 'string' ? attrs.partId : undefined;
  const mine = partId ? binds.filter((bind) => bind.part === partId) : [];

  for (const bind of mine) {
    const value = values.get(bind.var);
    if (value === undefined) continue;

    if (bind.attr === 'text') {
      next = { ...next, ...withText(next, value) };
      continue;
    }

    /**
     * A **boolean** written as the falsy half only.
     *
     * `visible: true` beside no `visible` at all is the same drawing — the asymmetry the
     * conformance probe finds in every boolean — so an "off" writes `false` and an "on" removes the
     * attribute rather than writing a value the renderer cannot tell from absent.
     */
    if (value === 'false' || value === 'true') {
      const off = value === 'false';
      /*
       * Which half is "off" depends on the attribute: `visible: false` hides a part, and there is
       * no attribute here for which `true` is the quiet answer — so the rule is stated as it is
       * rather than guessed per name.
       */
      if (off) attrs[bind.attr] = false;
      else delete attrs[bind.attr];
      continue;
    }

    /**
     * A **number** kept as a number, when the attribute is one.
     *
     * The document keeps a variable's value as a string, on purpose — one shape to write, one to
     * diff, one to check (`componentValue`) — and an attribute that means a length has to be a
     * number or every reader of it would have to parse. So the conversion happens exactly here,
     * at the one place a value becomes an attribute.
     */
    const asNumber = Number(value);
    attrs[bind.attr] = value.trim() !== '' && Number.isFinite(asNumber) ? asNumber : value;
  }

  const children = childrenOf(node);
  if (children.length > 0 && Array.isArray((node as { content?: unknown }).content)) {
    // A detached copy: `content` holds nodes rather than sids, which is what `copyOf` builds.
    const content = (node as { content: unknown[] }).content;
    if (content.length > 0 && typeof content[0] === 'object') {
      next = {
        ...next,
        content: content.map((child) => bindValues(child as DeckNode, values, binds))
      } as never;
    }
  }

  return { ...next, attributes: attrs } as DeckNode;
}

/**
 * A bound part **draws the value and nothing else**.
 *
 * So the runs collapse to one: the first one's formatting is kept, so the definition's font
 * and colour survive, and the rest go. Writing into the first run and leaving the others would
 * put the value on the page followed by whatever the definition happened to say next — a card
 * reading "매출을 쓰세요" beside the number a reader had just typed.
 */
function withText(node: DeckNode, text: string): Partial<DeckNode> & { text?: string } {
  const content = (node as { content?: unknown }).content;
  if (typeof (node as { text?: unknown }).text === 'string') return { text };
  if (!Array.isArray(content) || content.length === 0 || typeof content[0] !== 'object') {
    return {};
  }

  const first = content[0] as DeckNode;
  const rest = withText(first, text);
  return { content: [{ ...first, ...rest }] } as never;
}

/** A copy with the definition's own names for its inner pieces taken out. */
function withoutNestedPartIds(node: DeckNode, depth = 0): DeckNode {
  if (depth > 24) return node;
  const content = (node as { content?: unknown }).content;
  const kids = Array.isArray(content) && typeof content[0] === 'object' ? (content as DeckNode[]) : [];
  if (kids.length === 0) return node;

  return {
    ...node,
    content: kids.map((child) => {
      const attrs = { ...((child.attributes ?? {}) as Record<string, unknown>) };
      delete attrs.partId;
      return withoutNestedPartIds({ ...child, attributes: attrs }, depth + 1);
    })
  } as never;
}

/**
 * A definition part, ready to be put in a placement.
 *
 * A **copy**, with `partOf` written on it: the copy is what makes editing one placement's
 * heading not rewrite the definition, and `partOf` is what makes it possible to tell later
 * that this box came from there. Both halves of the same sentence.
 */
export function partCopy(
  doc: DeckAccess,
  origin: string,
  /**
   * What this placement says its variables are, by name.
   *
   * Optional, because a definition that declares none needs none — and a copy made without
   * them is a copy that still draws the definition's own defaults rather than an empty box.
   */
  values?: Map<string, string>,
  /**
   * What the definition binds, so this copy can take it.
   *
   * Handed in rather than read from the part, which is §10g-2's correction: the bindings live with
   * the **definition** now, so a copy carries none and a variable can drive anything a part
   * declares rather than the three things three attributes allowed.
   */
  binds: ComponentBind[] = []
): DeckNode | undefined {
  const plain = copyOf(doc, origin);
  const copy =
    plain && values && values.size > 0 && binds.length > 0
      ? bindValues(plain, values, binds)
      : plain;
  const id = partIdOf(doc, origin);
  if (!copy || !id) return undefined;

  /*
   * The nested names go too. A `partId` inside a copy is the *definition's* name for that piece —
   * it is what a binding matches on, and apply reads the binding from the definition — so leaving
   * them in a placement would be two boxes claiming to be the same piece, which is the fault the
   * top-level one was stripped for.
   */
  const cleaned = withoutNestedPartIds(copy);
  const attributes = { ...(cleaned.attributes ?? {}) };
  // The copy points at the original's durable name and does not carry it: two boxes claiming
  // to *be* the same part is how a definition ends up pointing at a placement.
  delete attributes.partId;
  delete attributes.appliedFrom;

  /**
   * And it records **what it was given**, so a later apply can tell "the definition has moved
   * on" from "the reader edited this".
   *
   * Of the copy rather than of the origin, because the two differ by exactly the substitution:
   * a part bound to `title` is written with the placement's words in it, and recording the
   * definition's own signature would make every bound part look edited the moment it was made.
   *
   * A slot records only itself (`'own'`), because what goes inside it is the reader's by
   * design — see `ApplyPlan.rewrite`.
   */
  const written: DeckNode = { ...cleaned, attributes: { ...attributes, partOf: id } };
  const scope = slotNameOf(doc, origin) ? 'own' : 'all';
  return {
    ...written,
    attributes: { ...written.attributes, appliedFrom: signatureOfLiteral(written, scope) }
  };
}
