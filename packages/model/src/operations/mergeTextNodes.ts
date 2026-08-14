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



