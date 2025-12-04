import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * unwrap operation DSL
 *
 * 목적
 * - 지정한 범위의 텍스트에서 접두/접미 문자열을 제거한다. DataStore.range.unwrap 사용.
 *
 * 입력 형태(DSL)
 * - control(target, [ unwrap(start, end, prefix, suffix) ]) → payload: { start, end, prefix, suffix }
 * - unwrap(nodeId, start, end, prefix, suffix) → payload: { nodeId, start, end, prefix, suffix }
 * - unwrap(startId, startOffset, endId, endOffset, prefix, suffix) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, prefix, suffix }
 */

type UnwrapOperationPayload =
  | {
      type: 'unwrap';
      nodeId: string;
      start: number;
      end: number;
      prefix: string;
      suffix: string;
    }
  | {
      type: 'unwrap';
      range: { type: 'range'; startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
      prefix: string;
      suffix: string;
    }
  | {
      type: 'unwrap';
      start: number;
      end: number;
      prefix: string;
      suffix: string;
    };

export const unwrap = defineOperationDSL(
  (
    ...args:
      | [number, number, string, string]
      | [string, number, number, string, string]
      | [string, number, string, number, string, string]
  ) => {
    // control single-node: (start, end, prefix, suffix)
    if (args.length === 4 && typeof args[0] === 'number') {
      const [start, end, prefix, suffix] = args as [number, number, string, string];
      return { type: 'unwrap', payload: { start, end, prefix, suffix } } as unknown as UnwrapOperationPayload;
    }
    // cross-node: (startId, startOffset, endId, endOffset, prefix, suffix)
    if (args.length === 6 && typeof args[0] === 'string' && typeof args[2] === 'string') {
      const [startId, startOffset, endId, endOffset, prefix, suffix] = args as [string, number, string, number, string, string];
      return {
        type: 'unwrap',
        payload: {
          range: { type: 'range', startNodeId: startId, startOffset, endNodeId: endId, endOffset },
          prefix,
          suffix
        }
      } as unknown as UnwrapOperationPayload;
    }
    // direct single-node: (nodeId, start, end, prefix, suffix)
    const [nodeId, start, end, prefix, suffix] = args as [string, number, number, string, string];
    return { type: 'unwrap', payload: { nodeId, start, end, prefix, suffix } } as unknown as UnwrapOperationPayload;
  },
  { atom: true, category: 'text' }
);
