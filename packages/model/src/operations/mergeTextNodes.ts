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
    inverse: { type: 'splitTextNode', payload: { nodeId: mergedNodeId, splitPosition: leftTextLen } }
  };
});



