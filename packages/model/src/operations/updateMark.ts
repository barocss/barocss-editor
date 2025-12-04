import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * updateMark operation (runtime)
 *
 * 목적
 * - 단일 노드의 특정 범위(range)에 존재하는 특정 타입(markType)의 마크 속성(attrs)을 갱신한다.
 * - 마크 정규화/검증 정책은 DataStore 전용 API에 위임한다.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ updateMark(markType, range, newAttrs) ]) → payload: { markType, range, newAttrs }
 * - updateMark(nodeId, markType, range, newAttrs) → payload: { nodeId, markType, range, newAttrs }
 *   - 빌더는 control(target, …)에서 target을 nodeId로 주입한다.
 *
 * Selection 매핑
 * - 마크 변경은 selection 이동을 유발하지 않는다. preserve.
 *
 * 예외 처리
 * - DataStore.marks.updateMark 실패 시 { valid: false, errors } 반환을 예외로 승격한다.
 */
defineOperation('updateMark', async (operation: any, context: TransactionContext) => {
  const { nodeId, markType, range, newAttrs } = operation.payload;
  
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  
  if (!context.dataStore.marks || typeof context.dataStore.marks.updateMark !== 'function') {
    throw new Error('DataStore.marks.updateMark is not available');
  }

  const result = context.dataStore.marks.updateMark(nodeId, markType, range, newAttrs);
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Update mark failed';
    throw new Error(message);
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'updateMark', payload: { nodeId, markType, range, newAttrs: (dataStoreNodeAttrs(context.dataStore.getNode(nodeId), markType, range)) } }
  };
});

function dataStoreNodeAttrs(node: any, markType: string, range: [number, number]) {
  const marks = (node?.marks as any[]) || [];
  const found = marks.find((m) => m.type === markType && Array.isArray(m.range) && m.range[0] === range[0] && m.range[1] === range[1]);
  return found?.attrs;
}
