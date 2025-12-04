import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';

export interface SetNodeOperation {
  type: 'setNode';
  node: INode;
  validate?: boolean;
}

/**
 * 노드 설정/생성 operation
 * 
 * 노드를 DataStore에 설정하거나 생성합니다.
 * DataStore의 setNode 메서드를 사용하여 효율적으로 처리합니다.
 */
defineOperation('setNode', async (operation: SetNodeOperation, context: TransactionContext) => {
  const { node, validate = true } = operation;
  
  // 1. 노드 ID 확인
  if (!node.sid) {
    throw new Error('Node must have an id');
  }
  
  // 2. DataStore의 setNode 메서드 사용
  // 이 메서드는 자동으로 ID 생성, validation, timestamp 업데이트 등을 처리
  context.dataStore.setNode(node, validate);
  
  // 3. 설정된 노드 반환
  return context.dataStore.getNode(node.sid);
});

export const setNode = defineOperationDSL(
  (node: INode, validate?: boolean) => ({
    type: 'setNode',
    payload: { node, validate }
  }),
  { atom: false, category: 'content' }
);
