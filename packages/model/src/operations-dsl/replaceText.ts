import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * replaceText operation DSL
 *
 * 목적
 * - 단일 텍스트 노드의 지정된 범위(start, end)를 새 텍스트(newText)로 교체한다.
 * - 텍스트/마크 업데이트는 DataStore.range.replaceText에 위임한다.
 *
 * 입력 형태(DSL)
 * - control(target, [ replaceText(start, end, newText) ]) → payload: { start, end, newText }
 * - replaceText(nodeId, start, end, newText) → payload: { nodeId, start, end, newText }
 * - replaceText(startId, startOffset, endId, endOffset, newText) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, newText }
 */

type ReplaceTextOperationPayload =
  | {
      type: 'replaceText';
      nodeId: string;
      start: number;
      end: number;
      newText: string;
    }
  | {
      type: 'replaceText';
      range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
      newText: string;
    }
  | {
      type: 'replaceText';
      start: number;
      end: number;
      newText: string;
    };

export const replaceText = defineOperationDSL(
  (...args: [number, number, string] | [string, number, number, string] | [string, number, string, number, string]) => {
    // control: (start, end, newText)
    if (args.length === 3 && typeof args[0] === 'number') {
      const [start, end, newText] = args as [number, number, string];
      return { type: 'replaceText', payload: { start, end, newText } } as unknown as ReplaceTextOperationPayload;
    }
    // cross-node: (startId, startOffset, endId, endOffset, newText)
    if (args.length === 5 && typeof args[0] === 'string' && typeof args[2] === 'string') {
      const [startId, startOffset, endId, endOffset, newText] = args as [string, number, string, number, string];
      return { type: 'replaceText', payload: { range: { startNodeId: startId, startOffset, endNodeId: endId, endOffset }, newText } } as unknown as ReplaceTextOperationPayload;
    }
    // direct single-node: (nodeId, start, end, newText)
    const [nodeId, start, end, newText] = args as [string, number, number, string];
    return { type: 'replaceText', payload: { nodeId, start, end, newText } } as unknown as ReplaceTextOperationPayload;
  },
  { atom: true, category: 'text' }
);
