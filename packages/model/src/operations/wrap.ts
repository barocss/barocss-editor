import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * wrap operation (DSL + runtime)
 *
 * 목적
 * - 지정한 범위의 텍스트를 접두/접미 문자열로 감싼다. DataStore.range.wrap 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ wrap(start, end, prefix, suffix) ])
 *   → payload: { start, end, prefix, suffix }
 * - control(nodeId, [ wrap(startId, startOffset, endId, endOffset, prefix, suffix) ])
 *   → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, prefix, suffix }
 * - wrap(nodeId, start, end, prefix, suffix)
 *   → payload: { nodeId, start, end, prefix, suffix }
 * - wrap(startId, startOffset, endId, endOffset, prefix, suffix)
 *   → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, prefix, suffix }
 *
 * Selection 매핑
 * - 텍스트 길이 변화가 있지만 Selection은 DataStore 정책에 위임한다.
 *
 * 예외 처리
 * - 노드 존재/타입(텍스트) 검증 및 범위 검증 후 실패 시 예외.
 */

type WrapOperationPayload =
  | {
      type: 'wrap';
      nodeId: string;
      start: number;
      end: number;
      prefix: string;
      suffix: string;
    }
  | {
      type: 'wrap';
      range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
      prefix: string;
      suffix: string;
    };

defineOperation('wrap', async (operation: any, context: TransactionContext) => {
  try {
    const payload = operation.payload;
    if ('range' in payload) {
      const { range, prefix, suffix } = payload;
      const { startNodeId, endNodeId, startOffset, endOffset } = range;
      const startNode = context.dataStore.getNode(startNodeId);
      const endNode = context.dataStore.getNode(endNodeId);
      if (!startNode) throw new Error(`Node not found: ${startNodeId}`);
      if (!endNode) throw new Error(`Node not found: ${endNodeId}`);
      if (typeof startNode.text !== 'string' || typeof endNode.text !== 'string') throw new Error('Range endpoints must be text nodes');
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') throw new Error('Invalid range');
      const wrapped = context.dataStore.range.wrap(range, prefix, suffix);
      return {
        ok: true,
        data: wrapped,
        inverse: { type: 'unwrap', payload: { range: { startNodeId: range.startNodeId, startOffset: range.startOffset, endNodeId: range.endNodeId, endOffset: range.endOffset + prefix.length + suffix.length }, prefix, suffix } }
      };
    }
    const { nodeId, start, end, prefix, suffix } = payload;
    const node = context.dataStore.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (typeof node.text !== 'string') throw new Error(`Node ${nodeId} is not a text node`);
    if (typeof start !== 'number' || typeof end !== 'number' || start > end || start < 0 || end > (node.text as string).length) {
      throw new Error('Invalid range');
    }
    const original = (node.text as string).substring(start, end);
    const wrapped = `${prefix}${original}${suffix}`;
    const deleted = context.dataStore.range.replaceText({
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    }, wrapped);
    return {
      ok: true,
      data: `${prefix}${deleted}${suffix}`,
      inverse: { type: 'unwrap', payload: { nodeId, start, end: start + wrapped.length, prefix, suffix } }
    };
  } catch (e) {
    throw new Error(`Failed to wrap text: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
});

// DSL definition will be separated into a separate file


