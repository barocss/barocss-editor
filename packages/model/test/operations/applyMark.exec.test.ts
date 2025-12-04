import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { applyMark as applyMarkDsl } from '../../src/operations-dsl/applyMark';

describe('applyMark operation (exec)', () => {
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

  it('applies mark in a single node range', async () => {
    dataStore.setNode({ id: 't1', type: 'inline-text', text: 'Hello World' });
    const op = globalOperationRegistry.get('applyMark');
    const result = await op!.execute({ type: 'applyMark', payload: { nodeId: 't1', start: 0, end: 5, markType: 'bold' } } as any, context);
    expect(result.data?.marks).toEqual([{ type: 'bold', range: [0, 5] }]);
  });

  it('applies mark across nodes via range payload', async () => {
    dataStore.setNode({ id: 'a', type: 'inline-text', text: 'Hello ' });
    dataStore.setNode({ id: 'b', type: 'inline-text', text: 'World' });
    const op = globalOperationRegistry.get('applyMark');
    await op!.execute({ type: 'applyMark', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 3, endNodeId: 'b', endOffset: 2 }, markType: 'italic' } } as any, context);
    expect(dataStore.getNode('a')?.marks).toEqual([{ type: 'italic', range: [3, 6] }]);
    expect(dataStore.getNode('b')?.marks).toEqual([{ type: 'italic', range: [0, 2] }]);
  });

  it('throws on invalid range', async () => {
    dataStore.setNode({ id: 't1', type: 'inline-text', text: 'ABC' });
    const op = globalOperationRegistry.get('applyMark');
    await expect(op!.execute({ type: 'applyMark', payload: { nodeId: 't1', start: 2, end: 2, markType: 'bold' } } as any, context)).rejects.toThrow('Invalid range');
  });

  it('throws when endpoint node does not exist', async () => {
    dataStore.setNode({ id: 't1', type: 'inline-text', text: 'ABC' });
    const op = globalOperationRegistry.get('applyMark');
    await expect(op!.execute({ type: 'applyMark', payload: { range: { type: 'range' as const, startNodeId: 't1', startOffset: 0, endNodeId: 'nope', endOffset: 1 }, markType: 'bold' } } as any, context)).rejects.toThrow('Node not found: nope');
  });

  describe('applyMark operation DSL', () => {
    it('builds descriptor from DSL (control, single node)', () => {
      const dsl = applyMarkDsl(1, 3, 'bold', { a: 1 });
      expect(dsl).toEqual({ type: 'applyMark', payload: { start: 1, end: 3, markType: 'bold', attrs: { a: 1 } } });
    });
    it('builds descriptor from DSL (direct, single node)', () => {
      const dsl = applyMarkDsl('t1', 1, 3, 'bold');
      expect(dsl).toEqual({ type: 'applyMark', payload: { nodeId: 't1', start: 1, end: 3, markType: 'bold' } });
    });
    it('builds descriptor from DSL (cross-node)', () => {
      const dsl = applyMarkDsl('a', 1, 'b', 4, 'italic');
      expect(dsl).toEqual({ type: 'applyMark', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 1, endNodeId: 'b', endOffset: 4 }, markType: 'italic' } });
    });
  });
});


