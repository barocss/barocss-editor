import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * splitTextNode operation (runtime)
 *
 * 목적
 * - 텍스트 노드를 지정 위치에서 둘로 분할한다. DataStore.splitMerge.splitTextNode 사용.
 *
 * 입력 형태(DSL)
 * - splitTextNode(nodeId, splitPosition)
 * - control(nodeId, [ splitTextNode(splitPosition) ]) → payload: { splitPosition }
 */

defineOperation('splitTextNode', async (operation: any, context: TransactionContext) => {
  const { nodeId, splitPosition, newNodeId: wantedId } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (typeof node.text !== 'string') throw new Error(`Node ${nodeId} is not a text node`);
  /**
   * `wantedId` is how a merge asks for its own node back.
   *
   * Splitting for a reader mints a new id, which is right. Splitting to *undo a
   * merge* has to give the half the id the merge consumed, or every inverse
   * collected before that merge — a reordering, a removal, a move — is left
   * naming a node that no longer exists.
   */
  const newNodeId = context.dataStore.splitMerge.splitTextNode(nodeId, splitPosition, wantedId);
  return {
    ok: true,
    data: newNodeId,
    inverse: { type: 'mergeTextNodes', payload: { leftNodeId: nodeId, rightNodeId: newNodeId } }
  };
});



