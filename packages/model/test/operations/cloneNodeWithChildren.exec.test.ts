import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { cloneNodeWithChildren as cloneNodeWithChildrenDsl } from '../../src/operations-dsl/cloneNodeWithChildren';

describe('cloneNodeWithChildren operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        paragraph: { name: 'paragraph', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('clones node with children into a parent', async () => {
    dataStore.setNode({ id: 'p', type: 'paragraph', content: ['t'] } as any);
    dataStore.setNode({ id: 't', type: 'inline-text', text: 'X', parentId: 'p' });
    const op = globalOperationRegistry.get('cloneNodeWithChildren');
    const newNode = await op!.execute({ type: 'cloneNodeWithChildren', payload: { nodeId: 'p' } } as any, context);
    expect(newNode).toBeTruthy();
  });

  it('throws when source node does not exist', async () => {
    const op = globalOperationRegistry.get('cloneNodeWithChildren');
    await expect(op!.execute({ type: 'cloneNodeWithChildren', payload: { nodeId: 'nope' } } as any, context)).rejects.toThrow('Node not found');
  });

  describe('cloneNodeWithChildren DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = cloneNodeWithChildrenDsl('p', 'root');
      expect(dsl).toEqual({ type: 'cloneNodeWithChildren', payload: { nodeId: 'p', newParentId: 'root' } });
    });
    it('builds descriptor (control)', () => {
      const dsl = cloneNodeWithChildrenDsl('root');
      expect(dsl).toEqual({ type: 'cloneNodeWithChildren', payload: { newParentId: 'root' } });
    });
  });
});


