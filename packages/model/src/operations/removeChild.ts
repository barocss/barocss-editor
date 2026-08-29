import { defineOperation } from './define-operation';
import { subtreeOf } from './subtree';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';


/**
 * removeChild operation DSL
 *
 * 목적
 * - 부모에서 특정 자식 노드를 제거한다. DataStore.content.removeChild 사용.
 *
 * 입력 형태(DSL)
 * - control(parentId, [ removeChild(childId) ]) → payload: { childId }
 * - removeChild(parentId, childId) → payload: { parentId, childId }
 */

export const removeChild = defineOperationDSL(
  (...args: [string] | [string, string]) => {
    if (args.length === 1) {
      const [childId] = args as [string];
      return { type: 'removeChild', payload: { childId } } as unknown as RemoveChildOperation;
    }
    const [parentId, childId] = args as [string, string];
    return { type: 'removeChild', payload: { parentId, childId } } as unknown as RemoveChildOperation;
  },
  { atom: true, category: 'content' }
);

/**
 * removeChild operation (DSL + runtime)
 *
 * Purpose:
 * - Removes a specific child node from parent. Uses DataStore.content.removeChild.
 *
 * Input format (DSL):
 * - control(parentId, [ removeChild(childId) ]) → payload: { childId }
 * - removeChild(parentId, childId) → payload: { parentId, childId }
 */

export interface RemoveChildOperation {
  type: 'removeChild';
  parentId: string;
  childId: string;
}

defineOperation('removeChild', async (operation: any, context: TransactionContext) => {
  // Can be passed as nodeId from control DSL, or directly as parentId
  const parentId = operation.payload.parentId || operation.payload.nodeId;
  const childId = operation.payload.childId;
  const parent = context.dataStore.getNode(parentId);
  if (!parent) throw new Error(`Parent not found: ${parentId}`);
  
  /**
   * The child **and everything under it**, which the inverse did not keep.
   *
   * `getNode` hands back a node whose `content` is a list of sids, and those sids resolve to nothing
   * the moment the node is gone — so undo put the node back **empty**. Measured: delete a paragraph,
   * press undo, and the paragraph returns without its words. Everything about it looks right, which
   * is why it lasted: the removal works, the undo runs, the node reappears, and no test had ever
   * looked inside one.
   */
  const childToRemove = subtreeOf(context, childId);
  if (!childToRemove) throw new Error(`Child not found: ${childId}`);
  /**
   * And where it was, which the inverse did not say.
   *
   * `addChild` with no position puts a child at the end, so undoing the removal
   * of a paragraph's first run gave the run back after everything else: the
   * document read differently and nothing had been lost, which is the shape of
   * fault this package keeps producing.
   */
  const wasAt = Array.isArray((parent as any).content)
    ? ((parent as any).content as string[]).indexOf(childId)
    : -1;
  // Not in this parent, so not this parent's to remove — and an inverse built
  // from a removal that did not happen adds a second copy of the node. See
  // `removeChildren`, which had the same fault.
  if (wasAt < 0) {
    return { ok: false, error: `removeChild: ${childId} is not in ${parentId}` };
  }
  
  const ok = context.dataStore.content.removeChild(parentId, childId);
  if (!ok) throw new Error(`Failed to remove child ${childId}`);
  
  return {
    ok: true,
    data: context.dataStore.getNode(parentId),
    inverse: {
      type: 'addChild',
      payload: { parentId, child: childToRemove, ...(wasAt >= 0 ? { position: wasAt } : {}) }
    }
  };
});

// DSL definition will be separated into a separate file


