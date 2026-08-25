import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';


/**
 * wrap operation DSL
 *
 * 목적
 * - 지정한 범위의 텍스트를 접두/접미 문자열로 감싼다. DataStore.range.wrap 사용.
 *
 * 입력 형태(DSL)
 * - control(target, [ wrap(start, end, prefix, suffix) ]) → payload: { start, end, prefix, suffix }
 * - wrap(nodeId, start, end, prefix, suffix) → payload: { nodeId, start, end, prefix, suffix }
 * - wrap(startId, startOffset, endId, endOffset, prefix, suffix) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, prefix, suffix }
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
      range: { type: 'range'; startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
      prefix: string;
      suffix: string;
    }
  | {
      type: 'wrap';
      start: number;
      end: number;
      prefix: string;
      suffix: string;
    };

export const wrap = defineOperationDSL(
  (
    ...args:
      | [number, number, string, string]
      | [string, number, number, string, string]
      | [string, number, string, number, string, string]
  ) => {
    // control single-node: (start, end, prefix, suffix)
    if (args.length === 4 && typeof args[0] === 'number') {
      const [start, end, prefix, suffix] = args as [number, number, string, string];
      return { type: 'wrap', payload: { start, end, prefix, suffix } } as unknown as WrapOperationPayload;
    }
    // cross-node: (startId, startOffset, endId, endOffset, prefix, suffix)
    if (args.length === 6 && typeof args[0] === 'string' && typeof args[2] === 'string') {
      const [startId, startOffset, endId, endOffset, prefix, suffix] = args as [string, number, string, number, string, string];
      return {
        type: 'wrap',
        payload: {
          range: { type: 'range', startNodeId: startId, startOffset, endNodeId: endId, endOffset },
          prefix,
          suffix
        }
      } as unknown as WrapOperationPayload;
    }
    // direct single-node: (nodeId, start, end, prefix, suffix)
    const [nodeId, start, end, prefix, suffix] = args as [string, number, number, string, string];
    return { type: 'wrap', payload: { nodeId, start, end, prefix, suffix } } as unknown as WrapOperationPayload;
  },
  { atom: true, category: 'text' }
);

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
      /**
       * What the run held, and what it carried, before this rewrites it.
       *
       * The store edits text by replacing it, which re-derives the marks — right
       * for a reader making the edit, and not reversible. Undo therefore writes
       * the original stretch back whole, marks and all, rather than asking the
       * opposite operation to work it out.
       */
      const markedNode = startNodeId === endNodeId ? context.dataStore.getNode(startNodeId) : null;
      const marksBefore = Array.isArray((markedNode as any)?.marks)
        ? JSON.parse(JSON.stringify((markedNode as any).marks))
        : [];
      const originalText =
        startNodeId === endNodeId
          ? ((markedNode as any).text as string).slice(startOffset, endOffset)
          : null;
      const wrapped = context.dataStore.range.wrap(range, prefix, suffix);
      return {
        ok: true,
        data: wrapped,
        // Written back whole: the range the text now occupies, the text that
        // was there, and the marks it carried. See the capture above.
        ...(originalText !== null
          ? {
              inverse: {
                type: 'replaceText',
                payload: {
                  range: {
                    startNodeId,
                    startOffset,
                    endNodeId: startNodeId,
                    endOffset: startOffset + (wrapped ?? '').length
                  },
                  newText: originalText,
                  marksAfter: marksBefore
                }
              }
            }
          : {})
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
      type: 'range',
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


