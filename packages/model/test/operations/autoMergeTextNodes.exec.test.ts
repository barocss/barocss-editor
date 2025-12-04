import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { autoMergeTextNodes as autoMergeTextNodesDsl } from '../../src/operations-dsl/autoMergeTextNodes';

describe('autoMergeTextNodes operation (exec)', () => {
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

  it('auto merges adjacent text nodes around a target node', async () => {
    dataStore.setNode({ id: 'p', type: 'paragraph', content: ['a', 't', 'b'] } as any);
    dataStore.setNode({ id: 'a', type: 'inline-text', text: 'A' });
    dataStore.setNode({ id: 't', type: 'inline-text', text: 'T' });
    dataStore.setNode({ id: 'b', type: 'inline-text', text: 'B' });
    const op = globalOperationRegistry.get('autoMergeTextNodes');
    const result = await op!.execute({ type: 'autoMergeTextNodes', payload: { nodeId: 't' } } as any, context);
    expect(typeof result.data).toBe('string');
  });

  describe('autoMergeTextNodes DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = autoMergeTextNodesDsl('t');
      expect(dsl).toEqual({ type: 'autoMergeTextNodes', payload: { nodeId: 't' } });
    });
    it('builds descriptor (control)', () => {
      const dsl = autoMergeTextNodesDsl();
      expect(dsl).toEqual({ type: 'autoMergeTextNodes', payload: {} });
    });
  });
});


