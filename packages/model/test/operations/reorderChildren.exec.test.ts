import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { reorderChildren as reorderChildrenDsl } from '../../src/operations-dsl/reorderChildren';

describe('reorderChildren operation (exec)', () => {
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

  it('reorders children by specific ids', async () => {
    dataStore.setNode({ id: 'p', type: 'paragraph', content: ['a', 'b', 'c'] } as any);
    dataStore.setNode({ id: 'a', type: 'inline-text', text: 'A' });
    dataStore.setNode({ id: 'b', type: 'inline-text', text: 'B' });
    dataStore.setNode({ id: 'c', type: 'inline-text', text: 'C' });
    const op = globalOperationRegistry.get('reorderChildren');
    await op!.execute({ type: 'reorderChildren', payload: { parentId: 'p', childIds: ['c', 'a', 'b'] } } as any, context);
    const p = dataStore.getNode('p');
    expect(p?.content).toEqual(['c', 'a', 'b']);
  });

  it('throws when parent does not exist', async () => {
    const op = globalOperationRegistry.get('reorderChildren');
    await expect(op!.execute({ type: 'reorderChildren', payload: { parentId: 'nope', childIds: [] } } as any, context)).rejects.toThrow('Parent not found');
  });

  describe('reorderChildren DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = reorderChildrenDsl('p', ['c', 'a', 'b']);
      expect(dsl).toEqual({ type: 'reorderChildren', payload: { parentId: 'p', childIds: ['c', 'a', 'b'] } });
    });
    it('builds descriptor (control)', () => {
      const dsl = reorderChildrenDsl(['b', 'a', 'c']);
      expect(dsl).toEqual({ type: 'reorderChildren', payload: { childIds: ['b', 'a', 'c'] } });
    });
  });
});


