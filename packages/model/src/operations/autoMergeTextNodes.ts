import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * autoMergeTextNodes operation (runtime)
 *
 * 목적
 * - 지정 텍스트 노드를 기준으로 인접 텍스트 노드들과 연속 병합한다.
 *
 * 입력 형태(DSL)
 * - autoMergeTextNodes(nodeId)
 * - control(nodeId, [ autoMergeTextNodes() ]) → payload: {}
 */

defineOperation('autoMergeTextNodes', async (operation: any, context: TransactionContext) => {
  const { nodeId } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const mergedId = context.dataStore.splitMerge.autoMergeTextNodes(nodeId);
  return {
    ok: true,
    data: mergedId,
    inverse: undefined
  };
});



