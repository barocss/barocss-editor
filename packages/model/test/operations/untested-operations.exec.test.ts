import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * The operations that had no tests at all.
 *
 * Six of the fifty-eight were never executed by anything but the editor itself,
 * and the audit that found them was looking for a different fault. What is
 * asserted here is the contract every operation is supposed to keep, because
 * that is what a transaction relies on and what undo is built out of:
 *
 *   - it does what it says on a document that is really shaped like a document
 *   - it refuses clearly when it cannot, rather than half-doing it
 *   - and its `inverse` puts the document back
 *
 * The third is the one worth stating twice. `transaction.ts` collects each
 * operation's `inverse` and that collection *is* undo — so an inverse that does
 * not restore is a Ctrl+Z that damages the document, and no test would have
 * noticed because nothing here ever ran one.
 */
const makeSchema = () =>
  new Schema('test-schema', {
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      link: { name: 'link', group: 'inline', content: 'inline-text*' },
      'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: ['link'] }
    },
    marks: { link: { name: 'link', attrs: { href: {}, title: {} } } }
  });

describe('the operations nothing had tested', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = makeSchema();
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['t-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 't-1', stype: 'inline-text', text: 'abcdefgh', parentId: 'p-1' } as INode);
  });

  const run = async (type: string, payload: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const op = globalOperationRegistry.get(type);
    expect(op, `${type} is not registered`).toBeDefined();
    return await op!.execute({ type, payload, ...extra } as any, context);
  };

  const textOf = (sid: string) => (dataStore.getNode(sid) as INode)?.text;

  describe('deleteRange', () => {
    const range = { startNodeId: 't-1', startOffset: 2, endNodeId: 't-1', endOffset: 5 };

    it('deletes exactly the range it was given', async () => {
      await run('deleteRange', { range });
      expect(textOf('t-1')).toBe('abfgh');
    });

    it('refuses without a range instead of deleting something else', async () => {
      await expect(run('deleteRange', {})).rejects.toThrow(/range is required/);
    });

    it('puts back what it deleted when undone', async () => {
      const result = await run('deleteRange', { range });
      expect(textOf('t-1')).toBe('abfgh');

      const inverse = result.inverse!;
      const op = globalOperationRegistry.get(inverse.type);
      await op!.execute({ type: inverse.type, payload: inverse.payload } as any, context);

      // An inverse that repeats the action is not an inverse. Undo is built out
      // of these, so this is Ctrl+Z after deleting three characters.
      expect(textOf('t-1'), '되돌렸는데 글자가 돌아오지 않았습니다').toBe('abcdefgh');
    });
  });

  describe('update', () => {
    it('changes what it is given and leaves the rest', async () => {
      dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['t-1'], parentId: 'doc-1', attributes: { align: 'left', keep: 1 } } as INode);
      await run('update', { nodeId: 'p-1', data: { attributes: { align: 'center', keep: 1 } } });

      const node = dataStore.getNode('p-1') as INode;
      expect(node.attributes).toMatchObject({ align: 'center', keep: 1 });
    });

    it('refuses for a node that is not there', async () => {
      await expect(run('update', { nodeId: 'nope', data: { attributes: {} } })).rejects.toThrow(/not found/);
    });

    it('puts the old values back when undone', async () => {
      dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['t-1'], parentId: 'doc-1', attributes: { align: 'left' } } as INode);
      const result = await run('update', { nodeId: 'p-1', data: { attributes: { align: 'center' } } });

      const inverse = result.inverse!;
      const op = globalOperationRegistry.get(inverse.type);
      await op!.execute({ type: inverse.type, payload: inverse.payload } as any, context);

      expect((dataStore.getNode('p-1') as INode).attributes).toMatchObject({ align: 'left' });
    });
  });

  describe('setNode', () => {
    it('puts a node into the store', async () => {
      await run('setNode', {}, { node: { sid: 'new-1', stype: 'inline-text', text: 'fresh', parentId: 'p-1' } });
      expect(textOf('new-1')).toBe('fresh');
    });

    it('refuses a node with no id', async () => {
      await expect(run('setNode', {}, { node: { stype: 'inline-text', text: 'x' } })).rejects.toThrow(/must have an id/);
    });
  });

  describe('setSelection', () => {
    it('sets a range and knows it is not collapsed', async () => {
      await run('setSelection', { anchor: { nodeId: 't-1', offset: 1 }, head: { nodeId: 't-1', offset: 4 } });
      expect(context.selection.current).toMatchObject({
        type: 'range',
        startNodeId: 't-1',
        startOffset: 1,
        endOffset: 4,
        collapsed: false
      });
    });

    it('knows a caret is collapsed', async () => {
      await run('setSelection', { anchor: { nodeId: 't-1', offset: 3 }, head: { nodeId: 't-1', offset: 3 } });
      expect(context.selection.current.collapsed).toBe(true);
    });
  });

  describe('toggleLink', () => {
    it('refuses without a selection rather than linking nothing', async () => {
      context.selection.clear?.();
      await expect(run('toggleLink', { href: 'https://example.com' })).rejects.toThrow(/no range selection/);
    });

    it('marks the selected text as a link', async () => {
      context.selection.current = {
        type: 'range', startNodeId: 't-1', startOffset: 0, endNodeId: 't-1', endOffset: 3, collapsed: false
      };
      const result = await run('toggleLink', { href: 'https://example.com' });
      expect(result.ok).toBe(true);

      const marks = (dataStore.getNode('t-1') as any).marks ?? [];
      expect(marks.some((mark: any) => (mark.stype || mark.type) === 'link'), '링크 표시가 붙지 않았습니다').toBe(true);
    });

    it('takes the link off again when the text already has one', async () => {
      context.selection.current = {
        type: 'range', startNodeId: 't-1', startOffset: 0, endNodeId: 't-1', endOffset: 3, collapsed: false
      };
      await run('toggleLink', { href: 'https://example.com' });
      const second = await run('toggleLink', { href: 'https://example.com' });

      expect(second.data).toMatchObject({ removed: true });
    });
  });
});
