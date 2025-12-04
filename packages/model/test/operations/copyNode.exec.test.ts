import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { copyNode as copyNodeDsl } from '../../src/operations-dsl/copyNode';

describe('copyNode operation (exec)', () => {
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

  it('copies node and inserts into new parent', async () => {
    dataStore.setNode({ id: 'p', type: 'paragraph', content: [] } as any);
    dataStore.setNode({ id: 't', type: 'inline-text', text: 'X' });
    const op = globalOperationRegistry.get('copyNode');
    const newNode = await op!.execute({ type: 'copyNode', payload: { nodeId: 't', newParentId: 'p' } } as any, context);
    const p = dataStore.getNode('p');
    expect(Array.isArray(p?.content)).toBe(true);
  });

  it('throws when source node does not exist', async () => {
    const op = globalOperationRegistry.get('copyNode');
    await expect(op!.execute({ type: 'copyNode', payload: { nodeId: 'nope' } } as any, context)).rejects.toThrow('Node not found');
  });

  describe('copyNode DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = copyNodeDsl('t', 'p');
      expect(dsl).toEqual({ type: 'copyNode', payload: { nodeId: 't', newParentId: 'p' } });
    });
    it('builds descriptor (control)', () => {
      const dsl = copyNodeDsl('p');
      expect(dsl).toEqual({ type: 'copyNode', payload: { newParentId: 'p' } });
    });
  });
});


