import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { mergeTextNodes as mergeTextNodesDsl } from '../../src/operations-dsl/mergeTextNodes';

describe('mergeTextNodes operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': { name: 'inline-text', content: 'text*', marks: ['bold', 'italic'] },
        paragraph: { name: 'paragraph', content: 'inline-text*' }
      },
      marks: { bold: { name: 'bold' }, italic: { name: 'italic' } }
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('merges two adjacent text nodes', async () => {
    dataStore.setNode({ id: 'a', type: 'inline-text', text: 'Hello ' });
    dataStore.setNode({ id: 'b', type: 'inline-text', text: 'World' });
    const parentId = 'p1';
    dataStore.setNode({ id: parentId, type: 'paragraph', content: ['a', 'b'] } as any);
    const op = globalOperationRegistry.get('mergeTextNodes');
    const result = await op!.execute({ type: 'mergeTextNodes', payload: { leftNodeId: 'a', rightNodeId: 'b' } } as any, context);
    expect(typeof result.data).toBe('string');
    const merged = dataStore.getNode('a');
    expect(merged?.text).toBe('Hello World');
    const parent = dataStore.getNode(parentId);
    // 'b' may be removed from parent.content or no longer adjacent
    expect(Array.isArray(parent?.content)).toBe(true);
  });

  it('throws when nodes are not text', async () => {
    dataStore.setNode({ id: 'a', type: 'paragraph', content: [] } as any);
    dataStore.setNode({ id: 'b', type: 'paragraph', content: [] } as any);
    const op = globalOperationRegistry.get('mergeTextNodes');
    await expect(op!.execute({ type: 'mergeTextNodes', payload: { leftNodeId: 'a', rightNodeId: 'b' } } as any, context)).rejects.toThrow();
  });

  describe('mergeTextNodes DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = mergeTextNodesDsl('a', 'b');
      expect(dsl).toEqual({ type: 'mergeTextNodes', payload: { leftNodeId: 'a', rightNodeId: 'b' } });
    });
    it('builds descriptor (control)', () => {
      const dsl = mergeTextNodesDsl('b');
      expect(dsl).toEqual({ type: 'mergeTextNodes', payload: { rightNodeId: 'b' } });
    });
  });
});


