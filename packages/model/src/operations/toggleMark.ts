import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * toggleMark operation (runtime)
 *
 * 목적
 * - 단일 노드에서 특정 범위(range)의 특정 타입(markType) 마크를 토글한다.
 *   - 동일 범위/타입이 존재하면 제거, 없으면 추가한다.
 * - 전체 범위(range: { startNodeId, startOffset, endNodeId, endOffset })를 넘기면
 *   DataStore.range.toggleMark에 위임하여 단일/복수 노드 자동 처리.
 * - 마크 정규화/검증 정책은 DataStore 전용 API에 위임한다.
 *
 * 입력 형태(DSL)
 * - toggleMark(range, markType, attrs?) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
 * - control(nodeId, [ toggleMark(markType, range, attrs?) ]) → payload: { nodeId, markType, range, attrs? }
 * - toggleMark(nodeId, markType, range, attrs?) → payload: { nodeId, markType, range, attrs? }
 *
 * Selection 매핑
 * - 마크 토글은 selection 이동을 유발하지 않는다. preserve.
 *
 * 예외 처리
 * - DataStore.marks.toggleMark / DataStore.range.toggleMark 실패 시 예외 승격.
 */
defineOperation('toggleMark', async (operation: any, context: TransactionContext) => {
  const payload = operation.payload;
  const markType = payload.markType;
  const attrs = payload.attrs;

  // 전체 범위(selection) 형태: range: { startNodeId, startOffset, endNodeId, endOffset }
  if (payload.range && 'startNodeId' in payload.range && 'endNodeId' in payload.range) {
    const range = payload.range as { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
    let { startNodeId, startOffset, endNodeId, endOffset } = range;

    // Collapsed(커서): 1글자 구간으로 확장하여 토글 적용
    if (startNodeId === endNodeId && startOffset === endOffset) {
      const node = context.dataStore.getNode(startNodeId);
      if (node && typeof node.text === 'string') {
        endOffset = Math.min(startOffset + 1, node.text.length);
      }
    }

    if (!context.dataStore.range || typeof context.dataStore.range.toggleMark !== 'function') {
      throw new Error('DataStore.range.toggleMark is not available');
    }

    const contentRange = { type: 'range' as const, startNodeId, startOffset, endNodeId, endOffset };
    context.dataStore.range.toggleMark(contentRange, markType, attrs);

    return {
      ok: true,
      inverse: { type: 'toggleMark', payload: { range: contentRange, markType, attrs } }
    };
  }

  // 단일 노드 형태: nodeId + range [start, end]
  const { nodeId, range } = payload;
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

