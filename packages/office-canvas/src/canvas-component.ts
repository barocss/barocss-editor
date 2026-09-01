import { readValue } from './value-format';
import { childrenOf, copyOf, type CanvasAccess, type CanvasNode } from './canvas-access';
import { documentVars, isVarRef, resolveVarValue, surfaceOf, surfaceVars } from './canvas-variable';

/**
 * A component's definition, and what a placement of one is.
 *
 * ## Why this is in the shared canvas layer and not in the deck
 *
 * The schema that declares `component`, `instance`, `componentVar`, `componentBind` and
 * `componentValue` is the **office** schema — the one both products build on, so Word's canvas
 * already has cards in its document format and simply has nothing that reads them. Two products
 * reading the same node types differently is not a design choice; it is one of them being wrong,
 * which is the rule `docs/SHARED-LAYER.md` states. And the whole of this file passes that
 * document's test for a shared thing: **it can be said without naming a product.** What a card
 * declares, what a placement was asked for, which part a binding names — none of that is about
 * slides.
 *
 * What stays with the product, for the same test: the **commands** (making a card out of a
 * selection needs "the surface the reader is on", which is a deck's question), the panels, and the
 * deck library that imports a card from another file.
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
 * **A placement holds no parts: it draws the definition.** That is the second answer and the
 * first one is worth remembering, because it was a true measurement taken as the wrong
 * conclusion — a *template* cannot draw a foreign node, so parts were copied into every
 * placement and a change had to be carried across by an apply. A template is a document you
 * copy and then own; a component follows its definition as the definition is edited. Children
 * are resolved in exactly one place — the proxy the view reads them through — and that is where
 * a placement's parts come from now (`canvas-instance.ts`, canvas-model §10b-2a).
 *
 * Three things follow, and they are the answer to why this model rather than the incumbent:
 *
 * - Renaming or reordering a definition's parts **cannot break a placement**, because nothing is
 *   matched positionally: a binding names a part, and a placement names a definition.
 * - What a placement differs by is what it **says** — its variables — and what it puts in the
 *   slot. There is no hidden per-part state and no "reset override" to go hunting for.
 * - A value is an ordinary node, so the validator checks it and the conformance probe can read
 *   it — the argument this repository has already made twice against keeping structured values
 *   in one opaque attribute.
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
  kind: 'text' | 'color' | 'number' | 'boolean' | 'choice' | 'date';
  /** How the answer **reads**, when it is not read as itself — see `readValue`. */
  format?: string;
  /** The values a `choice` may take; empty for every other kind. */
  choices: string[];
  /** What a placement gets when it says nothing. */
  value: string;
}

const VAR_KINDS = ['text', 'color', 'number', 'boolean', 'choice', 'date'] as const;

/** The variables one definition declares, in document order. */
function componentVarsOf(doc: CanvasAccess, definition: CanvasNode): ComponentVar[] {
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
      format: typeof node.attributes?.format === 'string' ? node.attributes.format : undefined,
      choices: Array.isArray(node.attributes?.choices)
        ? node.attributes.choices.filter((one: unknown): one is string => typeof one === 'string')
        : [],
      value: typeof node.attributes?.value === 'string' ? node.attributes.value : ''
    });
  }
  return found;
}

