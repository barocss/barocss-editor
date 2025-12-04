import { defineOperationDSL } from '../operations/define-operation-dsl';

type MoveNodePayload =
  | { type: 'moveNode'; nodeId: string; newParentId: string; position?: number }
  | { type: 'moveNode'; newParentId: string; position?: number };

export const moveNode = defineOperationDSL(
  (...args: [string, string, number?] | [string, number?]) => {
    if (typeof args[0] === 'string' && typeof args[1] === 'string') {
      const [nodeId, newParentId, position] = args as [string, string, number?];
      return { type: 'moveNode', payload: { nodeId, newParentId, position } } as unknown as MoveNodePayload;
    }
    const [newParentId, position] = args as [string, number?];
    return { type: 'moveNode', payload: { newParentId, position } } as unknown as MoveNodePayload;
  },
  { atom: false, category: 'structure' }
);


