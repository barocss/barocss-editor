import { defineOperationDSL } from '../operations/define-operation-dsl';
import type { INode } from '../types';

export const paste = defineOperationDSL(
  (nodes: INode[], range: any) => ({
    type: 'paste',
    payload: {
      data: { nodes },
      range
    }
  }),
  { atom: true, category: 'clipboard' }
);


