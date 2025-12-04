import { defineOperationDSL } from '../operations/define-operation-dsl';

type DeleteOperation = { type: 'delete'; nodeId: string };

export const deleteOp = defineOperationDSL(
  (nodeId: string) => ({ type: 'delete', payload: { nodeId } } as unknown as DeleteOperation),
  { atom: true, category: 'structure' }
);


