import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * removeChild operation (DSL + runtime)
 *
 * 목적
 * - 부모에서 특정 자식 노드를 제거한다. DataStore.content.removeChild 사용.
 *
 * 입력 형태(DSL)
 * - control(parentId, [ removeChild(childId) ]) → payload: { childId }
 * - removeChild(parentId, childId) → payload: { parentId, childId }
 */

export interface RemoveChildOperation {
  type: 'removeChild';
  parentId: string;
  childId: string;
}

defineOperation('removeChild', async (operation: any, context: TransactionContext) => {
  // control DSL에서 nodeId로 전달되거나, 직접 parentId로 전달될 수 있음
  const parentId = operation.payload.parentId || operation.payload.nodeId;
  const childId = operation.payload.childId;
  const parent = context.dataStore.getNode(parentId);
  if (!parent) throw new Error(`Parent not found: ${parentId}`);
  
  // 제거할 자식 노드 정보 저장 (역함수용)
  const childToRemove = context.dataStore.getNode(childId);
  if (!childToRemove) throw new Error(`Child not found: ${childId}`);
  
  const ok = context.dataStore.content.removeChild(parentId, childId);
  if (!ok) throw new Error(`Failed to remove child ${childId}`);
  
  return {
    ok: true,
    data: context.dataStore.getNode(parentId),
    inverse: { type: 'addChild', payload: { parentId, child: childToRemove } }
  };
});

// DSL 정의는 별도 파일로 분리 예정


