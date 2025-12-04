import { defineOperationDSL } from '../operations/define-operation-dsl';

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

interface RemoveChildOperation {
  type: 'removeChild';
  parentId: string;
  childId: string;
}

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
