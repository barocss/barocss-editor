/**
 * **Where a new block goes**, asked of the schema rather than of a list.
 *
 * Two commands climbed from the caret to "the block a new sibling goes next to" and both wrote the
 * same four lines to decide where to stop: *has a parent that lists it, is not text, is not an
 * `inline-text`, and its parent is not a `paragraph` or a `heading`*. The last of those is a
 * hand-written list of what a block cannot go inside, and a hand-written list is a second place to
 * remember the schema.
 *
 * It was already wrong. `bTableCell` passes all four — its parent is a `bTableRow` — so the walk
 * stopped in the cell and asked the row to hold a frame. `bTableRow` is `'bTableCell*'`, so the
 * validator refused the transaction, `insertFrame` and every `insertShape` returned `false`, and the
 * ribbon button stayed lit the whole time. Measured 2026-09-06 in
 * `test/insert-inside-a-table-cell.test.ts`, which was red on both commands before this file existed.
 *
 * `office-site` met this exact fault twice — once from a table cell, once from a body whose content
 * expression named its types instead of the `block` group — and both times the answer was to ask the
 * schema. This is the second copy of that question in the repository; the first is
 * `office-site/selection.ts`. A product may not import a product, so it is copied rather than
 * shared, and where it belongs is a layer under both.
 */

/** The little of a store this file needs: the schema, and the nodes. */
export interface SchemaAccess {
  getActiveSchema?: () =>
    | { getNodeType?: (stype: string) => { content?: unknown; group?: unknown } | undefined }
    | undefined;
  getNode: (sid: string) => unknown;
}

/**
 * **Whether a node type is somewhere a block may go**, by the schema's own content expression.
 *
 * A name in a content expression is either a node type or a group, and only the schema knows which
 * — so `'block+'` admits a frame by its group and `'(heading | paragraph | list)+'` admits a heading
 * by its name. Both are checked; the cheap word test runs first and the per-name lookups only when
 * it has already said no.
 *
 * **When there is no schema to ask** the answer falls back to the two names the walk used to test by
 * hand. That is not the rule any more — it is what is left when nothing can be asked, which is the
 * case in unit tests that stand a store up by hand. Every real document has a schema, and there the
 * list is never reached: `paragraph` is `'inline*'`, so the schema refuses it on its own.
 */
export function holdsABlock(store: SchemaAccess, stype: unknown): boolean {
  const name = String(stype);
  const schema = store.getActiveSchema?.();
  const said = schema?.getNodeType?.(name)?.content;
  if (typeof said !== 'string') return name !== 'paragraph' && name !== 'heading';
  if (/\bblock\b/.test(said)) return true;

  for (const named of said.match(/[A-Za-z][A-Za-z0-9_-]*/g) ?? []) {
    if (schema?.getNodeType?.(named)?.group === 'block') return true;
  }
  return false;
}

/**
 * The block a new sibling goes next to, and the parent it is a child of.
 *
 * Up from whatever the selection names — a run, an inline node — until it reaches something whose
 * parent lists it **and may hold a block**. Written once and used by both inserts, because "here"
 * means the same thing to a frame and to a drawing, and two copies of one walk is one of them going
 * stale.
 */
export function blockAt(
  store: SchemaAccess | undefined,
  selection: unknown
): { sid: string; parentId: string; at: number } | null {
  const start = (selection as { startNodeId?: unknown } | null | undefined)?.startNodeId;
  if (!store || typeof start !== 'string') return null;

  let node: any = store.getNode(start);
  let depth = 0;
  while (node && depth++ < 64) {
    const parent: any = node.parentId ? store.getNode(node.parentId) : undefined;
    const at = parent?.content?.indexOf?.(node.sid) ?? -1;
    // A block is a node the *flow* holds. Stopping at "has a parent" would stop at an inline-text
    // inside a paragraph and insert the frame among the words, which is not a place a frame can be.
    if (
      parent &&
      at >= 0 &&
      typeof node.text !== 'string' &&
      node.stype !== 'inline-text' &&
      holdsABlock(store, parent.stype)
    ) {
      return { sid: String(node.sid), parentId: String(parent.sid), at };
    }
    node = parent;
  }
  return null;
}
