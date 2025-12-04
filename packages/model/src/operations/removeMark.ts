import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * removeMark operation (DSL + runtime)
 *
 * 목적
 * - 단일 노드에서 특정 범위(range)의 특정 타입(markType) 마크를 제거한다.
 * - 마크 정규화/검증 정책은 DataStore 전용 API에 위임한다.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ removeMark(markType, range) ]) → payload: { markType, range }
 * - removeMark(nodeId, markType, range) → payload: { nodeId, markType, range }
 *   - 빌더는 control(target, …)에서 target을 nodeId로 주입한다.
 *
 * Selection 매핑
 * - 마크 제거는 selection 이동을 유발하지 않는다. preserve.
 *
 * 예외 처리
 * - DataStore.marks.removeMark 실패 시 { valid: false, errors } 반환을 예외로 승격한다.
 */
defineOperation('removeMark', async (operation: any, context: TransactionContext) => {
  const { nodeId, markType, range } = operation.payload;
  
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  if (!context.dataStore.marks || typeof context.dataStore.marks.removeMark !== 'function') {
    throw new Error('DataStore.marks.removeMark is not available');
  }

  const result = context.dataStore.marks.removeMark(nodeId, markType, range);
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Remove mark failed';
    throw new Error(message);
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'applyMark', payload: { nodeId, start: range[0], end: range[1], markType } }
  };
});

// DSL 정의는 별도 파일로 분리 예정
