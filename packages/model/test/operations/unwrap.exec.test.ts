import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { unwrap as unwrapDsl } from '../../src/operations-dsl/unwrap';

describe('unwrap operation (exec)', () => {
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

  it('unwraps a single node range', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: '**Hello**' } as any);
    const op = globalOperationRegistry.get('unwrap');
    const result = await op!.execute({ type: 'unwrap', payload: { nodeId: 't1', start: 0, end: 9, prefix: '**', suffix: '**' } } as any, context);
    expect(result.data).toBe('Hello');
    expect(dataStore.getNode('t1')?.text).toBe('Hello');
  });

  it('unwraps across nodes via range payload (when surrounding tokens inside range)', async () => {
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: '<He' } as any);
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'llo>' } as any);
    const op = globalOperationRegistry.get('unwrap');
    const result = await op!.execute({ type: 'unwrap', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 0, endNodeId: 'b', endOffset: 4 }, prefix: '<', suffix: '>' } } as any, context);
    expect(typeof result.data).toBe('string');
  });

  it('throws on invalid range', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello' } as any);
    const op = globalOperationRegistry.get('unwrap');
    await expect(op!.execute({ type: 'unwrap', payload: { nodeId: 't1', start: 4, end: 2, prefix: '(', suffix: ')' } } as any, context)).rejects.toThrow('Invalid range');
  });

  describe('unwrap operation DSL', () => {
    it('builds descriptor from DSL (control, single node)', () => {
      const dsl = unwrapDsl(1, 3, '(', ')');
      expect(dsl).toEqual({ type: 'unwrap', payload: { start: 1, end: 3, prefix: '(', suffix: ')' } });
    });
    it('builds descriptor from DSL (direct, single node)', () => {
      const dsl = unwrapDsl('t1', 1, 3, '[', ']');
      expect(dsl).toEqual({ type: 'unwrap', payload: { nodeId: 't1', start: 1, end: 3, prefix: '[', suffix: ']' } });
    });
    it('builds descriptor from DSL (cross-node)', () => {
      const dsl = unwrapDsl('a', 1, 'b', 4, '<', '>');
      expect(dsl).toEqual({ type: 'unwrap', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 1, endNodeId: 'b', endOffset: 4 }, prefix: '<', suffix: '>' } });
    });
  });
});


