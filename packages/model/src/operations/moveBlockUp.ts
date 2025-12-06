import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

/**
 * moveBlockUp operation (DSL + runtime)
 *
 * Moves a block node up within the same parent.
 * 
 * - moveBlockUp(nodeId) → { type: 'moveBlockUp', payload: { nodeId } }
 * - control(nodeId, [ moveBlockUp() ]) → { type: 'moveBlockUp', payload: {} }
 */
export const moveBlockUp = defineOperationDSL(
  (nodeId?: string) => {
    if (nodeId) {
      return { type: 'moveBlockUp', payload: { nodeId } };
    }
    return { type: 'moveBlockUp', payload: {} };
  },
  { atom: false, category: 'content' }
);

// Runtime operation implementation
defineOperation('moveBlockUp', async (operation: any, context: TransactionContext) => {
  const { nodeId } = operation.payload;
  
  if (!nodeId) {
    throw new Error('Node ID is required for moveBlockUp operation');
  }

  const node = context.dataStore.getNode(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  if (!node.parentId) {
    throw new Error(`Node ${nodeId} has no parent`);
  }

  const parent = context.dataStore.getNode(node.parentId);
  if (!parent || !Array.isArray(parent.content)) {
    throw new Error(`Parent node not found or has no content: ${node.parentId}`);
  }

  const currentIndex = parent.content.indexOf(nodeId);
  if (currentIndex === -1) {
    throw new Error(`Node ${nodeId} not found in parent content`);
  }

  // Cannot move if already at first position
  if (currentIndex === 0) {
    return {
      ok: false,
      data: null,
      error: 'Cannot move block up: already at first position'
    };
  }

  const success = context.dataStore.moveBlockUp(nodeId);
  if (!success) {
    return {
      ok: false,
      data: null,
      error: 'Failed to move block up'
    };
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { 
      type: 'moveBlockDown', 
      payload: { nodeId } 
    }
  };
});

