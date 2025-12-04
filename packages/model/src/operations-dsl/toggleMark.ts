import { defineOperationDSL } from '../operations/define-operation-dsl';

export const toggleMark = defineOperationDSL(
  (
    ...args:
      | [string, [number, number], (Record<string, any>)?]
      | [string, string, [number, number], (Record<string, any>)?]
  ) => {
    if (args.length >= 2 && typeof args[0] === 'string' && Array.isArray(args[1])) {
      const [markType, range, attrs] = args as [string, [number, number], (Record<string, any>)?];
      return { type: 'toggleMark', payload: { markType, range, attrs } };
    }
    const [nodeId, markType, range, attrs] = args as [string, string, [number, number], (Record<string, any>)?];
    return { type: 'toggleMark', payload: { nodeId, markType, range, attrs } };
  },
  { atom: false, category: 'marks' }
);


