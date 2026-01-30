import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * deleteRange operation (runtime)
 *
 * 목적
 * - 지정한 범위(단일/복수 노드)의 텍스트를 삭제한다. DataStore.range.deleteText에 위임한다.
 *
 * 입력 형태(DSL)
 * - deleteRange(range) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset } }
 *
 * Selection 매핑
 * - 삭제 후 selection 정리는 TransactionManager/DataStore 전용 API에 위임한다.
 */
type DeleteRangePayload = {
  range: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
};

defineOperation('deleteRange', async (operation: any, context: TransactionContext) => {
  const payload = operation.payload as DeleteRangePayload;
  if (!payload?.range) {
    throw new Error('[deleteRange] payload.range is required');
  }

  const { startNodeId, startOffset, endNodeId, endOffset } = payload.range;
  const contentRange = {
    type: 'range' as const,
    startNodeId,
    startOffset,
    endNodeId,
    endOffset
  };

  if (!context.dataStore.range || typeof context.dataStore.range.deleteText !== 'function') {
    throw new Error('DataStore.range.deleteText is not available');
  }

  const deletedText = context.dataStore.range.deleteText(contentRange);

  return {
    ok: true,
    data: deletedText,
    inverse: { type: 'deleteRange', payload: { range: contentRange } }
  };
});
