import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * reorderChildren operation (runtime)
 *
 * 목적
 * - 부모의 자식 순서를 특정 배열(childIds)로 재정렬한다. DataStore.content.reorderChildren 사용.
 *
 * 입력 형태(DSL)
 * - control(parentId, [ reorderChildren(childIds) ]) → payload: { childIds }
 * - reorderChildren(parentId, childIds) → payload: { parentId, childIds }
 */

defineOperation('reorderChildren', async (operation: any, context: TransactionContext) => {
  const { parentId, childIds } = operation.payload;
  const parent = context.dataStore.getNode(parentId);
  if (!parent) throw new Error(`Parent not found: ${parentId}`);
  // capture previous order for inverse
  const prevOrder = Array.isArray((parent as any).content) ? [ ...(parent as any).content ] : [];
  context.dataStore.content.reorderChildren(parentId, childIds);
  return {
    ok: true,
    data: context.dataStore.getNode(parentId),
    inverse: { type: 'reorderChildren', payload: { parentId, childIds: prevOrder } }
  };
});



