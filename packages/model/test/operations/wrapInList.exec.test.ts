import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { wrapInList as wrapInListDsl } from '../../src/operations-dsl/wrapInList';
import type { INode } from '@barocss/datastore';

describe('wrapInList operation (exec, selection-based)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        list: { name: 'list', group: 'block', content: 'listItem+', attrs: { type: { type: 'string', default: 'bullet' } } },
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

  it('wraps paragraph in bullet list', async () => {
    const doc: INode = { sid: 'doc-1', stype: 'document', content: ['p-1'] };
    const p1: INode = { sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' };
    const t1: INode = { sid: 'text-1', stype: 'inline-text', text: 'AAA', parentId: 'p-1' };
    dataStore.setNode(doc);
    dataStore.setNode(p1);
    dataStore.setNode(t1);
    setSelection('text-1', 1);

    const op = globalOperationRegistry.get('wrapInList');
    expect(op).toBeDefined();
    const dsl = wrapInListDsl('bullet');
    const result = await op!.execute({ type: 'wrapInList', payload: dsl.payload } as any, context);

    expect(result.ok).toBe(true);
    const docAfter = dataStore.getNode('doc-1') as INode;
    expect(docAfter.content!.length).toBe(1);
    const listId = docAfter.content![0];
    const list = dataStore.getNode(listId) as INode;
    expect(list.stype).toBe('list');
    expect(list.attributes?.type).toBe('bullet');
    expect(list.content!.length).toBe(1);
    const listItemId = list.content![0];
    const listItem = dataStore.getNode(listItemId) as INode;
    expect(listItem.stype).toBe('listItem');
    expect(listItem.content!.length).toBe(1);
    expect(listItem.content![0]).toBe('p-1');
    const p1After = dataStore.getNode('p-1') as INode;
    expect(p1After.content).toEqual(['text-1']);
  });

  it('unwraps when already inside list item', async () => {
    const doc: INode = { sid: 'doc-1', stype: 'document', content: ['list-1'] };
    const list: INode = { sid: 'list-1', stype: 'list', attributes: { type: 'bullet' }, content: ['li-1'], parentId: 'doc-1' };
    const li: INode = { sid: 'li-1', stype: 'listItem', content: ['p-1'], parentId: 'list-1' };
    const p1: INode = { sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'li-1' };
    const t1: INode = { sid: 'text-1', stype: 'inline-text', text: 'X', parentId: 'p-1' };
    dataStore.setNode(doc);
    dataStore.setNode(list);
    dataStore.setNode(li);
    dataStore.setNode(p1);
    dataStore.setNode(t1);
    setSelection('text-1', 0);

    const op = globalOperationRegistry.get('wrapInList');
    const dsl = wrapInListDsl('bullet');
    const result = await op!.execute({ type: 'wrapInList', payload: dsl.payload } as any, context);

    expect(result.ok).toBe(true);
    const docAfter = dataStore.getNode('doc-1') as INode;
    expect(docAfter.content!.length).toBe(1);
    expect(docAfter.content![0]).toBe('p-1');
    const p1After = dataStore.getNode('p-1') as INode;
    expect(p1After.parentId).toBe('doc-1');
  });

  it('DSL builds descriptor with optional listType', () => {
    expect(wrapInListDsl()).toEqual({ type: 'wrapInList', payload: {} });
    expect(wrapInListDsl('bullet')).toEqual({ type: 'wrapInList', payload: { listType: 'bullet' } });
    expect(wrapInListDsl('ordered')).toEqual({ type: 'wrapInList', payload: { listType: 'ordered' } });
  });
});
