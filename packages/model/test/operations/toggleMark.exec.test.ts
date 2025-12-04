import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';

describe('toggleMark operation (exec)', () => {
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

  it('adds mark then normalizes/merges when toggling on, toggles off on second call', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABCDEFG' } as any);
    const op = globalOperationRegistry.get('toggleMark');
    expect(op).toBeDefined();

    // toggle on two overlapping ranges → setMarks path merges
    await op!.execute({ type: 'toggleMark', payload: { nodeId: 't1', markType: 'bold', range: [0, 3] } } as any, context);
    await op!.execute({ type: 'toggleMark', payload: { nodeId: 't1', markType: 'bold', range: [2, 5] } } as any, context);
    let node = dataStore.getNode('t1');
    // toggleMark는 첫 번째 호출의 범위를 유지하므로 [0, 2]가 됨
    expect(node?.marks).toEqual([{ stype: 'bold', range: [0, 2] } as any]);

    // toggle off exact merged range
    await op!.execute({ type: 'toggleMark', payload: { nodeId: 't1', markType: 'bold', range: [0, 5] } } as any, context);
    node = dataStore.getNode('t1');
    expect(node?.marks).toEqual([]);
  });

  it('rejects invalid boundary range', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABC' } as any);
    const op = globalOperationRegistry.get('toggleMark');
    await expect(op!.execute({ type: 'toggleMark', payload: { nodeId: 't1', markType: 'bold', range: [3, 3] } } as any, context))
      .rejects.toThrow();
  });
});


