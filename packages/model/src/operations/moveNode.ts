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
    /**
     * Back where it came from — or out again, if it came from nowhere.
     *
     * A node that has been removed from its parent still exists; moving it into
     * a new one adopts it. There is then no previous parent to name, and the
     * inverse carried `newParentId: undefined`, which is not a move anywhere:
     * undo did nothing and the node stayed where the move had put it.
     *
     * Taking it out again is the actual reverse of adopting it, and leaves it
     * as it was found — parentless, and still in the store.
     */
    inverse:
      prevParentId && typeof prevPosition === 'number' && prevPosition >= 0
        ? { type: 'moveNode', payload: { nodeId, newParentId: prevParentId, position: prevPosition } }
        : { type: 'removeChild', payload: { parentId: newParentId, childId: nodeId } }
  };
});


