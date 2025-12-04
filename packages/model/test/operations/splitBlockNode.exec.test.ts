import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { splitBlockNode as splitBlockNodeDsl } from '../../src/operations-dsl/splitBlockNode';

describe('splitBlockNode operation (exec)', () => {
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

  it('splits a block at position', async () => {
    dataStore.setNode({ sid: 'p', stype: 'paragraph', content: ['t1', 't2'] } as any);
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', parentId: 'p' } as any);
    dataStore.setNode({ sid: 't2', stype: 'inline-text', text: 'B', parentId: 'p' } as any);
    const op = globalOperationRegistry.get('splitBlockNode');
    const result = await op!.execute({ type: 'splitBlockNode', payload: { nodeId: 'p', splitPosition: 1 } } as any, context);
    expect(typeof result.data).toBe('string');
  });

  describe('splitBlockNode DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = splitBlockNodeDsl('p', 1);
      expect(dsl).toEqual({ type: 'splitBlockNode', payload: { nodeId: 'p', splitPosition: 1 } });
    });
    it('builds descriptor (control)', () => {
      const dsl = splitBlockNodeDsl(1);
      expect(dsl).toEqual({ type: 'splitBlockNode', payload: { splitPosition: 1 } });
    });
  });
});


