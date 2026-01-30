import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * moveChildren operation (runtime)
 *
 * 목적
 * - 여러 자식을 한 번에 다른 부모로 이동한다. DataStore.content.moveChildren 사용.
 *
 * 입력 형태(DSL)
 * - control(fromParentId, [ moveChildren(toParentId, childIds, position?) ]) → payload: { toParentId, childIds, position? }
 * - moveChildren(fromParentId, toParentId, childIds, position?) → payload: { fromParentId, toParentId, childIds, position? }
 */

defineOperation('moveChildren', async (operation: any, context: TransactionContext) => {
  const { fromParentId, toParentId, childIds, position } = operation.payload;
  const from = context.dataStore.getNode(fromParentId);
  const to = context.dataStore.getNode(toParentId);
  if (!from) throw new Error(`Parent not found: ${fromParentId}`);
  if (!to) throw new Error(`Parent not found: ${toParentId}`);
  // capture previous positions for inverse
  const prevPositions = (childIds || []).map((id: string) => {
    const parentId = (context.dataStore.getNode(id) as any)?.parentId;
    const parent = parentId ? (context.dataStore.getNode(parentId) as any) : undefined;
    const pos = Array.isArray(parent?.content) ? parent.content.indexOf(id) : undefined;
    return { childId: id, prevParentId: parentId, prevPosition: pos };
  });
  context.dataStore.content.moveChildren(fromParentId, toParentId, childIds, position);
  return {
    ok: true,
    data: { fromParent: context.dataStore.getNode(fromParentId), toParent: context.dataStore.getNode(toParentId) },
    inverse: { type: 'moveChildren', payload: { fromParentId: toParentId, toParentId: fromParentId, childIds, position: prevPositions[0]?.prevPosition } }
  };
});



