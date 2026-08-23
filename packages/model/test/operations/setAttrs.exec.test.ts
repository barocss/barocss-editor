import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { setAttrs } from '../../src/operations/setAttrs';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('setAttrs operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': { name: 'inline-text', content: 'text*', marks: ['bold', 'italic'], attrs: { class: { type: 'string', default: null } } }
      },
      marks: { bold: { name: 'bold' }, italic: { name: 'italic' } }
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('should merge and update attributes on existing node', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'old', dataId: '1' } } as any);
    const op = globalOperationRegistry.get('setAttrs');
    expect(op).toBeDefined();

    const result = await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: 'new' } } } as any, context);
    expect(result).toBeTruthy();
    const updated = dataStore.getNode('t1');
    expect(updated?.attributes?.class).toBe('new');
    expect(updated?.attributes?.dataId).toBe('1');
  });

  describe('setAttrs operation DSL', () => {
    it('should build a setAttrs descriptor from DSL', () => {
      const op = setAttrs({ class: 'intro', align: 'center' });
      expect(op).toEqual({
        type: 'setAttrs',
        payload: { attrs: { class: 'intro', align: 'center' } }
      });
    });
  });

  it('should update multiple attributes and preserve existing ones', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'old', dataId: '1' } } as any);
    const op = globalOperationRegistry.get('setAttrs');
    const result = await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: 'new', title: 'T' } } } as any, context);
    expect(result).toBeTruthy();
    const updated = dataStore.getNode('t1');
    expect(updated?.attributes?.class).toBe('new');
    expect(updated?.attributes?.title).toBe('T');
    expect(updated?.attributes?.dataId).toBe('1');
  });

  it('should be no-op when empty attrs provided', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'old' } } as any);
    const before = dataStore.getNode('t1');
    const op = globalOperationRegistry.get('setAttrs');
    await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: {} } } as any, context);
    const after = dataStore.getNode('t1');
    expect(after?.attributes).toEqual(before?.attributes);
  });

  it('should preserve selection (no movement)', async () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello', attributes: { class: 'old' } } as any);
    selectionManager.setSelection({ type: 'range' as const, startNodeId: 't1', startOffset: 2, endNodeId: 't1', endOffset: 4 });
    const op = globalOperationRegistry.get('setAttrs');
    await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: 'new' } } } as any, context);
    expect(selectionManager.getCurrentSelection()).toEqual({ type: 'range' as const, startNodeId: 't1', startOffset: 2, endNodeId: 't1', endOffset: 4 });
  });

  /**
   * Taking an attribute *off* a node.
   *
   * There was no way to do it. A string could pretend with `''` and an array with
   * `null` — which stored a null rather than removing anything — and a **number** had
   * nothing: `0` is a value and the schema refuses `''`, so the transaction was
   * rejected and the edit silently did nothing. Found on a connector's `endT`, the
   * fraction along a line one of its ends holds.
   */
  describe('removing an attribute', () => {
    beforeEach(() => {
      schema = new Schema('test-schema', {
        nodes: {
          'inline-text': {
            name: 'inline-text',
            content: 'text*',
            attrs: {
              class: { type: 'string', required: false },
              along: { type: 'number', required: false }
            }
          }
        }
      });
      dataStore = new DataStore(undefined, schema);
      selectionManager = new SelectionManager({ dataStore });
      context = createTransactionContext(dataStore, selectionManager, schema);
    });

    it('takes a number off with `null`, where no value could mean absent', async () => {
      dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { along: 0.5, class: 'keep' } } as any);
      const op = globalOperationRegistry.get('setAttrs');

      await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { along: null } } } as any, context);

      const after = dataStore.getNode('t1');
      expect('along' in (after?.attributes ?? {})).toBe(false);
      // And nothing else moved: this is a removal, not a replacement.
      expect(after?.attributes?.class).toBe('keep');
    });

    it('removes rather than storing a null, so a reader cannot find one', async () => {
      dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'x' } } as any);
      const op = globalOperationRegistry.get('setAttrs');
      await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: null } } } as any, context);
      expect(dataStore.getNode('t1')?.attributes).toEqual({});
    });

    it('puts it back on undo', async () => {
      dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { along: 0.25 } } as any);
      const op = globalOperationRegistry.get('setAttrs');
      const result: any = await op!.execute(
        { type: 'setAttrs', payload: { nodeId: 't1', attrs: { along: null } } } as any,
        context
      );

      expect(dataStore.getNode('t1')?.attributes?.along).toBeUndefined();
      await op!.execute(result.inverse, context);
      expect(dataStore.getNode('t1')?.attributes?.along).toBe(0.25);
    });

    it('treats `undefined` the same way, because a caller spreading an absent value means absent', async () => {
      dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { along: 1 } } as any);
      const op = globalOperationRegistry.get('setAttrs');
      await op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { along: undefined } } } as any, context);
      expect('along' in (dataStore.getNode('t1')?.attributes ?? {})).toBe(false);
    });

    it('restores a null the document already had, rather than tidying it away', async () => {
      /*
       * `replace` is the inverse's path and it is exact: a document that arrived with a
       * null keeps it through an undo. Only the merge reads `null` as "remove".
       */
      dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'x' } } as any);
      const op = globalOperationRegistry.get('setAttrs');
      await op!.execute(
        { type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: null }, replace: true } } as any,
        context
      );
      expect(dataStore.getNode('t1')?.attributes).toEqual({ class: null });
    });
  });

  it('should fail when schema rejects attribute type', async () => {
    // schema: class is string|null. Put a number to trigger validation.
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A', attributes: { class: 'ok' } } as any);
    const op = globalOperationRegistry.get('setAttrs');
    await expect(op!.execute({ type: 'setAttrs', payload: { nodeId: 't1', attrs: { class: 123 as any } } } as any, context))
      .rejects.toThrow('Schema validation failed');
  });
  
});


