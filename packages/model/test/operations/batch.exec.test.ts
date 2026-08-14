import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';

/**
 * The primitive the structural operations were missing.
 *
 * `transaction.ts` collects one inverse per operation, so an operation that
 * changes several places had nowhere to say how to put them all back — and
 * every one of them declared no inverse at all rather than one that undid a
 * fraction. This is that place, and the contract it has to keep is exactly
 * three things: run in order, undo in reverse, and leave nothing half-applied.
 */
describe('batch operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  const run = (payload: unknown) =>
    globalOperationRegistry.get('batch')!.execute({ type: 'batch', payload } as never, context);

  beforeEach(() => {
    schema = new Schema('batch-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: ['bold'] }
      },
      marks: { bold: { name: 'bold' } }
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);

    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as never);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a', 'b'], parentId: 'doc-1' } as never);
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'one', parentId: 'p-1' } as never);
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'two', parentId: 'p-1' } as never);
    dataStore.setRootNodeId('doc-1');
  });

  const texts = () => `${dataStore.getNode('a')?.text}|${dataStore.getNode('b')?.text}`;

  it('runs its steps in the order they are given', async () => {
    const result: any = await run({
      operations: [
        { type: 'setText', payload: { nodeId: 'a', text: 'first' } },
        { type: 'setText', payload: { nodeId: 'a', text: 'second' } }
      ]
    });
    expect(result.ok).toBe(true);
    expect(dataStore.getNode('a')?.text).toBe('second');
  });

  it('puts every step back, in reverse', async () => {
    const before = texts();
    const result: any = await run({
      operations: [
        { type: 'setText', payload: { nodeId: 'a', text: 'ONE' } },
        { type: 'setText', payload: { nodeId: 'b', text: 'TWO' } }
      ]
    });
    expect(texts()).toBe('ONE|TWO');

    const inverse = result.inverse;
    expect(inverse.type).toBe('batch');
    // Reverse order: the last change made is the first put back
    expect(inverse.payload.operations.map((step: any) => step.payload.nodeId)).toEqual(['b', 'a']);

    await globalOperationRegistry.get('batch')!.execute(
      { type: 'batch', payload: inverse.payload } as never,
      context
    );
    expect(texts()).toBe(before);
  });

  it('takes the steps that ran back when a later one refuses', async () => {
    const before = texts();
    // `removeChild` refuses a child that is not the parent's, and refuses
    // before touching anything — so the first step is what has to be undone.
    const result: any = await run({
      operations: [
        { type: 'setText', payload: { nodeId: 'a', text: 'changed' } },
        { type: 'removeChild', payload: { parentId: 'doc-1', childId: 'b' } }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('removeChild');
    expect(texts(), 'a refused batch left half of itself applied').toBe(before);
  });

  it('takes them back when a later step throws as well', async () => {
    const before = texts();
    await expect(
      run({
        operations: [
          { type: 'setText', payload: { nodeId: 'a', text: 'changed' } },
          { type: 'setText', payload: { nodeId: 'nope', text: 'x' } }
        ]
      })
    ).rejects.toThrow();
    expect(texts()).toBe(before);
  });

  it('offers no inverse when a step of its own has none', async () => {
    // `wrapInList` declares none, so a batch containing it cannot claim to be
    // reversible: undoing all but one step is worse than saying it cannot.
    const result: any = await run({
      operations: [
        { type: 'setText', payload: { nodeId: 'a', text: 'ONE' } },
        { type: 'selectNode', payload: { nodeId: 'p-1' } }
      ]
    });
    expect(result.ok).toBe(true);
    expect(result.inverse).toBeUndefined();
  });

  it('nests, because the inverse of a batch is a batch', async () => {
    const before = texts();
    const result: any = await run({
      operations: [
        { type: 'setText', payload: { nodeId: 'a', text: 'ONE' } },
        {
          type: 'batch',
          payload: {
            operations: [
              { type: 'setText', payload: { nodeId: 'b', text: 'TWO' } },
              { type: 'setText', payload: { nodeId: 'b', text: 'THREE' } }
            ]
          }
        }
      ]
    });
    expect(texts()).toBe('ONE|THREE');

    await globalOperationRegistry.get('batch')!.execute(
      { type: 'batch', payload: result.inverse.payload } as never,
      context
    );
    expect(texts()).toBe(before);
  });

  it('refuses an empty list rather than reporting it did something', async () => {
    const result: any = await run({ operations: [] });
    expect(result.ok).toBe(false);
    expect(result.inverse).toBeUndefined();
  });

  it('refuses a step it does not know', async () => {
    await expect(run({ operations: [{ type: 'noSuchOperation', payload: {} }] })).rejects.toThrow(
      'not a registered operation'
    );
  });
});
