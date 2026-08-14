import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * applyMark operation (DSL + runtime)
 *
 * 목적
 * - 지정한 범위에 마크를 적용한다. DataStore.range.applyMark를 사용한다.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ applyMark(start, end, markType, attrs?) ])
 *   → payload: { start, end, markType, attrs? }
 * - control(nodeId, [ applyMark(startId, startOffset, endId, endOffset, markType, attrs?) ])
 *   → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
 * - applyMark(nodeId, start, end, markType, attrs?)
 *   → payload: { nodeId, start, end, markType, attrs? }
 * - applyMark(startId, startOffset, endId, endOffset, markType, attrs?)
 *   → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
 *
 * Selection 매핑
 * - 마크 적용은 selection 이동을 유발하지 않는다.
 *
 * 예외 처리
 * - 노드 존재/타입(텍스트) 검증 및 범위 검증을 수행하고, 실패 시 명확한 예외를 던진다.
 */

type ApplyMarkOperationPayload =
  | {
      type: 'applyMark';
      nodeId: string;
      start: number;
      end: number;
      markType: string;
      attrs?: Record<string, any>;
    }
  | {
      type: 'applyMark';
      range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
      markType: string;
      attrs?: Record<string, any>;
    };

/**
 * The marks a node had, so that undo can put exactly those back.
 *
 * Taking the mark off the range it was applied to is not the inverse of putting
 * it on: a range that was already partly bold comes back not-bold, because
 * `removeMark` clears the range rather than reversing what this did. Applying
 * bold over overlapping ranges and undoing in reverse left text unbolded that
 * had been bold before anyone touched it.
 *
 * Restoring the whole list is exact, and marks are a small list on one node.
 */
const marksBefore = (dataStore: any, nodeId: string) => {
  const node = dataStore.getNode(nodeId);
  return Array.isArray(node?.marks) ? JSON.parse(JSON.stringify(node.marks)) : [];
};

defineOperation('applyMark', async (operation: { payload: ApplyMarkOperationPayload }, context: TransactionContext) => {
  try {
    const payload = operation.payload;
    if (!payload) throw new Error('Operation payload is required');
    const markType = payload.markType;
    const attrs = payload.attrs;

    // 전체 범위(selection): DataStore.range.applyMark에 위임 (단일/복수 노드 동일 처리)
    if ('range' in payload) {
      const { range } = payload;
      const { startNodeId, endNodeId, startOffset, endOffset } = range;
      const startNode = context.dataStore.getNode(startNodeId);
      const endNode = context.dataStore.getNode(endNodeId);
      if (!startNode) throw new Error(`Node not found: ${startNodeId}`);
      if (!endNode) throw new Error(`Node not found: ${endNodeId}`);
      if (typeof startNode.text !== 'string' || typeof endNode.text !== 'string') {
        throw new Error('Range endpoints must be text nodes');
      }
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') throw new Error('Invalid range');
      if (!context.dataStore.range || typeof context.dataStore.range.applyMark !== 'function') {
        throw new Error('DataStore.range.applyMark is not available');
      }
      const contentRange = { type: 'range' as const, startNodeId, startOffset, endNodeId, endOffset };
      const mark = { stype: markType, attrs };
      const before = startNodeId === endNodeId ? marksBefore(context.dataStore, startNodeId) : null;
      context.dataStore.range.applyMark(contentRange, mark);
      /**
       * An inverse, so that undo takes the mark off again.
       *
       * Only the single-node form used to report one, so applying bold across a
       * selection — the way a reader actually applies bold — produced nothing
       * for undo to do, and Ctrl+Z left the text bold.
       */
      return {
        ok: true,
        data: context.dataStore.getNode(startNodeId === endNodeId ? startNodeId : endNodeId),
        // `removeMark` works on one node at a time, so a mark applied across
        // several has no single operation that takes it off. Better to say so
        // than to offer an inverse that only clears the first node.
        // Exactly what the node carried before, not "take this range off".
        ...(before ? { inverse: { type: 'setMarks', payload: { nodeId: startNodeId, marks: before } } } : {})
      };
    }

    // 단일 노드(nodeId + start + end): marks.setMarks로 적용 (inverse 반환용)
    const { nodeId, start, end } = payload;
    const node = context.dataStore.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (typeof node.text !== 'string') throw new Error(`Node ${nodeId} is not a text node`);
    if (typeof start !== 'number' || typeof end !== 'number' || start >= end || start < 0 || end > (node.text as string).length) {
      throw new Error('Invalid range');
    }
    const res = context.dataStore.marks.setMarks(nodeId, [
      ...((node.marks as any[]) || []),
      { stype: markType, attrs, range: [start, end] as [number, number] }
    ]);
    if (!res || res.valid !== true) throw new Error(res?.errors?.[0] || 'Apply mark failed');
    
    return {
      ok: true,
      data: context.dataStore.getNode(nodeId),
      inverse: { type: 'removeMark', payload: { nodeId, markType, range: [start, end] } }
    };
  } catch (e) {
    throw new Error(`Failed to apply mark: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
});

// DSL (control/direct, single/cross node)
// DSL definition will be separated into a separate file


