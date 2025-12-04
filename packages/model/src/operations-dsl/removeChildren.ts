import { defineOperationDSL } from '../operations/define-operation-dsl';

type RemoveChildrenOperation =
  | { type: 'removeChildren'; parentId: string; childIds: string[] }
  | { type: 'removeChildren'; childIds: string[] };

export const removeChildren = defineOperationDSL(
  (...args: [string, string[]] | [string[]]) => {
    if (args.length === 1) {
      const [childIds] = args as [string[]];
      return { type: 'removeChildren', payload: { childIds } } as unknown as RemoveChildrenOperation;
    }
    const [parentId, childIds] = args as [string, string[]];
    return { type: 'removeChildren', payload: { parentId, childIds } } as unknown as RemoveChildrenOperation;
  },
  { atom: true, category: 'structure' }
);


