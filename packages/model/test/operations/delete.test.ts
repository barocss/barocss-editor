import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations'; // Register operations
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('delete operation', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    // Create schema for testing
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': {
          name: 'inline-text',
          content: 'text*',
          marks: ['bold', 'italic'],
          attrs: {
            class: { default: null, type: 'string' }
          }
        },
        'paragraph': {
          name: 'paragraph',
          content: 'inline-text*',
          attrs: {
            class: { default: null, type: 'string' }
          }
        },
        'document': {
          name: 'document',
          content: 'paragraph*',
          attrs: {}
        }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style' },
        italic: { name: 'italic', group: 'text-style' }
      }
    });
    
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('should delete a node', async () => {
    // Create node for testing
    const node = {
      sid: 'test-node',
      stype: 'inline-text',
      text: 'Hello World',
      attributes: { class: null }
    };
    dataStore.setNode(node);

    const deleteOperation = globalOperationRegistry.get('delete');
    expect(deleteOperation).toBeDefined();

    await deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'test-node' }
    } as any, context);

    const deletedNode = dataStore.getNode('test-node');
    expect(deletedNode).toBeUndefined();
  });

  it('should delete child nodes recursively', async () => {
    // Create parent node
    const parentNode = {
      sid: 'parent-node',
      stype: 'paragraph',
      content: ['child-1', 'child-2'],
      attributes: {}
    };
    dataStore.setNode(parentNode);

    // Create child nodes
    const child1 = {
      sid: 'child-1',
      stype: 'inline-text',
      text: 'Child 1',
      parentId: 'parent-node'
    };
    const child2 = {
      sid: 'child-2',
      stype: 'inline-text',
      text: 'Child 2',
      parentId: 'parent-node'
    };
    dataStore.setNode(child1);
    dataStore.setNode(child2);

    const deleteOperation = globalOperationRegistry.get('delete');
    await deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'parent-node' }
    } as any, context);

    // Verify parent and child nodes are all deleted
    expect(dataStore.getNode('parent-node')).toBeUndefined();
    expect(dataStore.getNode('child-1')).toBeUndefined();
    expect(dataStore.getNode('child-2')).toBeUndefined();
  });

  it('should remove node from parent content array', async () => {
    // Create parent node
    const parentNode = {
      sid: 'parent-node',
      stype: 'paragraph',
      content: ['child-1', 'child-2'],
      attributes: {}
    };
    dataStore.setNode(parentNode);

    // Create child node
    const childNode = {
      sid: 'child-1',
      stype: 'inline-text',
      text: 'Child 1',
      parentId: 'parent-node'
    };
    dataStore.setNode(childNode);

    const deleteOperation = globalOperationRegistry.get('delete');
    await deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'child-1' }
    } as any, context);

    const parent = dataStore.getNode('parent-node');
    expect(parent!.content).not.toContain('child-1');
    expect(parent!.content).toContain('child-2');
  });

  it('should throw error when trying to delete root node (root is immutable)', async () => {
    // Create root node
    const rootNode = {
      sid: 'root-node',
      stype: 'inline-text',
      text: 'Root content'
    };
    dataStore.setNode(rootNode);
    dataStore.setRoot('root-node');

    // Create other node
    const otherNode = {
      sid: 'other-node',
      stype: 'inline-text',
      text: 'Other content'
    };
    dataStore.setNode(otherNode);

    const deleteOperation = globalOperationRegistry.get('delete');
    await expect(deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'root-node' }
    } as any, context)).rejects.toThrow('Cannot delete root node');
    // Verify root is maintained
    expect(dataStore.getRootNodeId()).toBe('root-node');
  });

  it('should not clear root node; deleting root is forbidden', async () => {
    // Create root node
    const rootNode = {
      sid: 'root-node',
      stype: 'inline-text',
      text: 'Root content'
    };
    dataStore.setNode(rootNode);
    dataStore.setRoot('root-node');

    const deleteOperation = globalOperationRegistry.get('delete');
    await expect(deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'root-node' }
    } as any, context)).rejects.toThrow('Cannot delete root node');
    expect(dataStore.getRootNodeId()).toBe('root-node');
  });

  /**
   * Declines rather than throws when the node is already gone.
   *
   * A throw inside a transaction abandons every operation beside it, so undoing
   * a run in which something else had removed this node took the rest of the
   * undo down with it. There is nothing here to damage and nothing to do.
   */
  it('declines when the node is not there', async () => {
    const deleteOperation = globalOperationRegistry.get('delete');

    const result: any = await deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'non-existent-node' }
    } as any, context);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('non-existent-node');
  });

         describe('Selection mapping', () => {
           it('should clear selection when deleting selected node', async () => {
             // Create text node
             const textNode = {
               sid: 'text-1',
               stype: 'inline-text',
               text: 'Hello World',
               parentId: 'para-1'
             };
             dataStore.setNode(textNode);

             // Set existing selection
             const initialSelection = { type: 'range' as const, startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 10 };
             selectionManager.setSelection(initialSelection);

            const operation = {
              type: 'delete',
              payload: { nodeId: 'text-1' }
            } as any;

             // Execute operation
             const deleteOperation = globalOperationRegistry.get('delete');
             await deleteOperation!.execute(operation, context);
             
             // Verify selection is cleared in context (selectionManager is updated only when using TransactionManager)
             expect(context.selection.current).toBeNull();
           });

           it('should preserve selection when deleting different node', async () => {
             // Create two text nodes
             const textNode1 = {
               sid: 'text-1',
               stype: 'inline-text',
               text: 'Hello World',
               parentId: 'para-1'
             };
             const textNode2 = {
               sid: 'text-2',
               stype: 'inline-text',
               text: 'Goodbye World',
               parentId: 'para-1'
             };
             dataStore.setNode(textNode1);
             dataStore.setNode(textNode2);

             // Set selection for text-2
             const initialSelection = { type: 'range' as const, startNodeId: 'text-2', startOffset: 3, endNodeId: 'text-2', endOffset: 7 };
             selectionManager.setSelection(initialSelection);

            const operation = {
              type: 'delete',
              payload: { nodeId: 'text-1' } // Delete different node
            } as any;

             // Execute operation
             const deleteOperation = globalOperationRegistry.get('delete');
             await deleteOperation!.execute(operation, context);
             
             // Verify selection is preserved
             const finalSelection = selectionManager.getCurrentSelection();
             expect(finalSelection).toEqual(initialSelection);
           });

           it('should handle null selection gracefully', async () => {
             // Create text node
             const textNode = {
               sid: 'text-1',
               stype: 'inline-text',
               text: 'Hello World',
               parentId: 'para-1'
             };
             dataStore.setNode(textNode);

             // No selection state
             selectionManager.clearSelection();

            const operation = {
              type: 'delete',
              payload: { nodeId: 'text-1' }
            } as any;

             // Execute operation
             const deleteOperation = globalOperationRegistry.get('delete');
             await deleteOperation!.execute(operation, context);
             
             // Verify selection is still null
             const finalSelection = selectionManager.getCurrentSelection();
             expect(finalSelection).toBeNull();
           });
         });
});
