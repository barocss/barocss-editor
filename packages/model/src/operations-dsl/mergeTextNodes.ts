import { defineOperationDSL } from '../operations/define-operation-dsl';

type MergeTextNodesOperation =
  | { type: 'mergeTextNodes'; leftNodeId: string; rightNodeId: string }
  | { type: 'mergeTextNodes'; rightNodeId: string };

export const mergeTextNodes = defineOperationDSL(
  (...args: [string] | [string, string]) => {
    if (args.length === 1) {
      const [rightNodeId] = args as [string];
      return { type: 'mergeTextNodes', payload: { rightNodeId } } as unknown as MergeTextNodesOperation;
    }
    const [leftNodeId, rightNodeId] = args as [string, string];
    return { type: 'mergeTextNodes', payload: { leftNodeId, rightNodeId } } as unknown as MergeTextNodesOperation;
  },
  { atom: false, category: 'text' }
);


