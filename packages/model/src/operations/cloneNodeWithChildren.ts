import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * cloneNodeWithChildren operation (runtime)
 *
 * 목적
 * - 노드와 그 자식 전체를 복제한다. 선택적으로 새 부모에 추가. DataStore.content.cloneNodeWithChildren 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ cloneNodeWithChildren(newParentId?) ]) → payload: { newParentId? }
 * - cloneNodeWithChildren(nodeId, newParentId?) → payload: { nodeId, newParentId? }
 */

defineOperation('cloneNodeWithChildren', async (operation: any, context: TransactionContext) => {
  const { nodeId, newParentId } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const newId = context.dataStore.content.cloneNodeWithChildren(nodeId, newParentId);
  return {
    ok: true,
    data: context.dataStore.getNode(newId),
    inverse: { type: 'delete', payload: { nodeId: newId } }
  };
});



