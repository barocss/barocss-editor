import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';


type CloneNodeWithChildrenPayload =
  | { type: 'cloneNodeWithChildren'; nodeId: string; newParentId?: string }
  | { type: 'cloneNodeWithChildren'; newParentId: string };

export const cloneNodeWithChildren = defineOperationDSL(
  (...args: [string, string?] | [string]) => {
    if (args.length >= 2) {
      const [nodeId, newParentId] = args as [string, string?];
      return { type: 'cloneNodeWithChildren', payload: { nodeId, newParentId } } as unknown as CloneNodeWithChildrenPayload;
    }
    const [newParentId] = args as [string];
    return { type: 'cloneNodeWithChildren', payload: { newParentId } } as unknown as CloneNodeWithChildrenPayload;
  },
  { atom: false, category: 'structure' }
);

/**
 * cloneNodeWithChildren operation (runtime)
 *
 * 목적
 * - 노드와 그 자식 전체를 복제한다. 선택적으로 새 부모에 추가. DataStore.content.cloneNodeWithChildren 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ cloneNodeWithChildren(newParentId?) ]) → payload: { newParentId? }
 * - cloneNodeWithChildren(nodeId, newParentId?) → payload: { nodeId, newParentId? }
 */

defineOperation('cloneNodeWithChildren', async (operation: any, context: TransactionContext) => {
  const { nodeId, newParentId } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const newId = context.dataStore.content.cloneNodeWithChildren(nodeId, newParentId);
  return {
    ok: true,
    data: context.dataStore.getNode(newId),
    inverse: { type: 'delete', payload: { nodeId: newId } }
  };
});



