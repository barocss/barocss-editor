import { defineOperationDSL } from '../operations/define-operation-dsl';

type AutoMergeTextNodesOperation =
  | { type: 'autoMergeTextNodes'; nodeId: string }
  | { type: 'autoMergeTextNodes' };

export const autoMergeTextNodes = defineOperationDSL(
  (...args: [] | [string]) => {
    if (args.length === 0) {
      return { type: 'autoMergeTextNodes', payload: {} } as unknown as AutoMergeTextNodesOperation;
    }
    const [nodeId] = args as [string];
    return { type: 'autoMergeTextNodes', payload: { nodeId } } as unknown as AutoMergeTextNodesOperation;
  },
  { atom: false, category: 'text' }
);


