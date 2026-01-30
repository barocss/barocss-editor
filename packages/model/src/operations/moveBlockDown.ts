import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

/**
 * moveBlockDown operation (DSL + runtime)
 *
 * Moves a block node down within the same parent.
 * 
 * - moveBlockDown(nodeId) → { type: 'moveBlockDown', payload: { nodeId } }
 * - control(nodeId, [ moveBlockDown() ]) → { type: 'moveBlockDown', payload: {} }
 */
export const moveBlockDown = defineOperationDSL(
  (nodeId?: string) => {
    if (nodeId) {
      return { type: 'moveBlockDown', payload: { nodeId } } as any;
    }
    return { type: 'moveBlockDown', payload: {} } as any;
  },
  { atom: false, category: 'content' }
);

// Runtime operation implementation
defineOperation('moveBlockDown', async (operation: any, context: TransactionContext) => {
  const { nodeId } = operation.payload;
  
  if (!nodeId) {
    throw new Error('Node ID is required for moveBlockDown operation');
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

  // Cannot move if already at last position
  if (currentIndex === parent.content.length - 1) {
    return {
      ok: false,
      data: null,
      error: 'Cannot move block down: already at last position'
    };
  }

  const success = context.dataStore.moveBlockDown(nodeId);
  if (!success) {
    return {
      ok: false,
      data: null,
      error: 'Failed to move block down'
    };
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { 
      type: 'moveBlockUp', 
      payload: { nodeId } 
    }
  };
});

