import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { addChild as addChildDsl } from '../../src/operations-dsl/addChild';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('addChild operation (exec)', () => {
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

  it('adds child at position', async () => {
    dataStore.setNode({ id: 'p', type: 'paragraph', content: [] } as any);
    const op = globalOperationRegistry.get('addChild');
    const childNode = { type: 'inline-text', text: 'X' } as any;
    const result = await op!.execute({ type: 'addChild', payload: { parentId: 'p', child: childNode, position: 0 } } as any, context);
    expect(result.data?.text).toBe('X');
    const p = dataStore.getNode('p');
    expect(p?.content?.length).toBe(1);
  });

  it('throws when parent does not exist', async () => {
    const op = globalOperationRegistry.get('addChild');
    await expect(op!.execute({ type: 'addChild', payload: { parentId: 'nope', child: { type: 'inline-text', text: 'X' } } } as any, context))
      .rejects.toThrow('Parent not found');
  });

  describe('addChild DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = addChildDsl('p', { type: 'inline-text', text: 'A' } as any, 0);
      expect(dsl).toEqual({ type: 'addChild', payload: { parentId: 'p', child: { type: 'inline-text', text: 'A' }, position: 0 } });
    });
    it('builds descriptor (control)', () => {
      const dsl = addChildDsl({ type: 'inline-text', text: 'A' } as any, 1);
      expect(dsl).toEqual({ type: 'addChild', payload: { child: { type: 'inline-text', text: 'A' }, position: 1 } });
    });
  });
});


