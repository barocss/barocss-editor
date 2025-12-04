import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { splitTextNode as splitTextNodeDsl } from '../../src/operations-dsl/splitTextNode';

describe('splitTextNode operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: { 'inline-text': { name: 'inline-text', content: 'text*', marks: [] } },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('splits text node', async () => {
    dataStore.setNode({ sid: 't', stype: 'inline-text', text: 'Hello' } as any);
    const op = globalOperationRegistry.get('splitTextNode');
    const result = await op!.execute({ type: 'splitTextNode', payload: { nodeId: 't', splitPosition: 2 } } as any, context);
    expect(typeof result.data).toBe('string');
  });

  describe('splitTextNode DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = splitTextNodeDsl('t', 2);
      expect(dsl).toEqual({ type: 'splitTextNode', payload: { nodeId: 't', splitPosition: 2 } });
    });
    it('builds descriptor (control)', () => {
      const dsl = splitTextNodeDsl(2);
      expect(dsl).toEqual({ type: 'splitTextNode', payload: { splitPosition: 2 } });
    });
  });
});


