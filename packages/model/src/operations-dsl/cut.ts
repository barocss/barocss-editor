import { defineOperationDSL } from '../operations/define-operation-dsl';

export const cut = defineOperationDSL(
  (range: any) => ({
    type: 'cut',
    payload: { range }
  }),
  { atom: true, category: 'clipboard' }
);


