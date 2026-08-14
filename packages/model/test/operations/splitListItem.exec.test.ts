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

/**
 * What a list item actually holds when Enter arrives.
 *
 * The test above this one asserts that the list grew from one item to two, and
 * that something was created. It does not read a single character, so it passes
 * whether the item was split or merely followed by an empty one — which is the
 * same way a paragraph split went wrong for two years while its tests counted
 * paragraphs.
 *
 * The gate deciding whether to split is
 *
 *     listItem.content.length === 1 && listItem.content[0] === textNodeId
 *
 * and a list item's content holds *blocks*: `[paragraph]`. `content[0]` is
 * therefore the paragraph's sid and can never equal a text node's, so the
 * comparison is false for every list item there has ever been. These read the
 * text, and say which half went where.
 */
describe('splitListItem, reading what the items hold', () => {
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

  const exec = async () => {
    const op = globalOperationRegistry.get('splitListItem');
    return await op!.execute(
      { type: 'splitListItem', payload: splitListItemDsl().payload } as any,
      context
    );
  };

  /** Each list item, as the text underneath it, however deep. */
  const itemTexts = (): string[] => {
    const textOf = (id: string): string => {
      const node = dataStore.getNode(id) as INode;
      if (!node) return '';
      if (typeof node.text === 'string') return node.text;
      return (node.content ?? []).map(textOf).join('');
    };
    const list = dataStore.getNode('list-1') as INode;
    return (list.content ?? []).map(textOf);
  };

  /** One item, "AAA", the way the tests above build it. */
  function oneItem(): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['list-1'] } as INode);
    dataStore.setNode({ sid: 'list-1', stype: 'list', content: ['li-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'li-1', stype: 'listItem', content: ['p-1'], parentId: 'list-1' } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['t-1'], parentId: 'li-1' } as INode);
    dataStore.setNode({ sid: 't-1', stype: 'inline-text', text: 'AAA', parentId: 'p-1' } as INode);
  }

  /** One item made of three runs, which is what formatting produces. */
  function oneItemThreeRuns(): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['list-1'] } as INode);
    dataStore.setNode({ sid: 'list-1', stype: 'list', content: ['li-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'li-1', stype: 'listItem', content: ['p-1'], parentId: 'list-1' } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2', 'r-3'], parentId: 'li-1' } as INode);
    dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'one', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: 'two', parentId: 'p-1', attributes: { bold: true } } as INode);
    dataStore.setNode({ sid: 'r-3', stype: 'inline-text', text: 'three', parentId: 'p-1' } as INode);
  }

  it('cuts the text in the middle and gives the second half to the new item', async () => {
    oneItem();
    context.selection.setCaret('t-1', 1); // A|AA
    await exec();

    expect(itemTexts(), '목록 항목이 나뉘지 않았습니다').toEqual(['A', 'AA']);
  });

  it('leaves the text whole and opens an empty item at the end', async () => {
    oneItem();
    context.selection.setCaret('t-1', 3);
    await exec();

    expect(itemTexts()).toEqual(['AAA', '']);
  });

  it('opens an empty item above when the caret is at the start', async () => {
    oneItem();
    context.selection.setCaret('t-1', 0);
    const result = await exec();

    // An empty bullet above, and the reader still writing the one they were in.
    expect(itemTexts()).toEqual(['', 'AAA']);
    expect(result.selectionAfter, '커서가 원래 글자에 남아 있지 않습니다').toEqual({ nodeId: 't-1', offset: 0 });
  });

  it('cuts an item made of several runs', async () => {
    oneItemThreeRuns();
    context.selection.setCaret('r-1', 1); // o|ne two three
    await exec();

    expect(itemTexts(), '런이 여러 개인 항목이 나뉘지 않았습니다').toEqual(['o', 'netwothree']);
  });

  it('keeps the formatting of the runs that moved', async () => {
    oneItemThreeRuns();
    context.selection.setCaret('r-1', 3);
    await exec();

    expect(itemTexts()).toEqual(['one', 'twothree']);
    const list = dataStore.getNode('list-1') as INode;
    const secondItem = dataStore.getNode(list.content![1]) as INode;
    const paragraph = dataStore.getNode(secondItem.content![0] as string) as INode;
    const runs = (paragraph.content ?? []).map((id) => dataStore.getNode(id) as INode);
    expect(runs.find((run) => run.text === 'two')?.attributes).toMatchObject({ bold: true });
  });

  it('keeps every character however the item is cut', async () => {
    for (const [runId, offset] of [['r-1', 1], ['r-1', 3], ['r-2', 2], ['r-3', 0], ['r-3', 4]] as const) {
      dataStore = new DataStore(undefined, schema);
      selectionManager = new SelectionManager({ dataStore });
      context = createTransactionContext(dataStore, selectionManager, schema);
      oneItemThreeRuns();
      context.selection.setCaret(runId, offset);
      await exec();
      expect(itemTexts().join(''), `${runId}@${offset} 에서 글자가 달라졌습니다`).toBe('onetwothree');
      expect(itemTexts().length, `${runId}@${offset} 에서 항목이 늘지 않았습니다`).toBe(2);
    }
  });

  it('splits the item it is in, not the one before it', async () => {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['list-1'] } as INode);
    dataStore.setNode({ sid: 'list-1', stype: 'list', content: ['li-1', 'li-2'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'li-1', stype: 'listItem', content: ['p-1'], parentId: 'list-1' } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['t-1'], parentId: 'li-1' } as INode);
    dataStore.setNode({ sid: 't-1', stype: 'inline-text', text: 'first', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'li-2', stype: 'listItem', content: ['p-2'], parentId: 'list-1' } as INode);
    dataStore.setNode({ sid: 'p-2', stype: 'paragraph', content: ['t-2'], parentId: 'li-2' } as INode);
    dataStore.setNode({ sid: 't-2', stype: 'inline-text', text: 'second', parentId: 'p-2' } as INode);

    context.selection.setCaret('t-2', 2); // se|cond
    await exec();

    expect(itemTexts()).toEqual(['first', 'se', 'cond']);
  });
});
