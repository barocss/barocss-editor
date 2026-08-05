import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';

/**
 * An operation that removes the node the selection is standing in has to say
 * where the selection goes.
 *
 * Nothing enforces that, and both merges used not to: the caret was left
 * pointing at a node that no longer existed, so the next keystroke found nothing
 * to act on and the one after it lost the selection entirely. Holding Backspace
 * merged one block and then stopped.
 *
 * The transaction already carries the answer — `selectionAfter`, built from
 * `context.selection` — which is why this belongs in the operation and not in
 * the command that calls it: routed through the transaction it also survives
 * undo, where a caret set from outside would not.
 */
describe('merges decide where the caret lands', () => {
  let dataStore: DataStore;
  let context: any;

  beforeEach(() => {
    const schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', content: 'paragraph*' },
        paragraph: { name: 'paragraph', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    context = createTransactionContext(dataStore, new SelectionManager({ dataStore }), schema);
  });

  const run = (type: string, payload: any) =>
    globalOperationRegistry.get(type)!.execute({ type, payload } as any, context);

  describe('mergeTextNodes', () => {
    beforeEach(() => {
      dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello' } as any);
      dataStore.setNode({ sid: 't2', stype: 'inline-text', text: 'World' } as any);
    });

    it('puts the caret where the two texts join', async () => {
      const result = await run('mergeTextNodes', { leftNodeId: 't1', rightNodeId: 't2' });

      expect(context.selection.current).toMatchObject({
        startNodeId: result.data,
        startOffset: 5,
        endNodeId: result.data,
        endOffset: 5,
        collapsed: true
      });
    });

    it('agrees with the position its inverse splits at', async () => {
      // The junction and the split point are the same place, and they have to
      // stay that way: undo puts the caret back where redo will need it.
      const result = await run('mergeTextNodes', { leftNodeId: 't1', rightNodeId: 't2' });
      expect((result.inverse as any).payload.splitPosition).toBe(
        context.selection.current.startOffset
      );
    });
  });

  describe('mergeBlockNodes', () => {
    beforeEach(() => {
      dataStore.setNode({ sid: 'text-1', stype: 'inline-text', text: 'Hello' } as any);
      dataStore.setNode({ sid: 'text-2', stype: 'inline-text', text: 'World' } as any);
      dataStore.setNode({ sid: 'p1', stype: 'paragraph', content: ['text-1'] } as any);
      dataStore.setNode({ sid: 'p2', stype: 'paragraph', content: ['text-2'] } as any);
    });

    it('puts the caret at the end of the text the left block already had', async () => {
      await run('mergeBlockNodes', { leftNodeId: 'p1', rightNodeId: 'p2' });

      // Not on text-2, which is where the caret was: that node moved, and the
      // position the user is looking at is the seam between the two.
      expect(context.selection.current).toMatchObject({
        startNodeId: 'text-1',
        startOffset: 5,
        collapsed: true
      });
    });

    it('leaves the caret alone when the left block has no text to land in', async () => {
      dataStore.setNode({ sid: 'empty', stype: 'paragraph', content: [] } as any);

      const before = context.selection.current;
      await run('mergeBlockNodes', { leftNodeId: 'empty', rightNodeId: 'p2' });

      // Guessing a position would be worse than keeping the one the caller had
      expect(context.selection.current).toEqual(before);
    });
  });
});
