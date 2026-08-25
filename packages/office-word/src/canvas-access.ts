/**
 * The little of a document a **canvas** reader needs, and the two walks every one of them does.
 *
 * ## Why this is not `document-access.ts`
 *
 * That file is the text stack's access: its `childrenOf` returns *nodes*, because a style resolver
 * asks "what is in this paragraph". A canvas reader works in **sids** — a placement names a
 * definition by id, a binding names a part by name, a connector remembers an end by sid — so
 * `childrenOf` here answers sids, and a node's `content` is `unknown` because a loaded document
 * holds sids while a plain fixture tree holds objects.
 *
 * Two shapes for one idea would be worth arguing about if either were a *decision*. They are two
 * answers to two different questions, and naming both is cheaper than one function whose callers
 * have to remember which it returns.
 *
 * ## Why it is shared
 *
 * `docs/SHARED-LAYER.md`'s test: can it be said without naming a product? A node's children, and a
 * copy that carries no identity — neither sentence mentions a slide or a page, and two products
 * disagreeing about the second one in particular is one of them being wrong (a copy that kept its
 * original's sid gives two nodes one identity, and every mapping from a DOM position back to the
 * model resolves through that).
 */

/** The little of a document this needs, so a caller can pass anything. */
export interface CanvasAccess {
  getNode: (sid: string) => CanvasNode | undefined;
  rootId: string;
}

export interface CanvasNode {
  sid?: string;
  stype?: string;
  attributes?: Record<string, unknown>;
  /**
   * The characters, for the one node type that is text rather than a box.
   *
   * Declared because it is *read*: a shape is labelled by its first words, and a bound part's value
   * is written into a run. Code reaching for it through `(node as { text?: unknown }).text` is the
   * type denying something every fixture writes.
   */
  text?: string;
  /** Child sids, which is how a loaded document holds its children. */
  content?: unknown;
}

/**
 * A node's children, as sids.
 *
 * Exported because it was written **seven times** in one package — deck, deck file, layout format,
 * motion, text units, theme, timeline — with two spellings of the same filter. Nothing had gone
 * wrong yet, and that is the point: seven copies of a predicate is seven chances for one of them to
 * decide differently about a `content` that holds something which is not a sid.
 */
export const childrenOf = (node: CanvasNode | undefined): string[] =>
  Array.isArray(node?.content)
    ? (node!.content as unknown[]).filter((child): child is string => typeof child === 'string')
    : [];

/**
 * A subtree, copied as a plain tree with no identity.
 *
 * Sids are deliberately dropped. A sid is `session:counter` and belongs to one node; a copy is a
 * different node, and carrying the original's sid across would give two nodes one identity — which
 * every mapping from a DOM position back to the model, and every reference by id, resolves through.
 *
 * Depth-limited for the same reason a text walk is: this reads an author's document, and a
 * malformed one must not take the editor down with it.
 */
export function copyOf(doc: CanvasAccess, sid: string, depth = 0): CanvasNode | undefined {
  if (depth > 32) return undefined;
  const node = doc.getNode(sid);
  if (!node) return undefined;

  const copy: CanvasNode & { text?: string } = {
    stype: node.stype,
    attributes: { ...(node.attributes ?? {}) }
  };

  const text = (node as { text?: unknown }).text;
  if (typeof text === 'string') copy.text = text;

  const children = childrenOf(node)
    .map((child) => copyOf(doc, child, depth + 1))
    .filter((child): child is CanvasNode => child !== undefined);
  if (children.length > 0) copy.content = children;

  return copy;
}

/**
 * Whether this node's children carry **coordinates** — whether it is a canvas.
 *
 * The one question the insert and the selection both have to ask, and the one place the two
 * products differ in their answer: a page's canvas is a `canvasBlock` in the flow, a deck's is the
 * `surface` itself. Said without naming either — *a container whose children are placed rather than
 * flowed* — and a `surface` qualifies only when it is not a **flow**, which is what a section is.
 *
 * `slideAt` in `office-slides` is the deck's own walk and stays there: it means "the page this is
 * on", which is a different sentence that happens to have the same answer on a slide.
 */
export function isCanvasContainer(node: CanvasNode | undefined): boolean {
  if (node?.stype === 'canvasBlock') return true;
  return node?.stype === 'surface' && node.attributes?.kind !== 'flow';
}

/**
 * The canvas a node is on, or nothing when it is not on one.
 *
 * Walks by `parentId`, depth-limited like every other walk that reads an author's document. A
 * canvas *inside* a canvas answers with the nearest one, which is what a reader means by "here".
 */
export function canvasAt(doc: CanvasAccess, sid: string | undefined): string | undefined {
  let at = sid;
  for (let depth = 0; at && depth < 32; depth += 1) {
    const node = doc.getNode(at);
    if (!node) return undefined;
    if (isCanvasContainer(node)) return at;
    at = (node as { parentId?: string }).parentId;
  }
  return undefined;
}
