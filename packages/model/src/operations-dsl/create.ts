import { defineOperationDSL } from '../operations/define-operation-dsl';
import type { INode } from '@barocss/datastore';

type CreateOperation = { type: 'create'; payload: { node: INode; options?: any } };

export const create = defineOperationDSL(
  (node: INode, options?: any) => ({ type: 'create', payload: { node, options } } as unknown as CreateOperation),
  { atom: false, category: 'structure' }
);


