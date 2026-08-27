import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { applyMark as applyMarkDsl } from '../../src/operations/applyMark';

describe('applyMark operation (exec)', () => {
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

  it('applies mark in a single node range', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello World' });
    const op = globalOperationRegistry.get('applyMark');
    const result = await op!.execute({ type: 'applyMark', payload: { nodeId: 't1', start: 0, end: 5, markType: 'bold' } } as any, context);
    expect(result.data?.marks).toEqual([{ stype: 'bold', range: [0, 5] }]);
  });

  it('applies mark across nodes via range payload', async () => {
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'Hello ' });
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'World' });
    const op = globalOperationRegistry.get('applyMark');
    await op!.execute({ type: 'applyMark', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 3, endNodeId: 'b', endOffset: 2 }, markType: 'italic' } } as any, context);
    expect(dataStore.getNode('a')?.marks).toEqual([{ stype: 'italic', range: [3, 6] }]);
    expect(dataStore.getNode('b')?.marks).toEqual([{ stype: 'italic', range: [0, 2] }]);
  });

  it('throws on invalid range', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABC' });
    const op = globalOperationRegistry.get('applyMark');
    await expect(op!.execute({ type: 'applyMark', payload: { nodeId: 't1', start: 2, end: 2, markType: 'bold' } } as any, context)).rejects.toThrow('Invalid range');
  });

  it('throws when endpoint node does not exist', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABC' });
    const op = globalOperationRegistry.get('applyMark');
    await expect(op!.execute({ type: 'applyMark', payload: { range: { type: 'range' as const, startNodeId: 't1', startOffset: 0, endNodeId: 'nope', endOffset: 1 }, markType: 'bold' } } as any, context)).rejects.toThrow('Node not found: nope');
  });

  describe('applyMark operation DSL', () => {
    it('builds descriptor from DSL (control, single node)', () => {
      const dsl = applyMarkDsl(1, 3, 'bold', { a: 1 });
      expect(dsl).toEqual({ type: 'applyMark', payload: { start: 1, end: 3, markType: 'bold', attrs: { a: 1 } } });
    });
    it('builds descriptor from DSL (direct, single node)', () => {
      const dsl = applyMarkDsl('t1', 1, 3, 'bold');
      expect(dsl).toEqual({ type: 'applyMark', payload: { nodeId: 't1', start: 1, end: 3, markType: 'bold' } });
    });
    it('builds descriptor from DSL (cross-node)', () => {
      const dsl = applyMarkDsl('a', 1, 'b', 4, 'italic');
      expect(dsl).toEqual({ type: 'applyMark', payload: { range: { type: 'range' as const, startNodeId: 'a', startOffset: 1, endNodeId: 'b', endOffset: 4 }, markType: 'italic' } });
    });
  });
});



/**
 * A node that says which marks a run inside it may take.
 *
 * `marks: string[]` has been on a node definition since the schema was written and **nothing read
 * it** — the third field of that family, after `code` and `whitespace`. Absent means anything, which
 * is what every node in the office schema but one says and is why it went unnoticed; `[]` means none.
 *
 * The operation is where it is read rather than a toolbar, because a mark reaches a run through a
 * paste, a command, a loaded document and a test, and only one of those goes past a button. What it
 * cost while unread: bold inside a code block, which publishes a `<strong>` into a `<pre>` — nothing
 * a highlighter expects, and lost the moment the code is copied out as text, which is what a code
 * block is for.
 */
describe('applyMark, against what the node allows', () => {
  let dataStore: DataStore;
  let context: any;

  beforeEach(() => {
    const schema = new Schema('marks-schema', {
      nodes: {
        'inline-text': { name: 'inline-text', content: 'text*' },
        paragraph: { name: 'paragraph', content: 'inline*' },
        // None at all: the code block's rule.
        codeBlock: { name: 'codeBlock', content: 'inline*', marks: [] },
        // And one that allows some, to show the list is a list rather than a switch.
        callout: { name: 'callout', content: 'inline*', marks: ['bold'] }
      },
      marks: { bold: { name: 'bold' }, italic: { name: 'italic' } }
    });
    dataStore = new DataStore(undefined, schema);
    context = createTransactionContext(dataStore, new SelectionManager({ dataStore }), schema);
  });

  const run = (parentStype: string) => {
    dataStore.setNode({ sid: 'block', stype: parentStype, content: ['run'] } as never);
    dataStore.setNode({ sid: 'run', stype: 'inline-text', text: 'const x = 1;', parentId: 'block' } as never);
    return globalOperationRegistry.get('applyMark')!;
  };

  it('allows anything where the node says nothing', async () => {
    const op = run('paragraph');
    await op.execute({ type: 'applyMark', payload: { nodeId: 'run', start: 0, end: 5, markType: 'bold' } } as any, context);
    expect(dataStore.getNode('run')?.marks).toEqual([{ stype: 'bold', range: [0, 5] }]);
  });

  it('refuses every mark where the node allows none', async () => {
    const op = run('codeBlock');
    await expect(
      op.execute({ type: 'applyMark', payload: { nodeId: 'run', start: 0, end: 5, markType: 'bold' } } as any, context)
    ).rejects.toThrow("Mark 'bold' is not allowed here");
    // And nothing was written: a refusal that half-applied would be worse than none.
    expect(dataStore.getNode('run')?.marks ?? []).toEqual([]);
  });

  it('refuses only what is not on the list', async () => {
    const op = run('callout');
    await op.execute({ type: 'applyMark', payload: { nodeId: 'run', start: 0, end: 5, markType: 'bold' } } as any, context);
    await expect(
      op.execute({ type: 'applyMark', payload: { nodeId: 'run', start: 0, end: 5, markType: 'italic' } } as any, context)
    ).rejects.toThrow("Mark 'italic' is not allowed here");
  });

  it('refuses a range whose far end is inside code, not only its start', async () => {
    dataStore.setNode({ sid: 'p', stype: 'paragraph', content: ['a'] } as never);
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'plain ', parentId: 'p' } as never);
    dataStore.setNode({ sid: 'c', stype: 'codeBlock', content: ['b'] } as never);
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'code', parentId: 'c' } as never);

    const op = globalOperationRegistry.get('applyMark')!;
    await expect(
      op.execute(
        {
          type: 'applyMark',
          payload: { range: { startNodeId: 'a', startOffset: 0, endNodeId: 'b', endOffset: 2 }, markType: 'bold' }
        } as any,
        context
      )
    ).rejects.toThrow("Mark 'bold' is not allowed here");
  });

  it('lets the nearest ancestor decide, so a quotation cannot overrule the code in it', async () => {
    dataStore.setNode({ sid: 'quote', stype: 'paragraph', content: ['code'] } as never);
    dataStore.setNode({ sid: 'code', stype: 'codeBlock', content: ['run'], parentId: 'quote' } as never);
    dataStore.setNode({ sid: 'run', stype: 'inline-text', text: 'x', parentId: 'code' } as never);

    const op = globalOperationRegistry.get('applyMark')!;
    await expect(
      op.execute({ type: 'applyMark', payload: { nodeId: 'run', start: 0, end: 1, markType: 'bold' } } as any, context)
    ).rejects.toThrow("Mark 'bold' is not allowed here");
  });
});
