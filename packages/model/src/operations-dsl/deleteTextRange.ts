import { defineOperationDSL } from '../operations/define-operation-dsl';

type DeleteTextRangeOperation = { type: 'deleteTextRange'; nodeId?: string; start: number; end: number };

export const deleteTextRange = defineOperationDSL(
  (...args: [number, number] | [string, number, number]) => {
    if (args.length === 2) {
      const [start, end] = args as [number, number];
      return { type: 'deleteTextRange', payload: { start, end } } as unknown as DeleteTextRangeOperation;
    }
    const [nodeId, start, end] = args as [string, number, number];
    return { type: 'deleteTextRange', payload: { nodeId, start, end } } as unknown as DeleteTextRangeOperation;
  },
  { atom: true, category: 'text' }
);


