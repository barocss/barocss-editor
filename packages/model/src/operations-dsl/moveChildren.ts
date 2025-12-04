import { defineOperationDSL } from '../operations/define-operation-dsl';

type MoveChildrenPayload =
  | { type: 'moveChildren'; fromParentId: string; toParentId: string; childIds: string[]; position?: number }
  | { type: 'moveChildren'; toParentId: string; childIds: string[]; position?: number };

export const moveChildren = defineOperationDSL(
  (...args: [string, string, string[], number?] | [string, string[], number?]) => {
    if (typeof args[0] === 'string' && typeof args[1] === 'string' && Array.isArray(args[2])) {
      const [fromParentId, toParentId, childIds, position] = args as [string, string, string[], number?];
      return { type: 'moveChildren', payload: { fromParentId, toParentId, childIds, position } } as unknown as MoveChildrenPayload;
    }
    const [toParentId, childIds, position] = args as [string, string[], number?];
    return { type: 'moveChildren', payload: { toParentId, childIds, position } } as unknown as MoveChildrenPayload;
  },
  { atom: false, category: 'structure' }
);


