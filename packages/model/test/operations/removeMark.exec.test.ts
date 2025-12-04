import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('removeMark operation (exec)', () => {
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

  it('removes mark only when type and exact range match', async () => {
    dataStore.setNode({ id: 't1', type: 'inline-text', text: 'ABCDE' });
    const seed = dataStore.marks.setMarks('t1', [
      { type: 'bold', range: [0, 2] },
      { type: 'bold', range: [3, 5] }
    ]);
    expect(seed.valid).toBe(true);

    const op = globalOperationRegistry.get('removeMark');
    const result = await op!.execute({ type: 'removeMark', payload: { nodeId: 't1', markType: 'bold', range: [0, 2] } } as any, context);
    expect(result.data?.marks).toEqual([{ type: 'bold', range: [3, 5] }]);
  });

  it('no-op when no exact match (different range)', async () => {
    dataStore.setNode({ id: 't1', type: 'inline-text', text: 'ABCDE' });
    dataStore.marks.setMarks('t1', [{ type: 'bold', range: [0, 2] }]);

    const op = globalOperationRegistry.get('removeMark');
    const result = await op!.execute({ type: 'removeMark', payload: { nodeId: 't1', markType: 'bold', range: [1, 3] } } as any, context);
    expect(result.data?.marks).toEqual([{ type: 'bold', range: [0, 2] }]);
  });

  it('throws on invalid range', async () => {
    dataStore.setNode({ id: 't1', type: 'inline-text', text: 'ABCDE' });
    const op = globalOperationRegistry.get('removeMark');
    await expect(op!.execute({ type: 'removeMark', payload: { nodeId: 't1', markType: 'bold', range: [4, 2] } } as any, context))
      .rejects.toThrow();
  });
});
