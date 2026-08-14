import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';
import { lastTextNodeIn, joinAtSeam } from './split-at-caret';

/**
 * Joining one list item onto the one before it.
 *
 * Two reasons this exists. The first is Backspace at the start of a bullet,
 * which every editor answers by folding that bullet into the one above.
 *
 * The second is that `splitListItem` had no inverse, so Ctrl+Z after pressing
 * Enter in a list did nothing at all. Putting a split item back is three steps
 * — carry the blocks home, rejoin the block the split cut, drop the empty item
 * — and an operation may name only one inverse. So the three steps are one
 * operation, and that operation is the inverse.
 *
 * payload
 * - leftNodeId: the item that stays
 * - rightNodeId: the item folded into it, which is then gone
 */

export interface MergeListItemsPayload {
  leftNodeId: string;
  rightNodeId: string;
  /** Whether the split being undone actually cut a run. See `joinAtSeam`. */
  tidySeam?: boolean;
}

export const mergeListItems = defineOperationDSL(
  (leftNodeId: string, rightNodeId: string) => ({
    type: 'mergeListItems',
    payload: { leftNodeId, rightNodeId }
  }),
  { atom: false, category: 'content' }
);

defineOperation('mergeListItems', async (operation: { payload: MergeListItemsPayload }, context: TransactionContext) => {
  const { leftNodeId, rightNodeId, tidySeam = true } = operation.payload;
  const dataStore = context.dataStore;

  const left = dataStore.getNode(leftNodeId);
  const right = dataStore.getNode(rightNodeId);
  if (!left) throw new Error(`mergeListItems: node not found: ${leftNodeId}`);
  if (!right) throw new Error(`mergeListItems: node not found: ${rightNodeId}`);
  if (left.stype !== 'listItem' || right.stype !== 'listItem') {
    throw new Error(
      `mergeListItems: both must be list items, got ${left.stype} and ${right.stype}`
    );
  }

  const leftBlocks = ((left as { content?: string[] }).content ?? []).slice();
  const rightBlocks = ((right as { content?: string[] }).content ?? []).slice();

  /**
   * The seam, and how many blocks were on each side, read before anything
   * moves — afterwards the two items are one and the boundary is gone. The
   * caret goes where the join is, which is what the reader is looking at.
   */
  const lastLeftBlockId = leftBlocks[leftBlocks.length - 1];
  const firstRightBlockId = rightBlocks[0];
  const seam = lastLeftBlockId ? lastTextNodeIn(dataStore, lastLeftBlockId) : null;
  const leftBlockCount = leftBlocks.length;

  // Carry the blocks over, in order, after the ones already there.
  rightBlocks.forEach((blockId, index) => {
    dataStore.content.moveNode(blockId, leftNodeId, leftBlockCount + index);
  });

  /**
   * Rejoin the block the split cut in two.
   *
   * Only when both sides are the same kind of block: a bullet holding a
   * paragraph and one holding a code block are two blocks that happen to be
   * adjacent, not one block in two pieces.
   */
  let joinedBlocks = false;
  if (lastLeftBlockId && firstRightBlockId) {
    const leftBlock = dataStore.getNode(lastLeftBlockId);
    const rightBlock = dataStore.getNode(firstRightBlockId);
    if (leftBlock && rightBlock && leftBlock.stype === rightBlock.stype) {
      const leftChildCount = ((leftBlock as { content?: string[] }).content ?? []).length;
      dataStore.splitMerge.mergeBlockNodes(lastLeftBlockId, firstRightBlockId);
      joinedBlocks = true;

      // And rejoin whatever the split cut inside it — the run, and any wrapper
      // the caret was inside when it was cut. Only when something *was* cut: a
      // split on a boundary between two runs divided nothing, and joining there
      // would merge two runs the document always had apart.
      if (tidySeam) joinAtSeam(dataStore, lastLeftBlockId, leftChildCount);
    }
  }

  // The emptied item goes; a list of items must not keep one with nothing in it.
  const list = right.parentId ? dataStore.getNode(dataStore.resolveAlias(right.parentId)) : null;
  const indexInList = list && Array.isArray(list.content) ? list.content.indexOf(rightNodeId) : -1;
  if (list && indexInList >= 0) {
    dataStore.removeChild(list.sid!, rightNodeId);
  }

  if (seam) context.selection.setCaret(seam.sid, seam.text.length);

  return {
    ok: true,
    data: leftNodeId,
    /**
     * Splitting it back apart is `splitListItem`'s own job, and it works from
     * the caret — which this operation has just put on the seam, the exact
     * place the two items were joined.
     */
    inverse: { type: 'splitListItem', payload: {} },
    ...(seam ? { selectionAfter: { nodeId: seam.sid, offset: seam.text.length } } : {}),
    meta: { joinedBlocks, restoredIndex: indexInList }
  };
});
