import { defineOperationDSL } from '../operations/define-operation-dsl';

export const wrapInBlockquote = defineOperationDSL(
  () => ({ type: 'wrapInBlockquote', payload: {} }),
  { atom: false, category: 'content' }
);
