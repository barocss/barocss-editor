import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';

export interface SetNodeOperation {
  type: 'setNode';
  node: INode;
  validate?: boolean;
}

/**
 * Node set/create operation
 * 
 * Sets or creates a node in DataStore.
 * Uses DataStore's setNode method for efficient processing.
 */
defineOperation('setNode', async (operation: SetNodeOperation, context: TransactionContext) => {
  const { node, validate = true } = operation;
  
  // 1. Check node ID
  if (!node.sid) {
    throw new Error('Node must have an id');
  }
  
  // 2. Use DataStore's setNode method
  // This method automatically handles ID generation, validation, timestamp updates, etc.
  context.dataStore.setNode(node, validate);
  
  // 3. Return set node
  return context.dataStore.getNode(node.sid);
});

export const setNode = defineOperationDSL(
  (node: INode, validate?: boolean) => ({
    type: 'setNode',
    payload: { node, validate }
  }),
  { atom: false, category: 'content' }
);
