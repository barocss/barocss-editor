import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * copyNode operation (runtime)
 *
 * 목적
 * - 노드를 복사하고 선택적으로 새 부모에 추가한다. DataStore.content.copyNode 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ copyNode(newParentId?) ]) → payload: { newParentId? }
 * - copyNode(nodeId, newParentId?) → payload: { nodeId, newParentId? }
 */

defineOperation('copyNode', async (operation: any, context: TransactionContext) => {
  const { nodeId, newParentId } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const newId = context.dataStore.content.copyNode(nodeId, newParentId);
  return {
    ok: true,
    data: context.dataStore.getNode(newId),
    inverse: { type: 'delete', payload: { nodeId: newId } }
  };
});



