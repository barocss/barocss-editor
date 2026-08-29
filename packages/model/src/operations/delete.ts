import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';
import { subtreeOf } from './subtree';


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
      
      /**
       * **What was in it**, captured while it is still there — which is the whole of this fix.
       *
       * The comment further down records mending this inverse once already: it used to be a `create`
       * that left the node unattached, so a parent and an index were added to it. What nobody looked
       * at was the node's *contents*. `getNode` hands back a node whose `content` is a list of sids,
       * and the next three lines delete every one of those descendants — so the inverse put the node
       * back **empty**. Delete a paragraph, press undo, and the paragraph returns without its words.
       *
       * Here rather than beside the inverse for the reason the fix took two goes: written down there
       * it ran *after* the loop below, and captured a node whose children were already gone. The
       * capture has to happen before the deletion it is the record of.
       *
       * Everything about the fault looked right, which is why it lasted: the delete works, the undo
       * runs, the node reappears, the count is correct, and no test had ever looked inside one. It
       * was found by asking a different question — the extensions' conformance run puts every
       * command through *move the document, undo it, compare* — which that check's own documentation
       * calls two answers for the price of one.
       */
      const restoreTree = subtreeOf(context, nodeId) ?? nodeToDelete;

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
                payload: { parentId: restoreParentId, child: restoreTree, position: restoreIndex }
              }
            : { type: 'create', payload: { node: restoreTree } }
      };
    } catch (error) {
      throw new Error(`Failed to delete node ${nodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
