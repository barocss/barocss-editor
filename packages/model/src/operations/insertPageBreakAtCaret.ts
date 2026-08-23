import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { resolveCaret, splitBlockAtCaret } from './split-at-caret';

/**
 * A page break where the caret is, with the rest of the text moved onto the new
 * page and the caret moved with it.
 *
 * ## What Ctrl+Enter means
 *
 * The same thing Enter means, plus a page: split here, and start what follows
 * somewhere new. A reader who presses it in the middle of a sentence expects the
 * second half to begin the next page with the caret in front of it, ready to
 * carry on — which is what every word processor does and what makes the shortcut
 * worth having rather than a menu item.
 *
 * The shared kit's `insertPageBreak` puts the break *after the whole block* and
 * leaves the caret where it was. Measured, that put the caret on the break node
 * itself: the paragraph was not divided, nothing moved to the new page, and the
 * next keystroke had nowhere sensible to go. It is a reasonable operation for a
 * product with no pages — the break is a marker in the flow — and wrong for one
 * whose whole layout is pages, which is why Word registers its own.
 *
 * ## Why one operation rather than two
 *
 * Splitting and inserting have to be one thing to undo. They also have to happen
 * in order: the index the break goes at is only known *after* the split has made
 * the second half, so a static list of two operations cannot express it — the
 * second one would need a value the first one produces.
 */
export interface InsertPageBreakAtCaretPayload {
  /** The node type to insert. Word's is `pageBreak`; a column break is the same shape. */
  stype?: string;
}

defineOperation(
  'insertPageBreakAtCaret',
  async (
    operation: { type: string; payload: InsertPageBreakAtCaretPayload },
    context: TransactionContext
  ) => {
    const stype = operation.payload?.stype ?? 'pageBreak';
    const dataStore = context.dataStore;

    const where = resolveCaret(dataStore, context.schema, context.selection.current);
    if (!where) {
      throw new Error('insertPageBreakAtCaret: the selection does not resolve to a text position');
    }

    const block = dataStore.getNode(where.block.sid) as {
      sid: string;
      stype: string;
      parentId?: string;
      attributes?: Record<string, unknown>;
    };
    if (!block) throw new Error('insertPageBreakAtCaret: block disappeared before the split');

    const parentId = block.parentId ? dataStore.resolveAlias(block.parentId) : undefined;
    if (!parentId || !Array.isArray(dataStore.getNode(parentId)?.content)) {
      throw new Error('insertPageBreakAtCaret: the block has no parent to break in');
    }

    const cut = splitBlockAtCaret(dataStore, where, 'insertPageBreakAtCaret');

    /**
     * Read the parent *after* the split, not before.
     *
     * A node read from the store is a snapshot: the copy taken before the split
     * still lists the children the block's parent had then, so the block the
     * split just made is not in it. Measured as "the new block is not in its
     * parent" from an operation that had only just put it there.
     */
    const parent = dataStore.getNode(parentId) as { sid?: string; content: string[] };
    if (!parent || !Array.isArray(parent.content)) {
      throw new Error('insertPageBreakAtCaret: the parent disappeared during the split');
    }

    /**
     * Where the break goes, and what the caret follows it into.
     *
     * Three positions, and they are the three the reader can be in:
     *
     * - **Inside the text.** The split has made a second block holding what came
     *   after the caret; the break goes between them and the caret goes to the
     *   start of that second block — which is now the top of the new page.
     * - **At the end.** There is nothing to move, so the new page needs
     *   somewhere to type: an empty block of the same kind, after the break.
     * - **At the start.** The whole block moves to the new page, so the break
     *   goes *before* it and the caret stays exactly where it is — in the text
     *   the reader was in, which is now at the top of the page.
     */
    if (cut.at === 'inside') {
      const index = parent.content.indexOf(cut.newBlockId);
      if (index === -1) throw new Error('insertPageBreakAtCaret: the new block is not in its parent');

      const breakId = dataStore.content.addChild(parent.sid!, { stype } as never, index);
      if (!cut.firstTextNodeId) {
        throw new Error('insertPageBreakAtCaret: the split produced no text node to put the caret in');
      }

      return {
        ok: true,
        data: dataStore.getNode(breakId),
        /**
         * Undone in one press, and in the order that leaves the document as it
         * was: take the break out, then rejoin the two halves. `tidySeam` says
         * whether the split cut a run in two — rejoining a seam that was never
         * cut merges runs the document always had apart.
         */
        inverse: {
          type: 'batch',
          payload: {
            operations: [
              { type: 'removeChild', payload: { parentId: parent.sid, childId: breakId } },
              {
                type: 'mergeBlockNodes',
                payload: {
                  leftNodeId: where.block.sid,
                  rightNodeId: cut.newBlockId,
                  tidySeam: cut.cutSomething
                }
              }
            ]
          }
        },
        selectionAfter: { nodeId: cut.firstTextNodeId, offset: 0 }
      };
    }

    const at = parent.content.indexOf(where.block.sid);
    if (at === -1) throw new Error('insertPageBreakAtCaret: the block is not in its parent');

    if (cut.at === 'start') {
      const breakId = dataStore.content.addChild(parent.sid!, { stype } as never, at);
      return {
        ok: true,
        data: dataStore.getNode(breakId),
        inverse: { type: 'removeChild', payload: { parentId: parent.sid, childId: breakId } },
        // The reader is still in the text they were in; it is the page under it
        // that changed.
        selectionAfter: { nodeId: where.textNodeId, offset: 0 }
      };
    }

    const breakId = dataStore.content.addChild(parent.sid!, { stype } as never, at + 1);
    const blockId = dataStore.content.addChild(
      parent.sid!,
      {
        stype: block.stype,
        attributes: { ...(block.attributes ?? {}) },
        content: [] as string[]
      } as never,
      at + 2
    );
    const textId = dataStore.content.addChild(
      blockId,
      { stype: 'inline-text', text: '' } as never,
      0
    );

    return {
      ok: true,
      data: dataStore.getNode(breakId),
      inverse: {
        type: 'batch',
        payload: {
          operations: [
            { type: 'removeChild', payload: { parentId: parent.sid, childId: blockId } },
            { type: 'removeChild', payload: { parentId: parent.sid, childId: breakId } }
          ]
        }
      },
      selectionAfter: { nodeId: textId, offset: 0 }
    };
  }
);
