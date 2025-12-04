import { defineOperation } from './define-operation';
import type { UpdateOperation } from './index';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

/**
 * 노드 업데이트 operation
 * 
 * 기존 노드의 속성, 텍스트, content, attributes 등을 업데이트합니다.
 * DataStore의 updateNode 메서드를 사용하여 효율적으로 처리합니다.
 */
defineOperation('update', async (operation: UpdateOperation, context: TransactionContext) => {
  const { nodeId, data: updates } = operation.payload;
  
  // 1. 기존 노드 존재 확인
  const existingNode = context.dataStore.getNode(nodeId);
  if (!existingNode) {
    throw new Error(`Node with id '${nodeId}' not found`);
  }
  
  // 2. DataStore의 updateNode 메서드 사용
  // 이 메서드는 자동으로 attributes 병합, validation, timestamp 업데이트 등을 처리
  const result = context.dataStore.updateNode(nodeId, updates);
  
  // 3. validation 실패 시 에러 발생
  if (result && !result.valid) {
    throw new Error(`Update failed: ${result.errors.join(', ')}`);
  }
  
  // 4. 업데이트된 노드 반환 (OperationExecuteResult 구조)
  const updatedNode = context.dataStore.getNode(nodeId);
  return {
    ok: true,
    data: updatedNode,
    inverse: { type: 'update', payload: { nodeId, data: existingNode } }
  };
});

export const update = defineOperationDSL(
  (updates: Record<string, any>) => ({
    type: 'update',
    payload: { updates }
  }),
  { atom: false, category: 'content' }
);
