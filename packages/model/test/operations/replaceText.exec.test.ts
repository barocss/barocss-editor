import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { replaceText as replaceTextDsl } from '../../src/operations/replaceText';

describe('replaceText operation (exec)', () => {
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

  it('replaces text in single node range and returns deleted segment', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello World' });
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
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABC' });
    const op = globalOperationRegistry.get('replaceText');
    await expect(op!.execute({ type: 'replaceText', payload: { nodeId: 't1', start: 3, end: 2, newText: 'X' } } as any, context)).rejects.toThrow('Invalid range');
  });

  it('supports cross-node replacement via range payload', async () => {
    // Linked, because a range across two runs is only a range if they share a
    // tree — unlinked, the read came back empty and this passed on a no-op.
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as any);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a', 'b'], parentId: 'doc-1' } as any);
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'Hello ', parentId: 'p-1' } as any);
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'World', parentId: 'p-1' } as any);
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

  /**
   * **The marks over the run come back, and come back where they were.**
   *
   * `range.replaceText` re-derives a run's marks by the store's rules for an *edit* — right for a
   * reader making one, and not reversible: replacing two characters inside a bold span brought the
   * span back two characters shorter. The range form of this operation had captured the list for its
   * inverse for exactly that reason; this form, which `replaceAll` builds, had not. So 모두 바꾸기
   * followed by ⌘Z returned the words and not the emphasis, silently, in every product.
   *
   * Invisible until the extensions' conformance fixture grew a bold run: a document with no formatted
   * text in it cannot notice a fault about formatting.
   */
  it('gives the marks back exactly where they were, when it is undone', async () => {
    dataStore.setNode({
      sid: 't1',
      stype: 'inline-text',
      text: 'Hello World',
      marks: [{ stype: 'bold', range: [0, 8] }]
    } as never);

    const op = globalOperationRegistry.get('replaceText');
    const done = await op!.execute(
      { type: 'replaceText', payload: { nodeId: 't1', start: 6, end: 11, newText: 'there' } } as never,
      context
    );
    expect(dataStore.getNode('t1')?.text).toBe('Hello there');

    await op!.execute(done.inverse as never, context);

    expect(dataStore.getNode('t1')?.text).toBe('Hello World');
    expect((dataStore.getNode('t1') as never as { marks: unknown[] }).marks).toEqual([
      { stype: 'bold', range: [0, 8] }
    ]);
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


