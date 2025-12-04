import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { removeChildren as removeChildrenDsl } from '../../src/operations-dsl/removeChildren';

describe('removeChildren operation (exec)', () => {
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

  it('removes multiple children from parent', async () => {
    dataStore.setNode({ id: 'p', type: 'paragraph', content: ['a', 'b', 'c'] } as any);
    dataStore.setNode({ id: 'a', type: 'inline-text', text: 'A', parentId: 'p' });
    dataStore.setNode({ id: 'b', type: 'inline-text', text: 'B', parentId: 'p' });
    dataStore.setNode({ id: 'c', type: 'inline-text', text: 'C', parentId: 'p' });
    const op = globalOperationRegistry.get('removeChildren');
    await op!.execute({ type: 'removeChildren', payload: { parentId: 'p', childIds: ['a', 'c'] } } as any, context);
    const p = dataStore.getNode('p');
    expect(p?.content).toEqual(['b']);
  });

  it('throws when parent does not exist', async () => {
    const op = globalOperationRegistry.get('removeChildren');
    await expect(op!.execute({ type: 'removeChildren', payload: { parentId: 'nope', childIds: [] } } as any, context)).rejects.toThrow('Parent not found');
  });

  describe('removeChildren DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = removeChildrenDsl('p', ['a', 'b']);
      expect(dsl).toEqual({ type: 'removeChildren', payload: { parentId: 'p', childIds: ['a', 'b'] } });
    });
    it('builds descriptor (control)', () => {
      const dsl = removeChildrenDsl(['a', 'b']);
      expect(dsl).toEqual({ type: 'removeChildren', payload: { childIds: ['a', 'b'] } });
    });
  });
});


