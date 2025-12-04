import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * toggleMark operation (runtime)
 *
 * 목적
 * - 단일 노드에서 특정 범위(range)의 특정 타입(markType) 마크를 토글한다.
 *   - 동일 범위/타입이 존재하면 제거, 없으면 추가한다.
 * - 마크 정규화/검증 정책은 DataStore 전용 API에 위임한다.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ toggleMark(markType, range, attrs?) ]) → payload: { markType, range, attrs? }
 * - toggleMark(nodeId, markType, range, attrs?) → payload: { nodeId, markType, range, attrs? }
 *   - 빌더는 control(target, …)에서 target을 nodeId로 주입한다.
 *
 * Selection 매핑
 * - 마크 토글은 selection 이동을 유발하지 않는다. preserve.
 *
 * 예외 처리
 * - DataStore.marks.toggleMark 실패 시 { valid: false, errors } 반환을 예외로 승격한다.
 */
defineOperation('toggleMark', async (operation: any, context: TransactionContext) => {
  const { nodeId, markType, range, attrs } = operation.payload;
  
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  
  if (!context.dataStore.marks || typeof context.dataStore.marks.toggleMark !== 'function') {
    throw new Error('DataStore.marks.toggleMark is not available');
  }

  const result = context.dataStore.marks.toggleMark(nodeId, markType, range, attrs);
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Toggle mark failed';
    throw new Error(message);
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'toggleMark', payload: { nodeId, markType, range, attrs } }
  };
});

