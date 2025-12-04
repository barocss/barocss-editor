import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { setText } from '../../src/operations/setText';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('setText operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': { name: 'inline-text', content: 'text*', marks: ['bold', 'italic'], attrs: { class: { type: 'string', default: null } } },
        paragraph: { name: 'paragraph', content: 'inline-text*', attrs: { class: { type: 'string', default: null } } }
      },
      marks: { bold: { name: 'bold' }, italic: { name: 'italic' } }
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('should update text content on existing node', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Old' } as any);
    const op = globalOperationRegistry.get('setText');
    expect(op).toBeDefined();

    const result = await op!.execute({ type: 'setText', payload: { nodeId: 't1', text: 'New Text' } } as any, context);
    expect(result).toBeTruthy();
    const updated = dataStore.getNode('t1');
    expect(updated?.text).toBe('New Text');
  });

  describe('setText operation DSL', () => {
    it('should build a setText descriptor from DSL', () => {
      const op = setText('Hello World');
      expect(op).toEqual({
        type: 'setText',
        payload: { text: 'Hello World' }
      });
    });
  });
    
});


