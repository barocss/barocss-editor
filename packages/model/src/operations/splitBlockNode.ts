import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * splitBlockNode operation (runtime)
 *
 * 목적
 * - 블록 노드를 지정한 인덱스에서 두 블록으로 분리한다. DataStore.splitMerge.splitBlockNode 사용.
 *
 * 입력 형태(DSL)
 * - splitBlockNode(nodeId, splitPosition)
 * - control(nodeId, [ splitBlockNode(splitPosition) ]) → payload: { splitPosition }
 */

defineOperation('splitBlockNode', async (operation: any, context: TransactionContext) => {
  const { nodeId, splitPosition } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!Array.isArray(node.content)) throw new Error('Node has no content to split');
  const newNodeId = context.dataStore.splitMerge.splitBlockNode(nodeId, splitPosition);
  const newBlock = context.dataStore.getNode(newNodeId);
  const firstTextNodeId =
    newBlock && Array.isArray(newBlock.content) && newBlock.content[0]
      ? (newBlock.content[0] as string)
      : null;
  context.lastCreatedBlock = { blockId: newNodeId, firstTextNodeId };
  const selectionTargetNodeId = firstTextNodeId ?? newNodeId;
  return {
    ok: true,
    data: newNodeId,
    inverse: { type: 'mergeBlockNodes', payload: { leftNodeId: nodeId, rightNodeId: newNodeId } },
    selectionAfter: { nodeId: selectionTargetNodeId, offset: 0 }
  };
});



