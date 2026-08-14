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

  /**
   * The list must be these children, in some order — no more and no fewer.
   *
   * The store writes it straight into `content`, so a list that leaves a child
   * out drops it from the parent without deleting it (an orphan the document
   * still owns and nothing points at), and one naming a stranger adopts it.
   * Neither is a reordering.
   *
   * It matters most for undo. The inverse is the order that was, named by id,
   * and a later operation may have consumed one of them — merging two runs
   * leaves the right-hand one gone. The store threw for the missing id, and a
   * throw inside a transaction takes every other undo with it. Declining says
   * the same thing without doing that damage: the document has moved, and this
   * particular order is no longer a thing that can be restored.
   */
  const wanted = [...(childIds ?? [])].sort();
  const present = [...prevOrder].sort();
  const same = wanted.length === present.length && wanted.every((id: string, index: number) => id === present[index]);
  if (!same) {
    return {
      ok: false,
      error:
        `reorderChildren: the list is not ${parentId}'s children — ` +
        `asked for [${(childIds ?? []).join(', ')}], holds [${prevOrder.join(', ')}]`
    };
  }

  context.dataStore.content.reorderChildren(parentId, childIds);
  return {
    ok: true,
    data: context.dataStore.getNode(parentId),
    inverse: { type: 'reorderChildren', payload: { parentId, childIds: prevOrder } }
  };
});



