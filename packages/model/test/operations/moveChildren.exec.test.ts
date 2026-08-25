import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { moveChildren as moveChildrenDsl } from '../../src/operations/moveChildren';

describe('moveChildren operation (exec)', () => {
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

  it('moves multiple children to another parent', async () => {
    dataStore.setNode({ sid: 'p1', stype: 'paragraph', content: ['a', 'b', 'c'] } as any);
    dataStore.setNode({ sid: 'p2', stype: 'paragraph', content: [] } as any);
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'A', parentId: 'p1' });
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'B', parentId: 'p1' });
    dataStore.setNode({ sid: 'c', stype: 'inline-text', text: 'C', parentId: 'p1' });
    const op = globalOperationRegistry.get('moveChildren');
    await op!.execute({ type: 'moveChildren', payload: { fromParentId: 'p1', toParentId: 'p2', childIds: ['b', 'c'], position: 0 } } as any, context);
    const p2 = dataStore.getNode('p2');
    expect(p2?.content).toEqual(['b', 'c']);
  });

  it('throws when toParent does not exist', async () => {
    dataStore.setNode({ sid: 'p1', stype: 'paragraph', content: [] } as any);
    const op = globalOperationRegistry.get('moveChildren');
    await expect(op!.execute({ type: 'moveChildren', payload: { fromParentId: 'p1', toParentId: 'nope', childIds: [] } } as any, context)).rejects.toThrow('Parent not found');
  });

  describe('moveChildren DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = moveChildrenDsl('p1', 'p2', ['x', 'y'], 1);
      expect(dsl).toEqual({ type: 'moveChildren', payload: { fromParentId: 'p1', toParentId: 'p2', childIds: ['x', 'y'], position: 1 } });
    });
    it('builds descriptor (control)', () => {
      const dsl = moveChildrenDsl('p2', ['x', 'y'], 1);
      expect(dsl).toEqual({ type: 'moveChildren', payload: { toParentId: 'p2', childIds: ['x', 'y'], position: 1 } });
    });
  });
});


