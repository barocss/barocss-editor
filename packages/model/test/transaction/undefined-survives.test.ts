import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { SelectionManager } from '@barocss/editor-core';
import { transaction } from '../../src/transaction-dsl';
import { setAttrs } from '../../src/operations/setAttrs';
import '../../src/operations/register-operations';

/**
 * An operation's payload reaches the operation **with the keys that hold `undefined`**.
 *
 * ## Why this is worth a test of its own
 *
 * `setAttrs` is the one place in the model where "not set" is expressible, and its own comment says
 * so: *"`null` removes the attribute … so 'not set' is expressible for every type, once, here."*
 * `undefined` is the other half of that sentence, and the transaction was copying every operation
 * with `JSON.parse(JSON.stringify(...))` — which has no word for `undefined` and drops the key.
 *
 * So the removal branch could not be reached from a command at all, and it failed the way this
 * repository keeps finding: **silently**. Measured in the site builder's panel — a reader empties
 * 최소 폭, the field goes blank, the command reports success, and the attribute still holds 3000.
 * Every product had it, for as long as the copy has been there, and no test could see it because
 * every test that removes an attribute calls the operation directly.
 *
 * Which is the lesson worth keeping: a test that skips the layer that transports the work is a test
 * that cannot see the transport lose it.
 */
describe('what a transaction hands to an operation', () => {
  let dataStore: DataStore;
  let editor: any;

  beforeEach(() => {
    const schema = new Schema('test-schema', {
      nodes: {
        document: { content: 'block+' },
        paragraph: {
          content: 'inline*',
          group: 'block',
          attrs: { width: { type: 'number', required: false }, note: { type: 'string', required: false } }
        },
        'inline-text': { content: 'text*', group: 'inline' }
      },
      topNode: 'document'
    });

    dataStore = new DataStore(undefined as never, schema);
    editor = {
      dataStore,
      selectionManager: new SelectionManager({ dataStore }),
      schema,
      emit: () => {},
      updateSelection: () => {},
      // A removal is one entry in the history like any other write, so the mock has to hold one.
      historyManager: { push: () => {}, appendToLast: () => true }
    };
    dataStore.setNode({ sid: 'p1', stype: 'paragraph', attributes: { width: 3000, note: 'kept' } } as never);
  });

  const attrsOf = () => (dataStore.getNode('p1') as never as { attributes: Record<string, unknown> }).attributes;

  it('keeps a key whose value is `undefined`, which is how an attribute is removed', async () => {
    const result = await transaction(editor, [setAttrs('p1', { width: undefined })] as never).commit();

    expect(result.success).toBe(true);
    expect('width' in attrsOf()).toBe(false);
    // And only that one: a removal is not a reset.
    expect(attrsOf().note).toBe('kept');
  });

  it('removes on `null` too, which is what the operation documents', async () => {
    await transaction(editor, [setAttrs('p1', { note: null })] as never).commit();
    expect('note' in attrsOf()).toBe(false);
    expect(attrsOf().width).toBe(3000);
  });

  it('still copies rather than handing the operation over', async () => {
    /*
     * The copy is there for a reason — an operation object a caller keeps a reference to must not be
     * changed under them — so the fix had to keep copying, not stop.
     */
    const op = setAttrs('p1', { width: 1200 }) as never as { payload: { attrs: Record<string, unknown> } };
    await transaction(editor, [op] as never).commit();

    expect(attrsOf().width).toBe(1200);
    expect(op.payload.attrs.width).toBe(1200);
  });
});
