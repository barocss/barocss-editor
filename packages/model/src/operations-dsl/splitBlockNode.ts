import { defineOperationDSL } from '../operations/define-operation-dsl';

type SplitBlockNodeOperation =
  | { type: 'splitBlockNode'; nodeId: string; splitPosition: number }
  | { type: 'splitBlockNode'; splitPosition: number };

export const splitBlockNode = defineOperationDSL(
  (...args: [number] | [string, number]) => {
    if (args.length === 1) {
      const [splitPosition] = args as [number];
      return { type: 'splitBlockNode', payload: { splitPosition } } as unknown as SplitBlockNodeOperation;
    }
    const [nodeId, splitPosition] = args as [string, number];
    return { type: 'splitBlockNode', payload: { nodeId, splitPosition } } as unknown as SplitBlockNodeOperation;
  },
  { atom: false, category: 'block' }
);


