import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { lastTextNodeIn, joinAtSeam } from './split-at-caret';

/**
 * mergeBlockNodes operation (runtime)
 *
 * 목적
 * - 동일 타입의 인접 블록 노드 두 개를 병합한다. DataStore.splitMerge.mergeBlockNodes 사용.
 *
 * 입력 형태(DSL)
 * - mergeBlockNodes(leftNodeId, rightNodeId)
 * - control(leftNodeId, [ mergeBlockNodes(rightNodeId) ]) → payload: { rightNodeId } (left는 control이 주입)
 */

defineOperation('mergeBlockNodes', async (operation: any, context: TransactionContext) => {
  const { leftNodeId, rightNodeId, tidySeam = false } = operation.payload;

  const left = context.dataStore.getNode(leftNodeId);
  const right = context.dataStore.getNode(rightNodeId);
  // Kept for the inverse: a merge takes the left block's formatting, so the
  // right block's own is gone once they are one, and undo has to put it back.
  const rightAttributes = right ? { ...((right as any).attributes ?? {}) } : undefined;
  if (!left) throw new Error(`Node not found: ${leftNodeId}`);
  if (!right) throw new Error(`Node not found: ${rightNodeId}`);
  if (left.stype !== right.stype) throw new Error(`Cannot merge different node types: ${left.stype} and ${right.stype}`);

  /**
   * And they have to be next to each other, for the reason `mergeTextNodes` does.
   *
   * The store folds the right block's children into the left and takes the
   * right out of the parent — so blocks that are not adjacent leave whatever
   * sat between them stranded on the wrong side of the join, and a block that
   * is not in that parent has nothing taken out while its own removal's inverse
   * still plans to put it back. Undo does both and the document keeps it twice.
   */
  const parentId = (left as any).parentId ? context.dataStore.resolveAlias((left as any).parentId) : undefined;
  const parent = parentId ? context.dataStore.getNode(parentId) : undefined;
  const siblings = Array.isArray((parent as any)?.content) ? ((parent as any).content as string[]) : [];
  const leftAt = siblings.indexOf(leftNodeId);
  // Only when the parent can be found — see `mergeTextNodes`.
  if (parent && (leftAt < 0 || siblings.indexOf(rightNodeId) !== leftAt + 1)) {
    return {
      ok: false,
      error:
        `mergeBlockNodes: ${leftNodeId} and ${rightNodeId} are not next to each other in ` +
        `${parentId ?? '(no parent)'}`
    };
  }

  const leftChildrenCount = Array.isArray((left as any).content) ? (left as any).content.length : 0;
  /**
   * The seam, captured before the merge: afterwards the two blocks are one and
   * the boundary between them is no longer visible in the model.
   *
   * The *last text* under the left block, not its last child. A block can end
   * in something a caret cannot sit in — a link wrapping its text, a picture —
   * and taking the last child then found a node with no text, set no caret at
   * all, and left the reader with none. Measured: joining onto a paragraph
   * ending in a hyperlink merged the text correctly and lost the caret.
   */
  const seam = lastTextNodeIn(context.dataStore, leftNodeId);

  const mergedNodeId = context.dataStore.splitMerge.mergeBlockNodes(leftNodeId, rightNodeId);


  /**
   * Rejoining the run the seam runs through, but only when asked.
   *
   * A split cuts a run in two and this puts the blocks back together, so the
   * halves stay as two runs saying what one run used to say: undo of Enter
   * returned 'two' as 't' and 'wo', and every edit-and-undo fragmented the
   * paragraph a little further.
   *
   * Doing it unasked was tried and it breaks this operation's own inverse,
   * which counts children to know where to split back — joining two of them
   * moves that boundary and the undo cuts in the wrong place. So the caller
   * asks: `insertParagraph` and `splitListItem` know they cut a run, because
   * they did it, and they say so when they name this as their inverse. A reader
   * pressing Backspace to join two paragraphs does not, and there the seam is
   * left alone and the inverse stays exact.
   *
   * Only runs carrying the same attributes are joined. Marks name a range of
   * characters and are carried across a join, so two runs differing only in
   * their marks still read the same afterwards; attributes belong to the node
   * and one of them would have to be dropped.
   */
  if (tidySeam) joinAtSeam(context.dataStore, mergedNodeId, leftChildrenCount);

  // Where the caret goes: the end of the text the left block already had, which
  // is where the right block's content now starts.
  //
  // The caret does not dangle without this — the text node it was in survives,
  // it just moves — which is why the symptom was so confusing. It stays at
  // offset 0 of the moved content, so the next Backspace is again "at the start
  // of a node", tries the same boundary case, and finds nothing left to merge.
  // Holding the key deleted one block and then appeared to stop.
  if (seam) {
    context.selection.setCaret(seam.sid, seam.text.length);
  }

  return {
    ok: true,
    data: mergedNodeId,
    /**
     * Splitting back at the child index recorded before the merge — exact, and
     * only exact while the seam was left alone. Having tidied it, the boundary
     * has moved and there is no single operation that undoes both; the caller
     * that asked for the tidy is itself an undo, and redo replays the original
     * operation rather than inverting this one.
     */
    ...(tidySeam
      ? {}
      : {
          inverse: {
            type: 'splitBlockNode',
            payload: {
              nodeId: mergedNodeId,
              splitPosition: leftChildrenCount,
              newNodeAttributes: rightAttributes,
              // And the id this merge consumed, so that an inverse collected
              // before it can still find the block it names.
              newNodeId: rightNodeId
            }
          }
        })
  };
});



