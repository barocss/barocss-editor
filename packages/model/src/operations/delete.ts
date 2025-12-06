import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * Node deletion Operation
 * 
 * Utilizes new DataStore features:
 * 1. Subtree deletion (recursively deletes child nodes)
 * 2. Automatic parent-child relationship cleanup
 * 3. Atomic Operation event emission
 * 4. Root node management
 */
defineOperation('delete', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId } = operation.payload as { nodeId: string };
    
    try {
      // 1. DataStore update
      let nodeToDelete = context.dataStore.getNode(nodeId);
      if (!nodeToDelete) {
        // Fallback: if target equals current root but node lookup fails, adjust root and exit
        const currentRoot = context.dataStore.getRootNodeId?.();
        if (currentRoot === nodeId) {
          // Policy: root node cannot be deleted
          throw new Error('Cannot delete root node');
        }
        throw new Error(`Node with id '${nodeId}' not found`);
      }

      // Policy: root node cannot be deleted
      const rootId = context.dataStore.getRootNodeId?.();
      if (rootId && rootId === nodeId) {
        throw new Error('Cannot delete root node');
      }
      
      // Subtree deletion (recursively deletes child nodes)
      const descendants = context.dataStore.getAllDescendants(nodeId);
      const descendantIds = descendants.map(node => node.sid!);
      
      // Delete descendant nodes in reverse order (from leaf nodes)
      for (const descendantId of descendantIds.reverse()) {
        const deleted = context.dataStore.deleteNode(descendantId);
        if (!deleted) {
          console.warn(`Failed to delete descendant node: ${descendantId}`);
        }
      }
      
      // Remove child reference from parent node
      if (nodeToDelete.parentId) {
        const parent = context.dataStore.getNode(nodeToDelete.parentId);
        if (parent) {
          const removed = context.dataStore.removeChild(nodeToDelete.parentId, nodeId);
          if (!removed) {
            console.warn(`Failed to remove child reference from parent: ${nodeToDelete.parentId}`);
          }
        }
      }
      
      // Clear selection when selected node is deleted
      if (context.selection?.current) {
        const sel = context.selection.current;
        // Clear if selection spans the node being deleted
        if (sel.startNodeId === nodeId || sel.endNodeId === nodeId) {
          context.selection.clear();
        }
      }

      // Delete main node
      const deleted = context.dataStore.deleteNode(nodeId);
      if (!deleted) {
        throw new Error(`Failed to delete node: ${nodeId}`);
      }
      
      // Set new root if root node was deleted
      const prevRoot = context.dataStore.getRootNodeId?.();
      if (prevRoot === nodeId) {
        const remainingNodes = context.dataStore.getAllNodes();
        const candidate = remainingNodes.find(n => n.sid !== nodeId);
        if (candidate) {
          context.dataStore.setRootNodeId(candidate.sid!);
        } else {
          context.dataStore.setRootNodeId(undefined);
        }
      }
      // Selection default policy: SelectionManager handles clamping/clearing as needed
      
      return {
        ok: true,
        data: true,
        inverse: { type: 'create', payload: { node: nodeToDelete } }
      };
    } catch (error) {
      throw new Error(`Failed to delete node ${nodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
