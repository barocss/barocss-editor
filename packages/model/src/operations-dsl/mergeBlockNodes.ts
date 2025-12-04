import { defineOperationDSL } from '../operations/define-operation-dsl';

type MergeBlockNodesOperation =
  | { type: 'mergeBlockNodes'; leftNodeId: string; rightNodeId: string }
  | { type: 'mergeBlockNodes'; rightNodeId: string };

export const mergeBlockNodes = defineOperationDSL(
  (...args: [string] | [string, string]) => {
    if (args.length === 1) {
      const [rightNodeId] = args as [string];
      return { type: 'mergeBlockNodes', payload: { rightNodeId } } as unknown as MergeBlockNodesOperation;
    }
    const [leftNodeId, rightNodeId] = args as [string, string];
    return { type: 'mergeBlockNodes', payload: { leftNodeId, rightNodeId } } as unknown as MergeBlockNodesOperation;
  },
  { atom: false, category: 'block' }
);


