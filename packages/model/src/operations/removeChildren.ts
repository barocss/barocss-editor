import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * removeChildren operation (runtime)
 *
 * 목적
 * - 부모에서 여러 자식들을 한 번에 제거한다. DataStore.content.removeChildren 사용.
 *
 * 입력 형태(DSL)
 * - control(parentId, [ removeChildren(childIds) ]) → payload: { childIds }
 * - removeChildren(parentId, childIds) → payload: { parentId, childIds }
 */

defineOperation('removeChildren', async (operation: any, context: TransactionContext) => {
  const { parentId, childIds } = operation.payload;
  const parent = context.dataStore.getNode(parentId);
  if (!parent) throw new Error(`Parent not found: ${parentId}`);
  // capture removed children nodes for inverse
  const removed = (childIds || []).map((id: string) => context.dataStore.getNode(id));
  const results = context.dataStore.content.removeChildren(parentId, childIds);
  return {
    ok: true,
    data: results,
    inverse: { type: 'addChild', payload: { parentId, children: removed } }
  };
});



