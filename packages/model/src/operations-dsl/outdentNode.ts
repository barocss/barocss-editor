import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * outdentNode operation DSL (구조 내어쓰기)
 *
 * 목적
 * - 지정된 노드를 한 단계 내어쓰기 한다. DataStore.outdentNode 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ outdentNode() ]) → payload: {}
 * - outdentNode(nodeId) → payload: { nodeId }
 */

interface OutdentNodeOperation {
  type: 'outdentNode';
  nodeId: string;
}

export const outdentNode = defineOperationDSL(
  (...args: [] | [string]) => {
    if (args.length === 0) {
      // control(nodeId, [ outdentNode() ]) 에서 nodeId 는 control 이 채워준다.
      return { type: 'outdentNode', payload: {} } as unknown as OutdentNodeOperation;
    }
    const [nodeId] = args as [string];
    return { type: 'outdentNode', payload: { nodeId } } as unknown as OutdentNodeOperation;
  },
  { atom: false, category: 'structure' }
);


