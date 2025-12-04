import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { removeChild as removeChildDsl } from '../../src/operations-dsl/removeChild';

describe('removeChild operation (exec)', () => {
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

  it('removes child from parent', async () => {
    dataStore.setNode({ id: 'p', type: 'paragraph', content: ['t'] } as any);
    dataStore.setNode({ id: 't', type: 'inline-text', text: 'X', parentId: 'p' });
    const op = globalOperationRegistry.get('removeChild');
    const result = await op!.execute({ type: 'removeChild', payload: { parentId: 'p', childId: 't' } } as any, context);
    expect(result.data?.content).toEqual([]);
  });

  it('throws when parent does not exist', async () => {
    const op = globalOperationRegistry.get('removeChild');
    await expect(op!.execute({ type: 'removeChild', payload: { parentId: 'nope', childId: 'x' } } as any, context)).rejects.toThrow('Parent not found');
  });

  describe('removeChild DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = removeChildDsl('p', 't');
      expect(dsl).toEqual({ type: 'removeChild', payload: { parentId: 'p', childId: 't' } });
    });
    it('builds descriptor (control)', () => {
      const dsl = removeChildDsl('t');
      expect(dsl).toEqual({ type: 'removeChild', payload: { childId: 't' } });
    });
  });
});


