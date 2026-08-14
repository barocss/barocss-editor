/**
 * Cutting a block where the caret is.
 *
 * Two operations need this and had a copy each: `insertParagraph` for Enter in
 * running text, `splitListItem` for Enter in a bullet. Both copies decided
 * whether to split with the same test —
 *
 *     block.content.length === 1 && block.content[0] === textNodeId
 *
 * — and both were wrong, in different ways, for the whole life of the project.
 * In a paragraph the test is false whenever formatting has divided the text
 * into more than one run, which is most of a real document, so Enter put an
 * empty paragraph *above* instead of splitting. In a list item it is false
 * always: an item's children are blocks, so `content[0]` is the paragraph's sid
 * and can never equal a text node's, and Enter never split a bullet at all.
 *
 * Neither was caught, because the tests either counted blocks or read only the
 * text that happened to be in the fixture — one run per paragraph, every time.
 *
 * So the cut lives here now, once, and says which of three things it did:
 *
 *   inside — the block was divided, and there is a new block holding the tail
 *   start  — the caret was before everything; nothing was cut
 *   end    — the caret was after everything; nothing was cut
 *
 * What the caller does at the two edges is its own business: running text opens
 * a blank paragraph there, a list opens a blank bullet.
 */

export type CaretPosition = {
  textNodeId: string;
  /** Offset within the text node, already clamped to its length. */
  offset: number;
  textLength: number;
  /** The nearest block ancestor — not the run's immediate parent. */
  block: { sid: string; content: string[] };
};

export type CaretSplit =
  | { at: 'inside'; newBlockId: string; firstTextNodeId: string | null }
  | { at: 'start' }
  | { at: 'end' };

/**
 * The block a run belongs to, however deeply it is wrapped.
 *
 * A run is usually a direct child of its block, which made "the run's parent"
 * and "the block" the same node and the difference invisible. A link wraps its
 * text; inside one the parent is the link, and splitting it split the link and
 * left the paragraph whole — Enter appeared to do nothing at all.
 */
export function findBlockAncestor(dataStore: any, schema: any, nodeId: string): any {
  const seen = new Set<string>();
  let current = dataStore.getParent(nodeId);
  while (current && !seen.has(current.sid)) {
    seen.add(current.sid);
    const group = schema?.getNodeType((current as { stype?: string }).stype)?.group;
    // With no schema to ask, the first parent is the best answer available,
    // which is what every caller assumed before.
    if (!schema || group === 'block' || group === 'document') return current;
    current = dataStore.getParent(current.sid);
  }
  return current ?? dataStore.getParent(nodeId);
}

/**
 * Resolve a caret to a text node, an offset in it, and the block holding it.
 *
 * A caret on a block rather than in text is read as the end of that block's
 * last run, which is where a reader would understand it to be.
 */
export function resolveCaret(
  dataStore: any,
  schema: any,
  selection: { type: string; startNodeId: string; startOffset?: number } | null
): CaretPosition | null {
  if (!selection || selection.type !== 'range') return null;
  const node = dataStore.getNode(selection.startNodeId);
  if (!node) return null;

  if (typeof (node as { text?: string }).text === 'string') {
    const text = (node as { text: string }).text;
    const offset =
      typeof selection.startOffset === 'number' && selection.startOffset >= 0
        ? Math.min(selection.startOffset, text.length)
        : 0;
    const block = findBlockAncestor(dataStore, schema, selection.startNodeId);
    if (!block || !Array.isArray(block.content)) return null;
    return { textNodeId: selection.startNodeId, offset, textLength: text.length, block };
  }

  const group = schema?.getNodeType((node as { stype?: string }).stype)?.group;
  if (group !== 'block') return null;
  const last = lastTextNodeIn(dataStore, (node as { sid: string }).sid);
  if (!last) return null;
  return {
    textNodeId: last.sid,
    offset: last.text.length,
    textLength: last.text.length,
    block: node as { sid: string; content: string[] }
  };
}

