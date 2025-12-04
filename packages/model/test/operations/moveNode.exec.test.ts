import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { moveNode as moveNodeDsl } from '../../src/operations-dsl/moveNode';

describe('moveNode operation (exec)', () => {
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

  it('moves node to new parent at a position', async () => {
    dataStore.setNode({ id: 'p1', type: 'paragraph', content: [] } as any);
    dataStore.setNode({ id: 'p2', type: 'paragraph', content: [] } as any);
    dataStore.setNode({ id: 't', type: 'inline-text', text: 'X', parentId: 'p1' });
    const op = globalOperationRegistry.get('moveNode');
    await op!.execute({ type: 'moveNode', payload: { nodeId: 't', newParentId: 'p2', position: 0 } } as any, context);
    const p2 = dataStore.getNode('p2');
    expect(p2?.content?.[0]).toBe('t');
  });

  it('throws when new parent does not exist', async () => {
    dataStore.setNode({ id: 't', type: 'inline-text', text: 'X' });
    const op = globalOperationRegistry.get('moveNode');
    await expect(op!.execute({ type: 'moveNode', payload: { nodeId: 't', newParentId: 'nope' } } as any, context)).rejects.toThrow('Parent not found');
  });

  describe('moveNode DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = moveNodeDsl('t', 'p2', 1);
      expect(dsl).toEqual({ type: 'moveNode', payload: { nodeId: 't', newParentId: 'p2', position: 1 } });
    });
    it('builds descriptor (control)', () => {
      const dsl = moveNodeDsl('p2', 0);
      expect(dsl).toEqual({ type: 'moveNode', payload: { newParentId: 'p2', position: 0 } });
    });
  });
});


