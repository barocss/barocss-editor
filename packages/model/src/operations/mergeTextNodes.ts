import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * mergeTextNodes operation (runtime)
 *
 * Purpose
 * - Merges two adjacent text nodes into one. Uses DataStore.splitMerge.mergeTextNodes.
 *
 * Input format (DSL)
 * - mergeTextNodes(leftNodeId, rightNodeId)
 * - control(leftNodeId, [ mergeTextNodes(rightNodeId) ])
 *   → payload: { leftNodeId?, rightNodeId }
 *   - In control form, builder injects leftNodeId.
 */

defineOperation('mergeTextNodes', async (operation: any, context: TransactionContext) => {
  const { leftNodeId, rightNodeId } = operation.payload;

  const left = context.dataStore.getNode(leftNodeId);
  const right = context.dataStore.getNode(rightNodeId);
  if (!left) throw new Error(`Node not found: ${leftNodeId}`);
  if (!right) throw new Error(`Node not found: ${rightNodeId}`);

  /**
   * Two runs that disagree about their attributes are not one run.
   *
   * Marks survive a join: they name a range of characters, so they shift and
   * both sides keep what they had. Attributes belong to the node, so a join has
   * to keep one side's and drop the other's — and doing that quietly is the
   * worst kind of loss, because the text still reads correctly while the
   * formatting is no longer what it was.
   *
   * There is no right side to pick, so this does not pick one. The datastore
   * primitive underneath stays permissive — a caller naming two nodes has
   * decided they are one — and refusing is policy, which lives here.
   */
  /**
   * Two runs are only one run if they are next to each other.
   *
   * The store joins the text and takes the right-hand node out of the parent's
   * children — so a node that is not in that parent has nothing taken out, and
   * a node that is not adjacent leaves whatever sat between them stranded on
   * the wrong side of the join.
   *
   * It merged an orphan happily: a run removed from its paragraph still exists,
   * and merging it copied its text in while the removal's own inverse still
   * planned to put it back. Undo did both, and the document ended with the run
   * twice.
   *
   * The sixth operation here found trusting a payload against the document. The
   * answer is the same one every time.
   */
  const parentId = (left as any).parentId ? context.dataStore.resolveAlias((left as any).parentId) : undefined;
  const parent = parentId ? context.dataStore.getNode(parentId) : undefined;
  const children = Array.isArray((parent as any)?.content) ? ((parent as any).content as string[]) : [];
  const leftAt = children.indexOf(leftNodeId);
  const rightAt = children.indexOf(rightNodeId);
  // Only when the parent can be found: a caller that has not linked the two
  // into one is not making the claim this is checking, and the store will
  // answer for itself.
  if (parent && (leftAt < 0 || rightAt !== leftAt + 1)) {
    return {
      ok: false,
      error:
        `mergeTextNodes: ${leftNodeId} and ${rightNodeId} are not next to each other in ` +
        `${parentId ?? '(no parent)'}`
    };
  }

  const attributesOf = (node: any) =>
    JSON.stringify(node?.attributes ?? {}, Object.keys(node?.attributes ?? {}).sort());
  if (attributesOf(left) !== attributesOf(right)) {
    throw new Error(
      `mergeTextNodes: ${leftNodeId} and ${rightNodeId} carry different attributes ` +
        `(${attributesOf(left)} vs ${attributesOf(right)}); joining them would drop one side's`
    );
  }
  
  // Nodes use stype field
  const leftType = left.stype;
  const rightType = right.stype;
  
  if (typeof left.text !== 'string') {
    throw new Error(`Left node is not a text node: ${leftType || 'unknown'}`);
  }
  if (typeof right.text !== 'string') {
    throw new Error(`Right node is not a text node: ${rightType || 'unknown'}`);
  }

  const leftTextLen = (left.text as string).length;
  const mergedNodeId = context.dataStore.splitMerge.mergeTextNodes(leftNodeId, rightNodeId);

  // The caret belongs at the junction. An operation that removes the node the
  // selection was standing in has to say where the selection goes, or it is left
  // pointing at something that no longer exists — after which the next keystroke
  // finds nothing to act on. The junction is where the right node's text now
  // begins, which is the same position the inverse splits at.
  context.selection.setCaret(mergedNodeId, leftTextLen);

  return {
    ok: true,
    data: mergedNodeId,
    /**
     * Split back, and give the half the id this merge consumed.
     *
     * Without it the split mints a new node, and every inverse collected before
     * this merge that names the consumed one — a reordering, a removal, a move —
     * is left pointing at a node that is not there: the undo either throws and
     * takes the rest of the chain with it, or quietly leaves the document in an
     * order it was never in.
     */
    inverse: {
      type: 'splitTextNode',
      payload: { nodeId: mergedNodeId, splitPosition: leftTextLen, newNodeId: rightNodeId }
    }
  };
});



