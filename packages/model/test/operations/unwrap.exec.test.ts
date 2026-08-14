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
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: ['bold', 'italic'] }
      },
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

  /**
   * Known not to work, and it used to look as though it did.
   *
   * The claim is that a range spanning two runs — '<He' and 'llo>' — can have
   * its surrounding tokens taken off. It passed because `unwrap` read the range
   * as empty, took nothing off, wrote the text back unchanged and reported the
   * empty string as its result: `typeof result.data` was 'string' and the
   * assertion was satisfied by a no-op.
   *
   * `unwrap` now refuses when there is nothing wrapped, which is right — it used
   * to hand back a `wrap` inverse for the nothing it did, so undo *added* a
   * prefix and suffix the text had never had. What is left is that reading a
   * range across two nodes returns nothing here even with the two linked under
   * a paragraph and a document, which is the iterator's business and not this
   * operation's.
   */
  it.fixme('unwraps across nodes via range payload (when surrounding tokens inside range)', async () => {
    // Linked into a parent, because a range across two nodes can only be read
    // by walking the tree they are in — unlinked, it reads as empty and the
    // operation has nothing to take off.
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as any);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a', 'b'], parentId: 'doc-1' } as any);
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: '<He', parentId: 'p-1' } as any);
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'llo>', parentId: 'p-1' } as any);
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


