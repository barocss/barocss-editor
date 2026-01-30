import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

interface UpdateOperation {
  type: 'update';
  payload: { nodeId: string; data: Record<string, unknown> };
}

/**
 * Node update operation
 * 
 * Updates properties, text, content, attributes, etc. of an existing node.
 * Uses DataStore's updateNode method for efficient processing.
 */
defineOperation('update', async (operation: UpdateOperation, context: TransactionContext) => {
  const { nodeId, data: updates } = operation.payload;
  
  // 1. Check if existing node exists
  const existingNode = context.dataStore.getNode(nodeId);
  if (!existingNode) {
    throw new Error(`Node with id '${nodeId}' not found`);
  }
  
  // 2. Use DataStore's updateNode method
  // This method automatically handles attribute merging, validation, timestamp updates, etc.
  const result = context.dataStore.updateNode(nodeId, updates);
  
  // 3. Throw error if validation fails
  if (result && !result.valid) {
    throw new Error(`Update failed: ${result.errors.join(', ')}`);
  }
  
  // 4. Return updated node (OperationExecuteResult structure)
  const updatedNode = context.dataStore.getNode(nodeId);
  return {
    ok: true,
    data: updatedNode,
    inverse: { type: 'update', payload: { nodeId, data: existingNode } }
  };
});

export const update = defineOperationDSL(
  (updates: Record<string, any>) => ({
    type: 'update',
    payload: { updates }
  }),
  { atom: false, category: 'content' }
);
