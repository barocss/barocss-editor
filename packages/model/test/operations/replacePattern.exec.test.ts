import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { replacePattern } from '../../src/operations/replacePattern';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('replacePattern operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] },
        paragraph: { name: 'paragraph', content: 'inline-text*' }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('replaces pattern in single-node range', async () => {
    dataStore.setNode({ id: 't', type: 'inline-text', text: 'foo bar foo' });
    const op = globalOperationRegistry.get('replacePattern');
    const count = await op!.execute({ type: 'replacePattern', nodeId: 't', start: 0, end: 11, pattern: /foo/g, replacement: 'baz' } as any, context);
    expect(count).toBeGreaterThan(0);
    expect(dataStore.getNode('t')?.text).toBe('baz bar baz');
  });

  it('replaces pattern across nodes via range payload', async () => {
    dataStore.setNode({ id: 'root', type: 'paragraph', content: ['a', 'b'] } as any);
    dataStore.setNode({ id: 'a', type: 'inline-text', text: 'hello ', parentId: 'root' });
    dataStore.setNode({ id: 'b', type: 'inline-text', text: 'world', parentId: 'root' });
    // Ensure iterator traverses the tree starting from this parent
    dataStore.setRoot('root');
    const op = globalOperationRegistry.get('replacePattern');
    const rng = { type: 'range' as const, startNodeId: 'a', startOffset: 0, endNodeId: 'b', endOffset: 5 };
    const before = dataStore.range.extractText(rng);
    expect(before).toBe('hello world');
    const count = await op!.execute({ type: 'replacePattern', range: rng, pattern: /(hello|world)/g, replacement: 'X' } as any, context);
    expect(count).toBeGreaterThanOrEqual(0);
    const after = dataStore.range.extractText(rng);
    expect(after).toBe('X X');
  });

  describe('replacePattern DSL', () => {
    it('builds descriptor (control single)', () => {
      const dsl = replacePattern(0, 5, 'a', 'b');
      expect(dsl).toEqual({ type: 'replacePattern', payload: { start: 0, end: 5, pattern: 'a', replacement: 'b' } });
    });
    it('builds descriptor (direct single)', () => {
      const dsl = replacePattern('t', 0, 5, 'a', 'b');
      expect(dsl).toEqual({ type: 'replacePattern', payload: { nodeId: 't', start: 0, end: 5, pattern: 'a', replacement: 'b' } });
    });
    it('builds descriptor (cross-node)', () => {
      const dsl = replacePattern('a', 0, 'b', 5, /x/g, 'y');
      expect(dsl).toEqual({ type: 'replacePattern', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 0, endNodeId: 'b', endOffset: 5 }, pattern: /x/g, replacement: 'y' } });
    });
  });
});


