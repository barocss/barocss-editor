import { defineOperationDSL } from '../operations/define-operation-dsl';

type CopyNodePayload =
  | { type: 'copyNode'; nodeId: string; newParentId?: string }
  | { type: 'copyNode'; newParentId: string };

export const copyNode = defineOperationDSL(
  (...args: [string, string?] | [string]) => {
    if (args.length >= 2) {
      const [nodeId, newParentId] = args as [string, string?];
      return { type: 'copyNode', payload: { nodeId, newParentId } } as unknown as CopyNodePayload;
    }
    const [newParentId] = args as [string];
    return { type: 'copyNode', payload: { newParentId } } as unknown as CopyNodePayload;
  },
  { atom: false, category: 'structure' }
);


