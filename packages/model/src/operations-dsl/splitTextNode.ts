import { defineOperationDSL } from '../operations/define-operation-dsl';

type SplitTextNodeOperation =
  | { type: 'splitTextNode'; nodeId: string; splitPosition: number }
  | { type: 'splitTextNode'; splitPosition: number };

export const splitTextNode = defineOperationDSL(
  (...args: [number] | [string, number]) => {
    if (args.length === 1) {
      const [splitPosition] = args as [number];
      return { type: 'splitTextNode', payload: { splitPosition } } as unknown as SplitTextNodeOperation;
    }
    const [nodeId, splitPosition] = args as [string, number];
    return { type: 'splitTextNode', payload: { nodeId, splitPosition } } as unknown as SplitTextNodeOperation;
  },
  { atom: true, category: 'text' }
);


