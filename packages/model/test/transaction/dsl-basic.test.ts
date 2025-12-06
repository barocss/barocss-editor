import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { Editor, SelectionManager } from '@barocss/editor-core';
import { transaction, control, node, textNode, mark, op } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';

describe('DSL Basic Operations', () => {
  let dataStore: DataStore;
  let mockEditor: Editor;

  beforeEach(() => {
    // Create a simple schema
    const schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
        'inline-text': { name: 'inline-text', content: 'text*', group: 'inline' }
      },
      topNode: 'document'
    });

    dataStore = new DataStore(undefined, schema);

    mockEditor = new Editor({
      dataStore,
      schema
    });
  });

  it('should create a simple text node', async () => {
    const result = await transaction(mockEditor, [
      create(textNode('inline-text', 'Hello World'))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe('create');
  });

  it('should create a paragraph with text', async () => {
    const result = await transaction(mockEditor, [
      create(node('paragraph', {}, [
        textNode('inline-text', 'Hello World')
      ]))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
  });

  it('should use control to set text on a node', async () => {
    // First create a text node
    const createResult = await transaction(mockEditor, [
      create(textNode('inline-text', 'Initial'))
    ]).commit();

    expect(createResult.success).toBe(true);
    const nodeId = createResult.operations[0].result.data.sid;

    // Then use control to modify it
    const result = await transaction(mockEditor, [
      control(nodeId, [
        { type: 'setText', payload: { text: 'Updated Text' } }
      ])
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe('setText');
    expect(result.operations[0].payload.text).toBe('Updated Text');
  });

  it('should use op function for complex operations', async () => {
    const result = await transaction(mockEditor, [
      op(async (ctx) => {
        // Use DataStore directly
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'Hello from op function'),
          ctx.schema
        );
        
        return {
          success: true,
          data: node
        };
      })
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(0); // OpResult does not create operations
  });

  it('should use op function with simple logic', async () => {
    const result = await transaction(mockEditor, [
      op(async (ctx) => {
        // Simple conditional logic
        const shouldCreate = true;
        if (shouldCreate) {
          const node = ctx.dataStore.createNodeWithChildren(
            textNode('inline-text', 'Conditional text'),
            ctx.schema
          );
          return {
            success: true,
            data: node
          };
        } else {
          return {
            success: false,
            error: 'Should not create'
          };
        }
      })
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(0);
  });

  it('should create text with marks', async () => {
    const result = await transaction(mockEditor, [
      create(textNode('inline-text', 'Bold Text', [
        mark('bold', { weight: 'bold' })
      ]))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
  });

  it('should handle multiple operations in one transaction', async () => {
    const result = await transaction(mockEditor, [
      create(textNode('inline-text', 'First')),
      create(textNode('inline-text', 'Second'))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(2);
  });

  it('should handle op function with no return value', async () => {
    const result = await transaction(mockEditor, [
      op(async (ctx) => {
        // Return nothing
      })
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(0); // No operations if nothing is returned
  });


  it('should handle op function returning OpResult with inverse', async () => {
    const result = await transaction(mockEditor, [
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'With inverse'),
          ctx.schema
        );
        
        return {
          success: true,
          data: node,
          inverse: {
            type: 'delete',
            payload: { nodeId: node.sid }
          }
        };
      })
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(0); // OpResult does not create operations (inverse is used later for undo)
  });

  it('should stop execution when op function returns success: false', async () => {
    const result = await transaction(mockEditor, [
      // First op - success
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'First node'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // Second op - failure
      op(async (ctx) => {
        return { success: false, error: 'Second op failed' };
      }),
      
      // Third op - should not execute
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'Third node - should not be created'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // Regular operation - should not execute
      create(textNode('inline-text', 'Fourth node - should not be created'))
    ]).commit();

    // Entire transaction should fail
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Second op failed');
    expect(result.operations).toHaveLength(0);
  });

  it('should stop execution when op function throws error', async () => {
    const result = await transaction(mockEditor, [
      // First op - success
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'First node'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // Second op - error thrown
      op(async (ctx) => {
        throw new Error('Op function threw error');
      }),
      
      // Third op - should not execute
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'Third node - should not be created'),
          ctx.schema
        );
        return { success: true, data: node };
      })
    ]).commit();

    // Entire transaction should fail
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Op function threw error');
    expect(result.operations).toHaveLength(0);
  });

  it('should continue execution when op function returns success: true', async () => {
    const result = await transaction(mockEditor, [
      // First op - success
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'First node'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // Second op - success
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'Second node'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // Regular operation - should execute
      create(textNode('inline-text', 'Third node'))
    ]).commit();

    // Entire transaction should succeed
    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1); // Only create operation is added to operations
  });
});
