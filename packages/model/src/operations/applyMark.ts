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
    if ('range' in payload) {
      const { range, markType, attrs } = payload;
      const { startNodeId, endNodeId, startOffset, endOffset } = range;
      const startNode = context.dataStore.getNode(startNodeId);
      const endNode = context.dataStore.getNode(endNodeId);
      if (!startNode) throw new Error(`Node not found: ${startNodeId}`);
      if (!endNode) throw new Error(`Node not found: ${endNodeId}`);
      if (typeof startNode.text !== 'string' || typeof endNode.text !== 'string') {
        throw new Error('Range endpoints must be text nodes');
      }
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') throw new Error('Invalid range');
      if (startNodeId === endNodeId) {
        // same-node: delegate to marks.setMarks for fast path
        const res = context.dataStore.marks.setMarks(startNodeId, [
          ...((startNode.marks as any[]) || []),
          { type: markType, attrs, range: [startOffset, endOffset] as [number, number] }
        ]);
        if (!res || res.valid !== true) throw new Error(res?.errors?.[0] || 'Apply mark failed');
        return context.dataStore.getNode(startNodeId);
      }
      // cross-node without relying on iterator: apply to start tail and end head
      const startLen = (startNode.text as string).length;
      const endLen = (endNode.text as string).length;
      const startRange: [number, number] = [Math.max(0, Math.min(startOffset, startLen)), startLen];
      const endRange: [number, number] = [0, Math.max(0, Math.min(endOffset, endLen))];
      const res1 = context.dataStore.marks.setMarks(startNodeId, [
        ...((startNode.marks as any[]) || []),
        { type: markType, attrs, range: startRange }
      ]);
      if (!res1 || res1.valid !== true) throw new Error(res1?.errors?.[0] || 'Apply mark failed');
      const freshEndNode = context.dataStore.getNode(endNodeId);
      const res2 = context.dataStore.marks.setMarks(endNodeId, [
        ...((freshEndNode?.marks as any[]) || []),
        { type: markType, attrs, range: endRange }
      ]);
      if (!res2 || res2.valid !== true) throw new Error(res2?.errors?.[0] || 'Apply mark failed');
      return context.dataStore.getNode(endNodeId);
    }
    const { nodeId, start, end, markType, attrs } = payload;
    const node = context.dataStore.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (typeof node.text !== 'string') throw new Error(`Node ${nodeId} is not a text node`);
    if (typeof start !== 'number' || typeof end !== 'number' || start >= end || start < 0 || end > (node.text as string).length) {
      throw new Error('Invalid range');
    }
    const res = context.dataStore.marks.setMarks(nodeId, [
      ...((node.marks as any[]) || []),
      { type: markType, attrs, range: [start, end] as [number, number] }
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

// DSL (control/direct, 단일/크로스 노드)
// DSL 정의는 별도 파일로 분리 예정


