import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { splitListItem as splitListItemDsl } from '../../src/operations-dsl/splitListItem';
import type { INode } from '@barocss/datastore';

describe('splitListItem operation (exec, selection-based)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        list: { name: 'list', group: 'block', content: 'listItem+' },
        listItem: { name: 'listItem', group: 'block', content: 'block+' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  function setSelection(nodeId: string, offset: number): void {
    context.selection.setCaret(nodeId, offset);
  }

  function setupListWithOneItem(): void {
    const doc: INode = { sid: 'doc-1', stype: 'document', content: ['list-1'] };
    const list: INode = { sid: 'list-1', stype: 'list', content: ['li-1'], parentId: 'doc-1' };
    const li: INode = { sid: 'li-1', stype: 'listItem', content: ['p-1'], parentId: 'list-1' };
    const p1: INode = { sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'li-1' };
    const t1: INode = { sid: 'text-1', stype: 'inline-text', text: 'AAA', parentId: 'p-1' };
    dataStore.setNode(doc);
    dataStore.setNode(list);
    dataStore.setNode(li);
    dataStore.setNode(p1);
    dataStore.setNode(t1);
  }

  it('creates new list item at end of current item and selectionAfter in text node', async () => {
    setupListWithOneItem();
    setSelection('text-1', 3);

    const op = globalOperationRegistry.get('splitListItem');
    expect(op).toBeDefined();
    const dsl = splitListItemDsl();
    const result = await op!.execute({ type: 'splitListItem', payload: dsl.payload } as any, context);

    expect(result.ok).toBe(true);
    expect(result.selectionAfter).toBeDefined();
    expect(result.selectionAfter!.nodeId).toBeDefined();
    expect(result.selectionAfter!.offset).toBe(0);

    const list = dataStore.getNode('list-1') as INode;
    expect(list.content!.length).toBe(2);
    const newListItemId = list.content![1];
    const newListItem = dataStore.getNode(newListItemId) as INode;
    expect(newListItem.stype).toBe('listItem');
    expect(newListItem.content!.length).toBe(1);
    const newBlockId = newListItem.content![0];
    const newBlock = dataStore.getNode(newBlockId) as INode;
    expect(newBlock.stype).toBe('paragraph');
    expect(newBlock.content!.length).toBe(1);
    const newTextId = newBlock.content![0];
    expect(result.selectionAfter!.nodeId).toBe(newTextId);
    const newText = dataStore.getNode(newTextId) as INode;
    expect(newText.stype).toBe('inline-text');
    expect(newText.text).toBe('');
  });

  it('splits list item when selection in middle', async () => {
    setupListWithOneItem();
    setSelection('text-1', 1);

    const op = globalOperationRegistry.get('splitListItem');
    const dsl = splitListItemDsl();
    const result = await op!.execute({ type: 'splitListItem', payload: dsl.payload } as any, context);

    expect(result.ok).toBe(true);
    expect(result.selectionAfter).toEqual({ nodeId: expect.any(String), offset: 0 });
    const list = dataStore.getNode('list-1') as INode;
    expect(list.content!.length).toBe(2);
    expect(context.lastCreatedBlock).toBeDefined();
    expect(context.lastCreatedBlock.firstTextNodeId).toBe(result.selectionAfter!.nodeId);
  });

  it('no-op when not inside list item', async () => {
    const doc: INode = { sid: 'doc-1', stype: 'document', content: ['p-1'] };
    const p1: INode = { sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' };
    const t1: INode = { sid: 'text-1', stype: 'inline-text', text: 'X', parentId: 'p-1' };
    dataStore.setNode(doc);
    dataStore.setNode(p1);
    dataStore.setNode(t1);
    setSelection('text-1', 0);

    const op = globalOperationRegistry.get('splitListItem');
    const dsl = splitListItemDsl();
    const result = await op!.execute({ type: 'splitListItem', payload: dsl.payload } as any, context);

    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
    const docAfter = dataStore.getNode('doc-1') as INode;
    expect(docAfter.content!.length).toBe(1);
  });

  it('DSL builds descriptor', () => {
    expect(splitListItemDsl()).toEqual({ type: 'splitListItem', payload: {} });
  });
});
