import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * addChild operation (DSL + runtime)
 *
 * 목적
 * - 부모에 자식 노드를 position 위치에 추가한다. DataStore.content.addChild 사용.
 *
 * 입력 형태(DSL)
 * - control(parentId, [ addChild(child, position?) ]) → payload: { child, position? }
 * - addChild(parentId, child, position?) → payload: { parentId, child, position? }
 */
defineOperation('addChild', async (operation: any, context: TransactionContext) => {
  const { parentId, nodeId, child, position } = operation.payload;
  const actualParentId = parentId || nodeId;
  const parent = context.dataStore.getNode(actualParentId);
  if (!parent) throw new Error(`Parent not found: ${actualParentId}`);
  const childId = context.dataStore.content.addChild(actualParentId, child, position);
  
  return {
    ok: true,
    data: context.dataStore.getNode(childId),
    inverse: { type: 'removeChild', payload: { parentId: actualParentId, childId } }
  };
});