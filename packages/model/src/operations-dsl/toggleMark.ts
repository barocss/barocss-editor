import { defineOperationDSL, type DSLOperationDescriptor } from '../operations/define-operation-dsl';

/**
 * toggleMark operation DSL
 *
 * 목적
 * - 지정한 범위에 마크를 토글한다. DataStore.range.toggleMark 또는 DataStore.marks.toggleMark를 사용한다.
 *
 * 입력 형태(DSL)
 * - control(target, [ toggleMark(markType, range, attrs?) ]) → payload: { nodeId, markType, range, attrs? }
 * - toggleMark(nodeId, markType, range, attrs?) → payload: { nodeId, markType, range, attrs? }
 * - toggleMark(startId, startOffset, endId, endOffset, markType, attrs?) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
 */

type ToggleMarkOperationPayload =
  | {
      range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
      markType: string;
      attrs?: Record<string, any>;
    }
  | { markType: string; range: [number, number]; attrs?: Record<string, any> }
  | { nodeId: string; markType: string; range: [number, number]; attrs?: Record<string, any> };

export const toggleMark = defineOperationDSL(
  (
    ...args:
      | [string, [number, number], (Record<string, any>)?]
      | [string, string, [number, number], (Record<string, any>)?]
      | [string, number, string, number, string, (Record<string, any>)?]
  ): DSLOperationDescriptor<ToggleMarkOperationPayload> => {
    // cross-node: (startId, startOffset, endId, endOffset, markType, attrs?)
    if (args.length >= 5 && typeof args[0] === 'string' && typeof args[1] === 'number' && typeof args[2] === 'string' && typeof args[3] === 'number' && typeof args[4] === 'string') {
      const [startId, startOffset, endId, endOffset, markType, attrs] = args as [string, number, string, number, string, (Record<string, any>)?];
      return { type: 'toggleMark', payload: { range: { startNodeId: startId, startOffset, endNodeId: endId, endOffset }, markType, attrs } };
    }
    // control / single-node: (markType, range, attrs?)
    if (args.length >= 2 && typeof args[0] === 'string' && Array.isArray(args[1])) {
      const [markType, range, attrs] = args as [string, [number, number], (Record<string, any>)?];
      return { type: 'toggleMark', payload: { markType, range, attrs } };
    }
    // direct single-node: (nodeId, markType, range, attrs?)
    const [nodeId, markType, range, attrs] = args as [string, string, [number, number], (Record<string, any>)?];
    return { type: 'toggleMark', payload: { nodeId, markType, range, attrs } };
  },
  { atom: false, category: 'marks' }
);


