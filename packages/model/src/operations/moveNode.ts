import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * moveNode operation (runtime)
 *
 * 목적
 * - 특정 노드를 다른 부모의 원하는 위치로 이동한다. DataStore.content.moveNode 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ moveNode(newParentId, position?) ]) → payload: { newParentId, position? }
 * - moveNode(nodeId, newParentId, position?) → payload: { nodeId, newParentId, position? }
 */

defineOperation('moveNode', async (operation: any, context: TransactionContext) => {
  const payload = operation.payload;
  const { nodeId, newParentId, position } = payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const parent = context.dataStore.getNode(newParentId);
  if (!parent) throw new Error(`Parent not found: ${newParentId}`);

  // capture previous location for inverse
  const prevParentId = (node as any).parentId;
  const prevPosition = Array.isArray((context.dataStore.getNode(prevParentId)?.content))
    ? (context.dataStore.getNode(prevParentId) as any).content.indexOf(nodeId)
    : undefined;

  context.dataStore.content.moveNode(nodeId, newParentId, position);
  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'moveNode', payload: { nodeId, newParentId: prevParentId, position: prevPosition } }
  };
});


