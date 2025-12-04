import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { wrap as wrapDsl } from '../../src/operations-dsl/wrap';

describe('wrap operation (exec)', () => {
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

  it('wraps a single node range with prefix/suffix', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello' } as any);
    const op = globalOperationRegistry.get('wrap');
    const result = await op!.execute({ type: 'wrap', payload: { nodeId: 't1', start: 0, end: 5, prefix: '**', suffix: '**' } } as any, context);
    expect(result.data.startsWith('**') && result.data.endsWith('**')).toBe(true);
    expect(dataStore.getNode('t1')?.text).toBe('**Hello**');
  });

  it('wraps across nodes via range payload', async () => {
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'Hello ' } as any);
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'World' } as any);
    const op = globalOperationRegistry.get('wrap');
    const result = await op!.execute({ type: 'wrap', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 3, endNodeId: 'b', endOffset: 2 }, prefix: '<', suffix: '>' } } as any, context);
    expect(result.data.startsWith('<')).toBe(true);
  });

  it('throws on invalid range', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello' } as any);
    const op = globalOperationRegistry.get('wrap');
    await expect(op!.execute({ type: 'wrap', payload: { nodeId: 't1', start: 4, end: 2, prefix: '(', suffix: ')' } } as any, context)).rejects.toThrow('Invalid range');
  });

  describe('wrap operation DSL', () => {
    it('builds descriptor from DSL (control, single node)', () => {
      const dsl = wrapDsl(1, 3, '(', ')');
      expect(dsl).toEqual({ type: 'wrap', payload: { start: 1, end: 3, prefix: '(', suffix: ')' } });
    });
    it('builds descriptor from DSL (direct, single node)', () => {
      const dsl = wrapDsl('t1', 1, 3, '[', ']');
      expect(dsl).toEqual({ type: 'wrap', payload: { nodeId: 't1', start: 1, end: 3, prefix: '[', suffix: ']' } });
    });
    it('builds descriptor from DSL (cross-node)', () => {
      const dsl = wrapDsl('a', 1, 'b', 4, '<', '>');
      expect(dsl).toEqual({ type: 'wrap', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 1, endNodeId: 'b', endOffset: 4 }, prefix: '<', suffix: '>' } });
    });
  });
});


