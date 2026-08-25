import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';


type DeleteOperation = { type: 'delete'; nodeId: string };

export const deleteOp = defineOperationDSL(
  (nodeId: string) => ({ type: 'delete', payload: { nodeId } } as unknown as DeleteOperation),
  { atom: true, category: 'structure' }
);

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
        /**
         * Already gone, which is what was asked for.
         *
         * This threw, and a throw inside a transaction abandons every operation
         * beside it — so undoing a run in which something else had removed this
         * node took the rest of the undo down with it. There is nothing here to
         * damage and nothing to do: declining says so without ending the
         * transaction.
         */
        return { ok: false, error: `delete: node '${nodeId}' is not there` };
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
      /**
       * Where it was, captured before it is taken out.
       *
       * The inverse used to be `create` with the node, which builds a node and
       * leaves it unattached — so undoing a delete left the document without
       * the thing that was deleted. Measured on the roster: deleting a run and
       * undoing it lost the run for good. Putting it back means naming its
       * parent and the index it sat at.
       */
      const restoreParentId = nodeToDelete.parentId;
      const restoreIndex = restoreParentId
        ? ((context.dataStore.getNode(restoreParentId)?.content as string[]) ?? []).indexOf(nodeId)
        : -1;

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
          (context.dataStore as any).setRootNodeId(undefined);
        }
      }
      // Selection default policy: SelectionManager handles clamping/clearing as needed
      
      return {
        ok: true,
        data: true,
        inverse:
          restoreParentId && restoreIndex >= 0
            ? {
                type: 'addChild',
                payload: { parentId: restoreParentId, child: nodeToDelete, position: restoreIndex }
              }
            : { type: 'create', payload: { node: nodeToDelete } }
      };
    } catch (error) {
      throw new Error(`Failed to delete node ${nodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
