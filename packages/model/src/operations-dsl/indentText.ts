import { defineOperationDSL } from '../operations/define-operation-dsl';
import type { ModelSelection } from '@barocss/editor-core';

/**
 * indentText operation DSL (텍스트 들여쓰기)
 *
 * 목적
 * - 지정 범위의 각 줄 앞에 들여쓰기 문자열을 추가한다. DataStore.range.indent 사용.
 *
 * 입력 형태(DSL)
 * - control(target, [ indentText(start, end, indent?) ]) → payload: { start, end, indent? }
 * - indentText(nodeId, start, end, indent?) → payload: { nodeId, start, end, indent? }
 * - indentText(startId, startOffset, endId, endOffset, indent?) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, indent? }
 */

type IndentTextOperationPayload =
  | { type: 'indentText'; nodeId: string; start: number; end: number; indent?: string }
  | { type: 'indentText'; range: ModelSelection; indent?: string }
  | { type: 'indentText'; start: number; end: number; indent?: string };

export const indentText = defineOperationDSL(
  (
    ...args:
      | [number, number, (string)?]
      | [string, number, number, (string)?]
      | [string, number, string, number, (string)?]
  ) => {
    // control single-node
    if (args.length >= 2 && typeof args[0] === 'number') {
      const [start, end, indent] = args as [number, number, (string)?];
      return { type: 'indentText', payload: { start, end, indent } } as unknown as IndentTextOperationPayload;
    }
    // cross-node
    if (args.length >= 4 && typeof args[0] === 'string' && typeof args[2] === 'string') {
      const [startId, startOffset, endId, endOffset, indent] = args as [string, number, string, number, (string)?];
      const range: ModelSelection = {
        type: 'range',
        startNodeId: startId,
        startOffset,
        endNodeId: endId,
        endOffset,
        collapsed: false,
        direction: 'forward'
      };
      return { type: 'indentText', payload: { range, indent } } as unknown as IndentTextOperationPayload;
    }
    // direct single-node
    const [nodeId, start, end, indent] = args as [string, number, number, (string)?];
    return { type: 'indentText', payload: { nodeId, start, end, indent } } as unknown as IndentTextOperationPayload;
  },
  { atom: true, category: 'text' }
);

