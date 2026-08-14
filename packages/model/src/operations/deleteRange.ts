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

  /**
   * Undo puts the text back; it does not delete it again.
   *
   * The inverse used to be this same operation with this same range, so undoing
   * a deletion deleted as much again from where the first one stopped:
   * "abcdefgh" minus [2,5) is "abfgh", and Ctrl+Z made it "ab". `transaction.ts`
   * collects these and that collection *is* undo, so this was a keystroke that
   * damaged the document — and nothing caught it, because this operation had no
   * tests at all.
   *
   * Only a deletion within one text node can be restored by putting the text
   * back where it was. A deletion spanning several nodes removes structure as
   * well as characters, and re-inserting a string would not rebuild it — so
   * rather than offer an inverse that half-works, it offers none, and undo
   * leaves that alone instead of making it worse.
   */
  const withinOneNode = startNodeId === endNodeId;
  const inverse =
    withinOneNode && deletedText
      ? { type: 'insertText', payload: { nodeId: startNodeId, pos: startOffset, text: deletedText } }
      : undefined;

  return {
    ok: true,
    data: deletedText,
    ...(inverse ? { inverse } : {})
  };
});
