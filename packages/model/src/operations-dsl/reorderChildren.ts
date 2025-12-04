import { defineOperationDSL } from '../operations/define-operation-dsl';

type ReorderChildrenPayload =
  | { type: 'reorderChildren'; parentId: string; childIds: string[] }
  | { type: 'reorderChildren'; childIds: string[] };

export const reorderChildren = defineOperationDSL(
  (...args: [string, string[]] | [string[]]) => {
    if (Array.isArray(args[1])) {
      const [parentId, childIds] = args as [string, string[]];
      return { type: 'reorderChildren', payload: { parentId, childIds } } as unknown as ReorderChildrenPayload;
    }
    const [childIds] = args as [string[]];
    return { type: 'reorderChildren', payload: { childIds } } as unknown as ReorderChildrenPayload;
  },
  { atom: true, category: 'structure' }
);


