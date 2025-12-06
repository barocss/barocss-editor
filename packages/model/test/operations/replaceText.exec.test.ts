import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { replaceText as replaceTextDsl } from '../../src/operations-dsl/replaceText';

describe('replaceText operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: { 'inline-text': { name: 'inline-text', content: 'text*', marks: ['bold', 'italic'] } },
      marks: { bold: { name: 'bold' }, italic: { name: 'italic' } }
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('replaces text in single node range and returns deleted segment', async () => {
    dataStore.setNode({ id: 't1', type: 'inline-text', text: 'Hello World' });
    const op = globalOperationRegistry.get('replaceText');
    const result = await op!.execute({ type: 'replaceText', payload: { nodeId: 't1', start: 6, end: 11, newText: 'Barocss' } } as any, context);
    expect(result.data).toBe('World');
    const node = dataStore.getNode('t1');
    expect(node?.text).toBe('Hello Barocss');
  });

  it('throws when node does not exist', async () => {
    const op = globalOperationRegistry.get('replaceText');
    await expect(op!.execute({ type: 'replaceText', payload: { nodeId: 'nope', start: 0, end: 1, newText: 'X' } } as any, context)).rejects.toThrow();
  });

  it('throws on invalid range', async () => {
    dataStore.setNode({ id: 't1', type: 'inline-text', text: 'ABC' });
    const op = globalOperationRegistry.get('replaceText');
    await expect(op!.execute({ type: 'replaceText', payload: { nodeId: 't1', start: 3, end: 2, newText: 'X' } } as any, context)).rejects.toThrow('Invalid range');
  });

  it('supports cross-node replacement via range payload', async () => {
    dataStore.setNode({ id: 'a', type: 'inline-text', text: 'Hello ' });
    dataStore.setNode({ id: 'b', type: 'inline-text', text: 'World' });
    // DataStore is prepared to work with delete+insert in branches other than fast-path even without parent content connection
    const op = globalOperationRegistry.get('replaceText');
    const result = await op!.execute({
      type: 'replaceText',
      payload: {
        range: { type: 'range' as const, startNodeId: 'a', startOffset: 6, endNodeId: 'b', endOffset: 5 },
        newText: 'Barocss'
      }
    } as any, context);
    expect(result.data).toBe('World');
    expect(dataStore.getNode('a')?.text).toBe('Hello Barocss');
    expect(dataStore.getNode('b')?.text).toBe('');
  });

  describe('replaceText operation DSL', () => {
    it('builds descriptor from DSL (control form)', () => {
      const dsl = replaceTextDsl(1, 3, 'XY');
      expect(dsl).toEqual({ type: 'replaceText', payload: { start: 1, end: 3, newText: 'XY' } });
    });
    it('builds descriptor from DSL (direct form)', () => {
      const dsl = replaceTextDsl('t1', 1, 3, 'XY');
      expect(dsl).toEqual({ type: 'replaceText', payload: { nodeId: 't1', start: 1, end: 3, newText: 'XY' } });
    });
    it('builds descriptor from DSL (cross-node form)', () => {
      const dsl = replaceTextDsl('a', 1, 'b', 4, 'ZZ');
      expect(dsl).toEqual({ type: 'replaceText', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 1, endNodeId: 'b', endOffset: 4 }, newText: 'ZZ' } });
    });
  });
});


