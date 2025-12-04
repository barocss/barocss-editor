import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * indentNode operation DSL (구조 들여쓰기)
 *
 * 목적
 * - 지정된 노드를 한 단계 들여쓰기 한다. DataStore.indentNode 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ indentNode() ]) → payload: {}
 * - indentNode(nodeId) → payload: { nodeId }
 */

interface IndentNodeOperation {
  type: 'indentNode';
  nodeId: string;
}

export const indentNode = defineOperationDSL(
  (...args: [] | [string]) => {
    if (args.length === 0) {
      // control(nodeId, [ indentNode() ]) 에서 nodeId 는 control 이 채워준다.
      return { type: 'indentNode', payload: {} } as unknown as IndentNodeOperation;
    }
    const [nodeId] = args as [string];
    return { type: 'indentNode', payload: { nodeId } } as unknown as IndentNodeOperation;
  },
  { atom: false, category: 'structure' }
);


