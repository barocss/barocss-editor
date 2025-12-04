import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * applyMark operation DSL
 *
 * 목적
 * - 지정한 범위에 마크를 적용한다. DataStore.range.applyMark를 사용한다.
 *
 * 입력 형태(DSL)
 * - control(target, [ applyMark(start, end, markType, attrs?) ]) → payload: { start, end, markType, attrs? }
 * - applyMark(nodeId, start, end, markType, attrs?) → payload: { nodeId, start, end, markType, attrs? }
 * - applyMark(startId, startOffset, endId, endOffset, markType, attrs?) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, markType, attrs? }
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
      range: {
        startNodeId: string;
        startOffset: number;
        endNodeId: string;
        endOffset: number;
      };
      markType: string;
      attrs?: Record<string, any>;
    }
  | {
      type: 'applyMark';
      start: number;
      end: number;
      markType: string;
      attrs?: Record<string, any>;
    };

export const applyMark = defineOperationDSL(
  (
    ...args:
      | [number, number, string, (Record<string, any>)?]
      | [string, number, string, number, string, (Record<string, any>)?]
      | [string, number, number, string, (Record<string, any>)?]
  ) => {
    // control: (start, end, markType, attrs?)
    if (args.length >= 3 && typeof args[0] === 'number' && typeof args[2] === 'string') {
      const [start, end, markType, attrs] = args as [number, number, string, (Record<string, any>)?];
      return { type: 'applyMark', payload: { start, end, markType, attrs } } as unknown as ApplyMarkOperationPayload;
    }
    // cross-node: (startId, startOffset, endId, endOffset, markType, attrs?)
    if (args.length >= 5 && typeof args[0] === 'string' && typeof args[2] === 'string' && typeof args[4] === 'string') {
      const [startId, startOffset, endId, endOffset, markType, attrs] = args as [string, number, string, number, string, (Record<string, any>)?];
      return { type: 'applyMark', payload: { range: { startNodeId: startId, startOffset, endNodeId: endId, endOffset }, markType, attrs } } as unknown as ApplyMarkOperationPayload;
    }
    // direct single-node: (nodeId, start, end, markType, attrs?)
    const [nodeId, start, end, markType, attrs] = args as [string, number, number, string, (Record<string, any>)?];
    return { type: 'applyMark', payload: { nodeId, start, end, markType, attrs } } as unknown as ApplyMarkOperationPayload;
  },
  { atom: false, category: 'marks' }
);
