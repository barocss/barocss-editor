import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';


type RemoveChildrenOperation =
  | { type: 'removeChildren'; parentId: string; childIds: string[] }
  | { type: 'removeChildren'; childIds: string[] };

export const removeChildren = defineOperationDSL(
  (...args: [string, string[]] | [string[]]) => {
    if (args.length === 1) {
      const [childIds] = args as [string[]];
      return { type: 'removeChildren', payload: { childIds } } as unknown as RemoveChildrenOperation;
    }
    const [parentId, childIds] = args as [string, string[]];
    return { type: 'removeChildren', payload: { parentId, childIds } } as unknown as RemoveChildrenOperation;
  },
  { atom: true, category: 'structure' }
);

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
  /**
   * The children, and where they were.
   *
   * The inverse named them and not their places, so `addChild` put them back at
   * the end: undoing the removal of a paragraph's first run returned it after
   * everything else. Restored from the lowest index they held, which is exact
   * when they were next to each other — which is what removing several at once
   * means in every caller here.
   */
  const removed = (childIds || []).map((id: string) => context.dataStore.getNode(id));
  const positions = (childIds || []).map((id: string) =>
    Array.isArray((parent as any).content) ? ((parent as any).content as string[]).indexOf(id) : -1
  );

  /**
   * A child that is not in this parent is not a child this can remove.
   *
   * It reported success for one anyway — nothing to take out, so nothing
   * happened — and then handed back an inverse that added the node in. Removing
   * the same child twice and undoing both put a second copy of it in the
   * document: 'alpha beta link' came back as 'alpha beta link beta'.
   *
   * Declining is the same rule `moveChildren` keeps: the payload names children
   * *of this parent*, and a caller naming something else is wrong about the
   * document rather than asking for something subtle.
   */
  const missing = (childIds || []).filter((_id: string, index: number) => positions[index] < 0);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `removeChildren: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in ${parentId}`
    };
  }

  const firstAt = Math.min(...positions);
  const results = context.dataStore.content.removeChildren(parentId, childIds);
  return {
    ok: true,
    data: results,
    inverse: {
      type: 'addChild',
      payload: { parentId, children: removed, ...(Number.isFinite(firstAt) ? { position: firstAt } : {}) }
    }
  };
});



