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
