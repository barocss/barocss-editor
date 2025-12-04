import { defineOperationDSL } from '../operations/define-operation-dsl';

type CloneNodeWithChildrenPayload =
  | { type: 'cloneNodeWithChildren'; nodeId: string; newParentId?: string }
  | { type: 'cloneNodeWithChildren'; newParentId: string };

export const cloneNodeWithChildren = defineOperationDSL(
  (...args: [string, string?] | [string]) => {
    if (args.length >= 2) {
      const [nodeId, newParentId] = args as [string, string?];
      return { type: 'cloneNodeWithChildren', payload: { nodeId, newParentId } } as unknown as CloneNodeWithChildrenPayload;
    }
    const [newParentId] = args as [string];
    return { type: 'cloneNodeWithChildren', payload: { newParentId } } as unknown as CloneNodeWithChildrenPayload;
  },
  { atom: false, category: 'structure' }
);


