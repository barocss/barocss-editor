import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { mergeBlockNodes as mergeBlockNodesDsl } from '../../src/operations-dsl/mergeBlockNodes';

describe('mergeBlockNodes operation (exec)', () => {
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

  it('merges two adjacent blocks of same type', async () => {
    const a = { id: 'a', type: 'paragraph', content: [] } as any;
    const b = { id: 'b', type: 'paragraph', content: [] } as any;
    dataStore.setNode(a);
    dataStore.setNode(b);
    dataStore.setNode({ id: 'root', type: 'paragraph', content: ['a', 'b'] } as any);

    const op = globalOperationRegistry.get('mergeBlockNodes');
    const result = await op!.execute({ type: 'mergeBlockNodes', payload: { leftNodeId: 'a', rightNodeId: 'b' } } as any, context);
    expect(result.data).toBe('a');
  });

  it('throws on different types', async () => {
    dataStore.setNode({ id: 'a', type: 'paragraph', content: [] } as any);
    dataStore.setNode({ id: 'b', type: 'inline-text', text: '' } as any);
    const op = globalOperationRegistry.get('mergeBlockNodes');
    await expect(op!.execute({ type: 'mergeBlockNodes', payload: { leftNodeId: 'a', rightNodeId: 'b' } } as any, context)).rejects.toThrow();
  });

  describe('mergeBlockNodes DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = mergeBlockNodesDsl('a', 'b');
      expect(dsl).toEqual({ type: 'mergeBlockNodes', payload: { leftNodeId: 'a', rightNodeId: 'b' } });
    });
    it('builds descriptor (control)', () => {
      const dsl = mergeBlockNodesDsl('b');
      expect(dsl).toEqual({ type: 'mergeBlockNodes', payload: { rightNodeId: 'b' } });
    });
  });
});


