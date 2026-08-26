/**
 * The definitions a site holds, and what a **builder** needs to know about one.
 *
 * ## Why a site asks different questions than a deck
 *
 * `office-canvas` already answers what a definition *is* — `componentsOf` returns its id, its parts,
 * the questions it asks and how they are bound — because a placement has to be resolved from it. A
 * builder asks two more, and both are about the reader rather than about the drawing:
 *
 * - **How many places use this.** A definition used in five places is a decision; one used nowhere is
 *   a thing to delete. It is also the sentence that has to be said before a reader edits one: *this
 *   changes five pages.*
 * - **Which node to point a board at.** A `component` is a resource and has no renderer — a
 *   definition is never drawn where it is kept, only through a placement — so editing one means
 *   drawing its **part**, which is an ordinary frame and draws like any other.
 *
 * That second one is what makes a component editor cost almost nothing here: a board already takes a
 * `rootId` and draws whatever node it names. Editing a definition is pointing it at the part instead
 * of at a page.
 */
import { componentsOf, type CanvasAccess } from '@barocss/office-canvas';

type Node = Record<string, any>;
type Access = { rootId: string; getNode: (sid: string) => Node | undefined };

export interface Definition {
  /** The durable id a placement points at. */
  id: string;
  /** Where the definition is kept, for reading it out of this document. */
  sid: string;
  /** What a reader calls it. */
  name: string;
  /** The node a board draws when a reader edits this — see the header. */
  part?: string;
  /** How many placements name it, anywhere in the document. */
  uses: number;
  /** The questions it asks, which a placement answers. */
  asks: string[];
}

/** Every definition the document holds, with what a builder needs to say about each. */
export function definitionsOf(doc: Access): Definition[] {
  const used = usesOf(doc);
  return componentsOf(doc as CanvasAccess).map((one) => ({
    id: one.id,
    sid: one.sid,
    name: one.name || one.id,
    /*
     * The **first** part, and a definition with several is drawn by its first — which is the honest
     * limit rather than a hidden one. Every definition in this product's own sample has exactly one
     * top-level frame, because a reusable block is a block; the day one has two, a reader editing it
     * will see the first and this comment is where they will look.
     */
    part: one.parts[0],
    uses: used.get(one.id) ?? 0,
    asks: one.vars.map((v) => v.name)
  }));
}

/** One of them, by the id a placement names. */
export function definitionOf(doc: Access, id: unknown): Definition | undefined {
  return typeof id === 'string' ? definitionsOf(doc).find((one) => one.id === id) : undefined;
}

/**
 * Which of a definition's variables a part's **words** come from, if they come from one.
 *
 * ## The trap this exists to close
 *
 * A card of a product list holds a heading whose text is bound to `이름`. Typing in that heading
 * changes the definition's own words — the fallback nobody sees — and every placement goes on
 * drawing its row's value over the top. So a reader double-clicks the title of the product they are
 * looking at, types, and **nothing happens**: not an error, not a refusal, just a change that is
 * immediately overwritten by the data.
 *
 * Every tool that binds text has this and every one of them answers it the same way: the words are
 * not editable there, and the product says where they come from. The alternative — letting the caret
 * in — is a builder that quietly discards what a reader typed.
 *
 * Answered against the definition the node is **inside**, so a heading on a page is untouched by
 * this: it is nobody's part, and its words are its own.
 */
export function boundVarOf(
  /** Only `getNode` is needed — see below, and it is the reason this walks rather than asks. */
  doc: { getNode: (sid: string) => Node | undefined },
  sid: string | undefined
): string | undefined {
  const node = sid ? doc.getNode(sid) : undefined;
  const partId = node?.attributes?.partId;
  if (typeof partId !== 'string' || !partId) return undefined;

  /*
   * Walked here rather than through `definitionAt`, which answers with the definition **record** and
   * therefore needs the document's root to find it. This question needs no root: it is answered
   * entirely by the node's own ancestors, and asking for a root the caller may not have is how a
   * check comes back "no" for the wrong reason. Measured — the overlay holds `getNode` and nothing
   * else, so every bound part looked unbound and the caret went in.
   */
  let definition: Node | undefined;
  let at: string | undefined = sid;
  for (let hop = 0; at && hop < 64; hop += 1) {
    const one = doc.getNode(at);
    if (!one) break;
    if (one.stype === 'component') {
      definition = one;
      break;
    }
    at = one.parentId as string | undefined;
  }
  if (!definition) return undefined;

  for (const child of (definition.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const bind = doc.getNode(child);
    if (bind?.stype !== 'componentBind') continue;
    if (bind.attributes?.part === partId && bind.attributes?.attr === 'text') {
      const name = bind.attributes?.var;
      return typeof name === 'string' ? name : undefined;
    }
  }
  return undefined;
}

/**
 * How many placements name each definition, anywhere in the document.
 *
 * Counted by walking rather than kept as a number on the definition, for the reason every count in
 * this repository is counted: a number that is *stored* is a number that goes stale, and a reader
 * looking at "5곳" is asking a question about the document as it is now.
 *
 * Placements **inside definitions** count too — a card that holds a badge is a use of the badge —
 * which is what makes the count answer "what would I break".
 */
export function usesOf(doc: Access): Map<string, number> {
  const used = new Map<string, number>();

  const walk = (sid: string, depth = 0) => {
    if (depth > 64) return;
    const node = doc.getNode(sid);
    if (!node) return;
    if (node.stype === 'instance') {
      const id = String(node.attributes?.componentId ?? '');
      if (id) used.set(id, (used.get(id) ?? 0) + 1);
    }
    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') walk(child, depth + 1);
    }
  };
  walk(doc.rootId);

  return used;
}

/**
 * The definition a node belongs to, when it is being edited.
 *
 * A board pointed at a part draws nodes whose ancestor is a `component` rather than a `surface`, and
 * everything that asks "which page is this on" has to be able to get the other answer. Same walk,
 * different stop.
 */
export function definitionAt(doc: Access, sid: string | undefined): Definition | undefined {
  let at = sid;
  let depth = 0;
  while (at && depth++ < 64) {
    const node = doc.getNode(at);
    if (!node) return undefined;
    if (node.stype === 'component') return definitionOf(doc, node.attributes?.id);
    at = node.parentId as string | undefined;
  }
  return undefined;
}
