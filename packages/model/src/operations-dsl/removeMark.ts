import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * removeMark operation DSL
 *
 * 목적
 * - 단일 노드에서 특정 범위(range)의 특정 타입(markType) 마크를 제거한다.
 * - DataStore.marks.removeMark를 사용한다.
 *
 * 입력 형태(DSL)
 * - control(target, [ removeMark(markType, range) ]) → payload: { markType, range }
 * - removeMark(nodeId, markType, range) → payload: { nodeId, markType, range }
 */

interface RemoveMarkOperation {
  type: 'removeMark';
  nodeId: string;
  markType: string;
  range: [number, number];
}

export const removeMark = defineOperationDSL(
  (...args: [string, [number, number]] | [string, string, [number, number]]) => {
    if (args.length === 2) {
      const [markType, range] = args as [string, [number, number]];
      return { type: 'removeMark', payload: { markType, range } } as unknown as RemoveMarkOperation;
    }
    const [nodeId, markType, range] = args as [string, string, [number, number]];
    return { type: 'removeMark', payload: { nodeId, markType, range } } as unknown as RemoveMarkOperation;
  },
  { atom: false, category: 'marks' }
);
