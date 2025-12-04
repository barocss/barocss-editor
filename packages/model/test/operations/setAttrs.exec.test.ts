import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { setAttrs } from '../../src/operations/setAttrs';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('setAttrs operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': { name: 'inline-text', content: 'text*', marks: ['bold', 'italic'], attrs: { class: { type: 'string', default: null } } }
      },
      marks: { bold: { name: 'bold' }, italic: { name: 'italic' } }
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('should merge and update attributes on existing node', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'old', dataId: '1' } } as any);
    const op = globalOperationRegistry.get('setAttrs');
    expect(op).toBeDefined();

    const result = await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: 'new' } } } as any, context);
    expect(result).toBeTruthy();
    const updated = dataStore.getNode('t1');
    expect(updated?.attributes?.class).toBe('new');
    expect(updated?.attributes?.dataId).toBe('1');
  });

  describe('setAttrs operation DSL', () => {
    it('should build a setAttrs descriptor from DSL', () => {
      const op = setAttrs({ class: 'intro', align: 'center' });
      expect(op).toEqual({
        type: 'setAttrs',
        payload: { attrs: { class: 'intro', align: 'center' } }
      });
    });
  });

  it('should update multiple attributes and preserve existing ones', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'old', dataId: '1' } } as any);
    const op = globalOperationRegistry.get('setAttrs');
    const result = await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: 'new', title: 'T' } } } as any, context);
    expect(result).toBeTruthy();
    const updated = dataStore.getNode('t1');
    expect(updated?.attributes?.class).toBe('new');
    expect(updated?.attributes?.title).toBe('T');
    expect(updated?.attributes?.dataId).toBe('1');
  });

  it('should be no-op when empty attrs provided', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'old' } } as any);
    const before = dataStore.getNode('t1');
    const op = globalOperationRegistry.get('setAttrs');
    await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: {} } } as any, context);
    const after = dataStore.getNode('t1');
    expect(after?.attributes).toEqual(before?.attributes);
  });

  it('should preserve selection (no movement)', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello', attributes: { class: 'old' } } as any);
    selectionManager.setSelection({ type: 'range' as const, startNodeId: 't1', startOffset: 2, endNodeId: 't1', endOffset: 4 });
    const op = globalOperationRegistry.get('setAttrs');
    await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: 'new' } } } as any, context);
    expect(selectionManager.getCurrentSelection()).toEqual({ type: 'range' as const, startNodeId: 't1', startOffset: 2, endNodeId: 't1', endOffset: 4 });
  });

  it('should fail when schema rejects attribute type', async () => {
    // schema: class is string|null. Put a number to trigger validation.
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'ok' } } as any);
    const op = globalOperationRegistry.get('setAttrs');
    await expect(op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: 123 as any } } } as any, context))
      .rejects.toThrow('Schema validation failed');
  });
  
});


