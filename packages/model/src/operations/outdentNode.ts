import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * outdentNode operation (구조 내어쓰기)
 *
 * 목적
 * - 지정된 노드를 schema 기반 규칙에 따라 한 단계 내어쓰기 한다.
 * - 내부적으로 DataStore.outdentNode(nodeId)를 호출한다.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ outdentNode() ]) → payload: {}
 * - outdentNode(nodeId) → payload: { nodeId }
 */

export interface OutdentNodeOperation {
  type: 'outdentNode';
  nodeId: string;
}

defineOperation('outdentNode', async (operation: any, context: TransactionContext) => {
  const nodeId: string | undefined = operation.payload.nodeId;
  if (!nodeId) {
    throw new Error('[outdentNode] nodeId is required in payload');
  }

  const node = context.dataStore.getNode(nodeId);
  if (!node) {
    throw new Error(`[outdentNode] Node not found: ${nodeId}`);
  }

  const ok = context.dataStore.outdentNode(nodeId);

  // outdentNode 가 false 를 반환한 경우 (최상위 수준 등)도
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
    inverse: { type: 'indentNode', payload: { nodeId } }
  };
});


