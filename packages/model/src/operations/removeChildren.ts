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
  const firstAt = Math.min(...positions.filter((one: number) => one >= 0));
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



