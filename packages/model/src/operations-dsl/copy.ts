import { defineOperationDSL } from '../operations/define-operation-dsl';

export const copy = defineOperationDSL(
  (range: any) => ({
    type: 'copy',
    payload: { range }
  }),
  { atom: true, category: 'clipboard' }
);


