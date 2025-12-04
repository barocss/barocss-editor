import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { setMarks } from '../../src/operations/setMarks';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('setMarks operation (exec)', () => {
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

  it('should set marks array on existing node', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABC' } as any);
    const op = globalOperationRegistry.get('setMarks');
    expect(op).toBeDefined();

    const result = await op!.execute({ type: 'setMarks', payload: { nodeId: 't1', marks: [{ stype: 'bold', range: [0, 3] } as any] } } as any, context);
    expect(result).toBeTruthy();
    const updated = dataStore.getNode('t1');
    expect(updated?.marks).toEqual([{ stype: 'bold', range: [0, 3] } as any]);
  });

  it('fills missing ranges with full text via DataStore normalization', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABC' } as any);
    const op = globalOperationRegistry.get('setMarks');
    await op!.execute({ type: 'setMarks', payload: { nodeId: 't1', marks: [{ stype: 'italic' } as any] } } as any, context);
    const updated = dataStore.getNode('t1');
    expect(updated?.marks).toEqual([{ stype: 'italic', range: [0, 3] } as any]);
  });

  it('clamps out-of-range and removes empty ranges', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABCDE' } as any);
    const op = globalOperationRegistry.get('setMarks');
    await op!.execute({ type: 'setMarks', payload: { nodeId: 't1', marks: [
      { stype: 'bold', range: [-5, 2] } as any,
      { stype: 'italic', range: [3, 3] } as any,
      { stype: 'italic', range: [2, 10] } as any
    ] } } as any, context);
    const updated = dataStore.getNode('t1');
    expect(updated?.marks).toEqual([
      { stype: 'bold', range: [0, 2] } as any,
      { stype: 'italic', range: [2, 5] } as any
    ]);
  });

  it('merges overlapping marks of same type/attrs and removes duplicates', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABCDEFG' } as any);
    const op = globalOperationRegistry.get('setMarks');
    await op!.execute({ type: 'setMarks', payload: { nodeId: 't1', marks: [
      { stype: 'bold', range: [0, 3] } as any,
      { stype: 'bold', range: [2, 5] } as any,
      { stype: 'bold', range: [0, 5] } as any,
      { stype: 'italic', attrs: { a: 1 }, range: [5, 7] } as any
    ] } } as any, context);
    const updated = dataStore.getNode('t1');
    expect(updated?.marks).toEqual([
      { stype: 'bold', range: [0, 5] } as any,
      { stype: 'italic', attrs: { a: 1 }, range: [5, 7] } as any
    ]);
  });

  it('should not change selection (preserve)', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello' } as any);
    selectionManager.setSelection({ type: 'range' as const, startNodeId: 't1', startOffset: 1, endNodeId: 't1', endOffset: 4 });
    const op = globalOperationRegistry.get('setMarks');
    await op!.execute({ type: 'setMarks', payload: { nodeId: 't1', marks: [{ stype: 'bold', range: [0, 2] } as any] } } as any, context);
    expect(selectionManager.getCurrentSelection()).toEqual({ type: 'range' as const, startNodeId: 't1', startOffset: 1, endNodeId: 't1', endOffset: 4 });
  });

  it('fails with clear error when node does not exist', async () => {
    const op = globalOperationRegistry.get('setMarks');
    await expect(op!.execute({ type: 'setMarks', nodeId: 'nope', marks: [{ stype: 'bold', range: [0, 1] } as any] } as any, context))
      .rejects.toThrow();
  });


  describe('setMarks operation DSL', () => {
    it('should build a setMarks descriptor from DSL', () => {
      const op = setMarks([
        { stype: 'bold' } as any,
        { stype: 'italic', range: [0, 5] } as any,
        { stype: 'link', attrs: { href: 'https://example.com' } } as any
      ]);
      expect(op).toEqual({
        type: 'setMarks',
        payload: {
          marks: [
            { stype: 'bold' },
            { stype: 'italic', range: [0, 5] },
            { stype: 'link', attrs: { href: 'https://example.com' } }
          ]
        }
      });
    });
  });

});


