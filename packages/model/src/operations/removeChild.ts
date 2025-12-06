import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * removeChild operation (DSL + runtime)
 *
 * Purpose:
 * - Removes a specific child node from parent. Uses DataStore.content.removeChild.
 *
 * Input format (DSL):
 * - control(parentId, [ removeChild(childId) ]) → payload: { childId }
 * - removeChild(parentId, childId) → payload: { parentId, childId }
 */

export interface RemoveChildOperation {
  type: 'removeChild';
  parentId: string;
  childId: string;
}

defineOperation('removeChild', async (operation: any, context: TransactionContext) => {
  // Can be passed as nodeId from control DSL, or directly as parentId
  const parentId = operation.payload.parentId || operation.payload.nodeId;
  const childId = operation.payload.childId;
  const parent = context.dataStore.getNode(parentId);
  if (!parent) throw new Error(`Parent not found: ${parentId}`);
  
  // Store child node information to remove (for inverse function)
  const childToRemove = context.dataStore.getNode(childId);
  if (!childToRemove) throw new Error(`Child not found: ${childId}`);
  
  const ok = context.dataStore.content.removeChild(parentId, childId);
  if (!ok) throw new Error(`Failed to remove child ${childId}`);
  
  return {
    ok: true,
    data: context.dataStore.getNode(parentId),
    inverse: { type: 'addChild', payload: { parentId, child: childToRemove } }
  };
});

// DSL definition will be separated into a separate file


