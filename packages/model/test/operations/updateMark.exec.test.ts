import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';

describe('updateMark operation (exec)', () => {
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

  it('merges attributes for an existing mark at the exact range', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello' } as any);
    // seed a mark
    const seed = dataStore.marks.setMarks('t1', [{ stype: 'bold', range: [0, 5], attrs: { a: 1 } } as any]);
    expect(seed.valid).toBe(true);

    const op = globalOperationRegistry.get('updateMark');
    expect(op).toBeDefined();

    await op!.execute({ type: 'updateMark', payload: { nodeId: 't1', markType: 'bold', range: [0, 5], newAttrs: { b: 2 } } } as any, context);
    const updated = dataStore.getNode('t1');
    expect(updated?.marks).toEqual([{ stype: 'bold', range: [0, 5], attrs: { a: 1, b: 2 } } as any]);
  });

  it('throws when node does not exist', async () => {
    const op = globalOperationRegistry.get('updateMark');
    await expect(op!.execute({ type: 'updateMark', payload: { nodeId: 'nope', markType: 'bold', range: [0, 1], newAttrs: {} } } as any, context))
      .rejects.toThrow();
  });

  it('throws on invalid range (start >= end)', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello' } as any);
    const op = globalOperationRegistry.get('updateMark');
    await expect(op!.execute({ type: 'updateMark', payload: { nodeId: 't1', markType: 'bold', range: [3, 2], newAttrs: {} } } as any, context))
      .rejects.toThrow();
  });
});


