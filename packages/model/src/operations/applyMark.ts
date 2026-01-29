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

defineOperation('applyMark', async (operation: any, context: TransactionContext) => {
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
      context.dataStore.range.applyMark(contentRange, mark);
      return context.dataStore.getNode(startNodeId === endNodeId ? startNodeId : endNodeId);
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


