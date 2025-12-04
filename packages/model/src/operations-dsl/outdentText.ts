import { defineOperationDSL } from '../operations/define-operation-dsl';
import type { ModelSelection } from '@barocss/editor-core';

/**
 * outdentText operation DSL (텍스트 내어쓰기)
 *
 * 목적
 * - 지정 범위의 각 줄 앞에서 들여쓰기 문자열을 제거한다. DataStore.range.outdent 사용.
 *
 * 입력 형태(DSL)
 * - control(target, [ outdentText(start, end, indent?) ]) → payload: { start, end, indent? }
 * - outdentText(nodeId, start, end, indent?) → payload: { nodeId, start, end, indent? }
 * - outdentText(startId, startOffset, endId, endOffset, indent?) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, indent? }
 */

type OutdentTextOperationPayload =
  | { type: 'outdentText'; nodeId: string; start: number; end: number; indent?: string }
  | { type: 'outdentText'; range: ModelSelection; indent?: string }
  | { type: 'outdentText'; start: number; end: number; indent?: string };

export const outdentText = defineOperationDSL(
  (
    ...args:
      | [number, number, (string)?]
      | [string, number, number, (string)?]
      | [string, number, string, number, (string)?]
  ) => {
    // control single-node
    if (args.length >= 2 && typeof args[0] === 'number') {
      const [start, end, indent] = args as [number, number, (string)?];
      return { type: 'outdentText', payload: { start, end, indent } } as unknown as OutdentTextOperationPayload;
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
      return { type: 'outdentText', payload: { range, indent } } as unknown as OutdentTextOperationPayload;
    }
    // direct single-node
    const [nodeId, start, end, indent] = args as [string, number, number, (string)?];
    return { type: 'outdentText', payload: { nodeId, start, end, indent } } as unknown as OutdentTextOperationPayload;
  },
  { atom: true, category: 'text' }
);