export function lastTextNodeIn(dataStore: any, blockId: string): { sid: string; text: string } | null {
  const block = dataStore.getNode(blockId);
  const content = (block as { content?: string[] })?.content;
  if (!Array.isArray(content)) return null;
  let last: { sid: string; text: string } | null = null;
  const visit = (id: string): void => {
    const node = dataStore.getNode(id);
    if (!node) return;
    if (typeof (node as { text?: string }).text === 'string') {
      last = { sid: (node as { sid: string }).sid, text: (node as { text: string }).text };
      return;
    }
    const children = (node as { content?: string[] }).content;
    if (Array.isArray(children)) for (const child of children) visit(child);
  };
  for (const id of content) visit(id);
  return last;
}

/**
 * Cut the block at the caret, and report what happened.
 *
 * The caret is somewhere inside a run and the run may be wrapped, so the
 * position is carried upwards: cut the run if the caret is inside it, then cut
 * each wrapper so that everything from the caret onwards ends up in a new
 * sibling, until what is left is an index into the block's own children. A
 * wrapper with nothing before the caret is not cut — the whole of it belongs to
 * the tail — and likewise for one with nothing after it.
 *
 * What decides a split is then only whether the block has children on both
 * sides of that index. Its two true edges are the only positions that are not
 * a split, and they are also the two positions the store refuses to split at,
 * which is the same fact said twice.
 */
export function splitBlockAtCaret(dataStore: any, where: CaretPosition, label: string): CaretSplit {
  const { textNodeId, textLength, block } = where;
  const offset = Math.max(0, Math.min(where.offset, textLength));

  if (offset > 0 && offset < textLength) dataStore.splitTextNode(textNodeId, offset);

  const holderOf = (id: string): { sid: string; content: string[] } => {
    const parent = dataStore.getParent(id);
    if (!parent || !Array.isArray(parent.content)) {
      throw new Error(`${label}: ran out of parents before reaching the block`);
    }
    return parent as { sid: string; content: string[] };
  };

  let carried = textNodeId;
  let holder = holderOf(carried);
  let tailIndex = holder.content.indexOf(carried) + (offset > 0 ? 1 : 0);

  while (holder.sid !== block.sid) {
    if (tailIndex > 0 && tailIndex < holder.content.length) {
      carried = dataStore.splitBlockNode(holder.sid, tailIndex);
      holder = holderOf(carried);
      tailIndex = holder.content.indexOf(carried);
    } else {
      // All of this wrapper is on one side of the caret: it moves whole.
      const wholeGoesToTail = tailIndex <= 0;
      carried = holder.sid;
      holder = holderOf(carried);
      tailIndex = holder.content.indexOf(carried) + (wholeGoesToTail ? 0 : 1);
    }
  }

  // Re-read: children have moved under us, and the copy resolved before the
  // cuts still describes the block as it was.
  const current = dataStore.getNode(block.sid) as { content: string[] };
  if (tailIndex <= 0) return { at: 'start' };
  if (tailIndex >= current.content.length) return { at: 'end' };

  const newBlockId = dataStore.splitBlockNode(block.sid, tailIndex);
  const newBlock = dataStore.getNode(newBlockId);
  const firstTextNodeId = lastFirstTextNodeIn(dataStore, newBlockId) ?? null;
  return {
    at: 'inside',
    newBlockId,
    firstTextNodeId: newBlock ? firstTextNodeId : null
  };
}

/** The first text node under a block, which is where a caret can sit. */
function lastFirstTextNodeIn(dataStore: any, blockId: string): string | null {
  const visit = (id: string): string | null => {
    const node = dataStore.getNode(id);
    if (!node) return null;
    if (typeof (node as { text?: string }).text === 'string') return (node as { sid: string }).sid;
    const children = (node as { content?: string[] }).content;
    if (Array.isArray(children)) {
      for (const child of children) {
        const found = visit(child);
        if (found) return found;
      }
    }
    return null;
  };
  const block = dataStore.getNode(blockId);
  const content = (block as { content?: string[] })?.content;
  if (!Array.isArray(content)) return null;
  for (const id of content) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}
