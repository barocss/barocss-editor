import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';

// CreateOperation 타입 정의 (INode 사용)
// runtime only; DSL moved to operations-dsl/create.ts


/**
 * 노드 생성 Operation
 * 
 * DataStore의 createNodeWithChildren 메서드를 활용하여:
 * 1. 중첩된 노드 구조를 한 번에 생성
 * 2. 자동 ID 생성 (Figma 스타일)
 * 3. Schema 검증 수행
 * 4. 원자적 Operation 이벤트 발생
 */
defineOperation('create', 
  async (operation: any, context: TransactionContext) => {
  const { node: originalNode, options } = operation.payload as { node: INode; options?: any };
  // 원본 노드를 복사해서 사용 (참조 문제 방지)
  const node = JSON.parse(JSON.stringify(originalNode));
  
  try {
    // 1. DataStore 업데이트 (INode 직접 사용)
    const schema = context.dataStore.getActiveSchema();
    // 노드를 복사해서 처리 (원본 노드 수정 방지)
    const nodeCopy = JSON.parse(JSON.stringify(node));
    const processedNode = context.dataStore.createNodeWithChildren(nodeCopy, schema);
    
    // createNodeWithChildren에서 이미 부모-자식 관계를 설정했으므로 추가 작업 불필요
    
    // 루트 노드 설정 (첫 번째 노드인 경우)
    if (!context.dataStore.getRootNode()) {
      context.dataStore.setRootNodeId(processedNode.sid!);
    }
    
    // 3. DataStore 변경 완료 후 Selection 매핑
    // create operation은 Selection을 변경하지 않음 (preserve)
    
    // 생성된 노드 반환 + inverse (복사해서 반환)
    const resultData = JSON.parse(JSON.stringify(processedNode));
    return {
      ok: true,
      data: resultData,
      inverse: { type: 'delete', payload: { nodeId: processedNode.sid! } }
    };
    
  } catch (error) {
    // Schema validation 실패 또는 기타 오류 처리
    throw new Error(`Failed to create node: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});
