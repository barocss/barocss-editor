import { defineOperationDSL } from '../operations/define-operation-dsl';

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
