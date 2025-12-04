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
  const { nodeId, splitPosition } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (typeof node.text !== 'string') throw new Error(`Node ${nodeId} is not a text node`);
  const newNodeId = context.dataStore.splitMerge.splitTextNode(nodeId, splitPosition);
  return {
    ok: true,
    data: newNodeId,
    inverse: { type: 'mergeTextNodes', payload: { leftNodeId: nodeId, rightNodeId: newNodeId } }
  };
});



