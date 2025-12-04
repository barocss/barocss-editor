import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { outdentText as outdentTextDsl } from '../../src/operations-dsl/outdentText';

describe('outdentText operation (exec)', () => {
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

  it('outdents lines in a single node range (two spaces)', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: '  A\n  B' });
    const op = globalOperationRegistry.get('outdentText');
    const res = await op!.execute({ type: 'outdentText', payload: { nodeId: 't1', start: 0, end: 6, indent: '  ' } } as any, context);
    expect(typeof res.data).toBe('string');
    const node = dataStore.getNode('t1');
    expect(node?.text).toContain('A');
    expect(node?.text).toContain('B');
  });

  it('outdents cross-node range', async () => {
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: '\tX' });
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: '\tY' });
    const op = globalOperationRegistry.get('outdentText');
    const range = {
      type: 'range' as const,
      startNodeId: 'a',
      startOffset: 0,
      endNodeId: 'b',
      endOffset: 2,
      collapsed: false,
      direction: 'forward' as const
    };
    const res = await op!.execute({ type: 'outdentText', payload: { range, indent: '\t' } } as any, context);
    expect(typeof res.data).toBe('string');
  });

  describe('outdentText operation DSL', () => {
    it('builds descriptor from DSL (control, single node)', () => {
      const dsl = outdentTextDsl(0, 3, '>>');
      expect(dsl).toEqual({ type: 'outdentText', payload: { start: 0, end: 3, indent: '>>' } });
    });
    it('builds descriptor from DSL (direct, single node)', () => {
      const dsl = outdentTextDsl('t1', 0, 3, '  ');
      expect(dsl).toEqual({ type: 'outdentText', payload: { nodeId: 't1', start: 0, end: 3, indent: '  ' } });
    });
    it('builds descriptor from DSL (cross-node)', () => {
      const dsl = outdentTextDsl('a', 0, 'b', 1, '  ');
      expect(dsl.type).toBe('outdentText');
      expect(dsl.payload).toHaveProperty('range');
    });
  });
});

