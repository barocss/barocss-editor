import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * indentNode operation (구조 들여쓰기)
 *
 * 목적
 * - 지정된 노드를 schema 기반 규칙에 따라 한 단계 들여쓰기 한다.
 * - 내부적으로 DataStore.indentNode(nodeId)를 호출한다.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ indentNode() ]) → payload: {}
 * - indentNode(nodeId) → payload: { nodeId }
 */

export interface IndentNodeOperation {
  type: 'indentNode';
  nodeId: string;
}

defineOperation('indentNode', async (operation: any, context: TransactionContext) => {
  const nodeId: string | undefined = operation.payload.nodeId;
  if (!nodeId) {
    throw new Error('[indentNode] nodeId is required in payload');
  }

  const node = context.dataStore.getNode(nodeId);
  if (!node) {
    throw new Error(`[indentNode] Node not found: ${nodeId}`);
  }

  const ok = context.dataStore.indentNode(nodeId);

  // indentNode 가 false 를 반환한 경우 (더 이상 들여쓰기 불가 등)도
  // 에러로 보지 않고 no-op 으로 처리한다.
  if (!ok) {
    return {
      ok: true,
      data: context.dataStore.getNode(nodeId)
    };
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'outdentNode', payload: { nodeId } }
  };
});