/** The bindings one definition declares, in document order. */
function componentBindsOf(doc: CanvasAccess, definition: CanvasNode): ComponentBind[] {
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
  doc: CanvasAccess,
  instance: CanvasNode | undefined,
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
export function componentsOf(doc: CanvasAccess): ComponentDef[] {
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
export function definitionAt(doc: CanvasAccess, sid: string | undefined): string | undefined {
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
  doc: CanvasAccess,
  instance: CanvasNode | undefined
): ComponentDef | undefined {
  const id = instance?.attributes?.componentId;
  if (typeof id !== 'string') return undefined;
  return componentsOf(doc).find((one) => one.id === id);
}

/** A definition part's durable name, which is what a **binding** names. */
export function partIdOf(doc: CanvasAccess, sid: string): string | undefined {
  const id = doc.getNode(sid)?.attributes?.partId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * What a node **says**, as a string that ignores who it is.
 *
 * Two copies of the same box have different sids and the same signature, which is the whole
 * point — and there is exactly **one** question left that needs it: whether an imported
 * definition still says what the library's copy of it says (`componentBehindSource`). Two
 * documents cannot share a node, so a brand kit is a copy, and this is how a copy is compared
 * with its source without either of them knowing about the other.
 *
 * What is deliberately left out: `sid` and `parentId` (identity, not content) and `partId` (how
 * this deck refers to the part, not something the part says). Everything else is in, including
 * position — two libraries whose card differs by 200 twips are two different cards.
 */
export function partSignature(
  doc: CanvasAccess,
  sid: string,
  depth = 0
): string {
  if (depth > 24) return '…';
  const node = doc.getNode(sid);
  if (!node) return '';

  const attrs = { ...((node.attributes ?? {}) as Record<string, unknown>) };
  /**
   * And what an **arrangement** decided is not what the node says either.
   *
   * A part told to fill its container is given a box by `fillChildren` (or by `layoutChildren`
   * inside a frame), so its numbers are a consequence of the container's size rather than
   * something anybody chose — two libraries could hold the same card and disagree about them.
   */
  if (attrs.layoutStretch === true) {
    delete attrs.x;
    delete attrs.y;
    delete attrs.width;
    delete attrs.height;
  }
  // How this deck refers to the part, not something the part says.
  delete attrs.partId;
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
 * A counter on the definition would have to be *maintained*: a write on the definition every time
 * it changed, which is derived state in the document and the fault this repository keeps finding.
 * A signature needs no maintenance — it is computed when somebody asks — so an imported card is
 * compared with its library without either deck having written anything.
 */
export function componentSignature(doc: CanvasAccess, definition: ComponentDef | undefined): string {
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
 * Bringing a definition in **from another deck**, and telling later that it has moved on.
 *
 * ## Why a copy and not a reference
 *
 * A definition in another document is **not in this document**, and no resolver reaches into a file
 * the reader has not opened. So it is **copied** — and what makes it a library rather than a paste is
 * that the copy remembers where it came from and can be brought in again. Which is the relationship
 * Figma has across files, and for the same reason: it cannot be live there either, so updates are
 * offered and accepted. Within a deck a placement follows its definition live (§10b-2a); this is the
 * one place left where anything can fall behind anything.
 *
 * ## What a copy remembers
 *
 * The deck (a library name or an address, resolved by the host), the definition's id **there**, and
 * what it said at that moment. The last one is a signature rather than a version: a number would
 * have to be maintained by a write on every edit of the source deck, and a signature is maintained
 * by nobody.
 */
export interface ImportPlan {
  /** The definition to add here, ready for a transaction. */
  node: CanvasNode;
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
  host: CanvasAccess,
  source: CanvasAccess,
  id: string,
  /** What the source deck is called, as this deck will remember it. */
  fromDeck: string
): ImportPlan | undefined {
  const definition = componentsOf(source).find((one) => one.id === id);
  if (!definition) return undefined;

  const copy = copyOf(source, definition.sid);
  if (!copy) return undefined;

  const here = componentsOf(host);
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
function doc(access: CanvasAccess, sid: string): Record<string, any> | undefined {
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
  doc: CanvasAccess,
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
 * The **only** "has it moved on" question left in the product, and it exists because it has to: a
 * placement follows its definition live, but a definition in another document cannot be followed at
 * all — it is not in this file. So a brand kit's card is a copy, and this offers the newer one.
 *
 * The honest answer when there is nothing to compare: a copy with no recorded signature is not
 * behind, it is a copy from before this was written, and calling every one of them behind would put
 * a badge on every deck.
 *
 * `source` is the other deck, which the caller has to have in hand: this file cannot fetch, and the
 * host is what knows whether a name is in a library or an address to get (§11i).
 */
export function componentBehindSource(
  host: CanvasAccess,
  definition: ComponentDef | undefined,
  source: CanvasAccess | undefined
): boolean {
  const from = componentSourceOf(host, definition);
  if (!from?.signature || !source) return false;
  const there = componentsOf(source).find((one) => one.id === from.id);
  if (!there) return false;
  return componentSignature(source, there) !== from.signature;
}

/**
 * Every name a binding in this card can resolve, and what it is worth here.
 *
 * Two sources, and the order is the decision: the **card** first, then the **document**.
 *
 * - A card's own declaration wins, because it is the more specific one and because of what the
 *   other order would do: importing a card into a deck that happens to have a variable of the same
 *   name would quietly change what the card means, and a brand kit whose cards changed meaning per
 *   deck is not a brand kit.
 * - The document's variables are then in scope, so a card can be built *against the document* — a
 *   badge that takes the deck's accent, a footer that takes the company name — without declaring
 *   the same thing again per card and answering it again per placement.
 *
 * A card's **default** may itself be a reference (`value: 'var:강조'`), which is how a card says
 * "mine, unless the document says otherwise" — the theme's composition (§10b-10) one layer along.
 */
export function instanceValues(
  doc: CanvasAccess,
  instance: CanvasNode | undefined,
  definition: ComponentDef | undefined
): Map<string, string> {
  const said = new Map<string, string>();

  /*
   * Three scopes, widest first, so the narrower ones overwrite: the **document**, then the **page
   * this placement is on**, then the card's own declarations and this placement's answers.
   *
   * The page is in the chain because that is what a page's variables are for — "every card is our
   * accent, except on the summary page" — and it is *this* placement's page rather than the card's,
   * because a card is not on a page at all: a definition is not a slide.
   */
  for (const one of documentVars(doc)) said.set(one.name, one.value);
  for (const one of surfaceVars(doc, surfaceOf(doc, instance?.sid))) said.set(one.name, one.value);

  for (const one of instanceVars(doc, instance, definition)) {
    /*
     * A reference where a value goes, resolved here rather than at the binding: a placement may
     * answer a card's question with a variable too, so both halves — the card's default and the
     * placement's answer — arrive as one string that may name something. Resolved in the
     * placement's scope, so a page's declaration reaches a card that names it.
     */
    said.set(
      one.name,
      isVarRef(one.value) ? (resolveVarValue(doc, one.value, instance?.sid) ?? '') : one.value
    );
  }
  return said;
}

/**
 * The same values, **read the way the card says they read**.
 *
 * A separate step and applied *last*, which is the whole of what went wrong the first time: a data
 * list replaces a placement's answers with the row's own after they are resolved, so formatting
 * inside `instanceValues` reached every card except the ones that had data in them — which are
 * exactly the cards a format exists for.
 *
 * Safe to run over an already-formatted string, and that is worth knowing rather than avoiding: a
 * value that no longer parses as a number or a date comes back unchanged, so a second pass is a
 * no-op rather than `월 월 7,900원`.
 */
export function readValues(
  values: Map<string, string>,
  vars: readonly ComponentVar[]
): Map<string, string> {
  const out = new Map(values);
  for (const one of vars) {
    if (!one.format) continue;
    const held = out.get(one.name);
    if (held === undefined) continue;
    out.set(one.name, readValue(held, one.kind, one.format));
  }
  return out;
}

/** The name a part gives its slot, when it is one. */
export function slotNameOf(doc: CanvasAccess, sid: string): string | undefined {
  const name = doc.getNode(sid)?.attributes?.slot;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

/**
 * Whether a reader may resize a **placement** — and the honest answer is "only if the card says
 * what that would mean".
 *
 * Measured in the browser, before it was asked: dragging a placement's corner wrote a box of
 * 8280×6440 onto a card whose parts stayed exactly 5040×3960. The outline grew, the card did not
 * change, and nothing said so. A part told to fill the card (`layoutStretch`) is what gives the
 * gesture an answer — the part takes the new box, and a frame among them arranges its own children
 * against it — so the handles appear exactly where there is one.
 *
 * Asked of the **definition**, because that is where the parts are now. A placement holds nothing,
 * so the old form of this question — "does this placement have a filling child" — cannot be asked
 * of the document any more.
 */
export function instanceResizable(doc: CanvasAccess, instance: CanvasNode | undefined): boolean {
  const definition = definitionOf(doc, instance);
  if (!definition) return false;
  return definition.parts.some((part) => doc.getNode(part)?.attributes?.layoutStretch === true);
}

/** The definition a placement names, or nothing — the lookup every placement question starts with. */
export function definitionOf(doc: CanvasAccess, instance: CanvasNode | undefined): ComponentDef | undefined {
  const id = instance?.attributes?.componentId;
  if (typeof id !== 'string' || !id) return undefined;
  return componentsOf(doc).find((one) => one.id === id);
}
