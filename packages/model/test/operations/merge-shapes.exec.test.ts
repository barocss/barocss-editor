import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * Joining two blocks back together — Backspace at the start of a paragraph.
 *
 * This is the inverse of the split that was found broken, so it is checked
 * against the same shapes: paragraphs made of several runs, text wrapped in a
 * link, and a block that ends in something which is not text at all. A merge
 * that only ever ran against one-run fixtures has had exactly as much chance to
 * be wrong.
 *
 * Two things must hold whatever the shape. Nothing may be lost or reordered —
 * the merged block reads as the two blocks did, in order. And the caret must
 * land on the seam, because that is what the reader is looking at: they pressed
 * Backspace to join two lines and expect to be standing where the join is.
 */
describe('merging two blocks, in the shapes a document really has', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        heading: { name: 'heading', group: 'block', content: 'inline*' },
        link: { name: 'link', group: 'inline', content: 'inline-text*' },
        image: { name: 'image', group: 'inline', content: '' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  const merge = async (leftNodeId: string, rightNodeId: string) => {
    const op = globalOperationRegistry.get('mergeBlockNodes');
    return await op!.execute({ type: 'mergeBlockNodes', payload: { leftNodeId, rightNodeId } } as any, context);
  };

  const textUnder = (id: string): string => {
    const node = dataStore.getNode(id) as INode;
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    return (node.content ?? []).map(textUnder).join('');
  };

  const blocks = (): string[] => ((dataStore.getNode('doc-1') as INode).content ?? []).map(textUnder);

  function twoParagraphsOfRuns(): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a-1', 'a-2'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'a-1', stype: 'inline-text', text: 'one', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'a-2', stype: 'inline-text', text: 'two', parentId: 'p-1', attributes: { bold: true } } as INode);
    dataStore.setNode({ sid: 'p-2', stype: 'paragraph', content: ['b-1', 'b-2'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'b-1', stype: 'inline-text', text: 'three', parentId: 'p-2' } as INode);
    dataStore.setNode({ sid: 'b-2', stype: 'inline-text', text: 'four', parentId: 'p-2', attributes: { italic: true } } as INode);
  }

  it('keeps every run, in order, when both sides have several', async () => {
    twoParagraphsOfRuns();
    await merge('p-1', 'p-2');

    expect(blocks(), '병합 결과의 글자 순서가 다릅니다').toEqual(['onetwothreefour']);
  });

  it('keeps the formatting each run came with', async () => {
    twoParagraphsOfRuns();
    await merge('p-1', 'p-2');

    const merged = dataStore.getNode('p-1') as INode;
    const runs = (merged.content ?? []).map((id) => dataStore.getNode(id) as INode);
    expect(runs.find((run) => run.text === 'two')?.attributes).toMatchObject({ bold: true });
    expect(runs.find((run) => run.text === 'four')?.attributes).toMatchObject({ italic: true });
  });

  it('puts the caret on the seam', async () => {
    twoParagraphsOfRuns();
    await merge('p-1', 'p-2');

    // Where the reader was looking: the end of what the first line held.
    expect(context.selection.current, '커서가 이어붙인 자리에 있지 않습니다').toMatchObject({
      startNodeId: 'a-2',
      startOffset: 3
    });
  });

  it('puts the caret on the seam even when the left block ends in a link', async () => {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a-1', 'l-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'a-1', stype: 'inline-text', text: 'see ', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'l-1', stype: 'link', content: ['lt-1'], parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'lt-1', stype: 'inline-text', text: 'here', parentId: 'l-1' } as INode);
    dataStore.setNode({ sid: 'p-2', stype: 'paragraph', content: ['b-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'b-1', stype: 'inline-text', text: 'next', parentId: 'p-2' } as INode);

    await merge('p-1', 'p-2');

    expect(blocks()).toEqual(['see herenext']);
    // The last child is a link, not text — the caret still has to be somewhere
    // a caret can be, which is the last text inside it.
    expect(context.selection.current, '커서가 텍스트가 아닌 곳에 남았습니다').toMatchObject({
      startNodeId: 'lt-1',
      startOffset: 4
    });
  });

  it('joins onto a block that ends with a picture', async () => {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a-1', 'img-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'a-1', stype: 'inline-text', text: 'look', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'img-1', stype: 'image', content: [], parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'p-2', stype: 'paragraph', content: ['b-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'b-1', stype: 'inline-text', text: 'after', parentId: 'p-2' } as INode);

    await merge('p-1', 'p-2');

    expect(blocks()).toEqual(['lookafter']);
    expect(dataStore.getNode('img-1'), '그림이 사라졌습니다').toBeTruthy();
    expect(context.selection.current, '커서가 아무 데도 놓이지 않았습니다').toBeTruthy();
    const caretNode = dataStore.getNode(context.selection.current.startNodeId) as INode;
    expect(typeof caretNode?.text, '커서가 텍스트 노드에 있지 않습니다').toBe('string');
  });

  it('joins an empty block onto one with text', async () => {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'a-1', stype: 'inline-text', text: 'kept', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'p-2', stype: 'paragraph', content: ['b-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'b-1', stype: 'inline-text', text: '', parentId: 'p-2' } as INode);

    await merge('p-1', 'p-2');
    expect(blocks()).toEqual(['kept']);
  });

  it('joins a block with text onto an empty one', async () => {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'a-1', stype: 'inline-text', text: '', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'p-2', stype: 'paragraph', content: ['b-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'b-1', stype: 'inline-text', text: 'moved', parentId: 'p-2' } as INode);

    await merge('p-1', 'p-2');
    expect(blocks()).toEqual(['moved']);
  });

  it('undoes back into the two blocks it came from', async () => {
    twoParagraphsOfRuns();
    const result = await merge('p-1', 'p-2');
    expect(blocks()).toEqual(['onetwothreefour']);

    const inverse = globalOperationRegistry.get(result.inverse!.type);
    await inverse!.execute({ type: result.inverse!.type, payload: result.inverse!.payload } as any, context);

    expect(blocks(), '되돌렸는데 원래 두 문단이 아닙니다').toEqual(['onetwo', 'threefour']);
  });
});

/**
 * A split and a merge are one action and its undo, so they have to agree about
 * where the seam was. They are written apart and were tested apart, which is
 * how they can disagree: the split now cuts anywhere in a block of many runs,
 * and the merge's undo counts children.
 */
describe('a split and a merge, against each other', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        link: { name: 'link', group: 'inline', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  const textUnder = (id: string): string => {
    const node = dataStore.getNode(id) as INode;
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    return (node.content ?? []).map(textUnder).join('');
  };
  const blocks = (): string[] => ((dataStore.getNode('doc-1') as INode).content ?? []).map(textUnder);

  it('a split undone by its own inverse leaves the paragraph as it was', async () => {
    for (const [runId, offset] of [['r-1', 1], ['r-1', 3], ['r-2', 2], ['r-3', 0], ['r-3', 4]] as const) {
      dataStore = new DataStore(undefined, schema);
      selectionManager = new SelectionManager({ dataStore });
      context = createTransactionContext(dataStore, selectionManager, schema);
      dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
      dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2', 'r-3'], parentId: 'doc-1' } as INode);
      dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'one', parentId: 'p-1' } as INode);
      dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: 'two', parentId: 'p-1' } as INode);
      dataStore.setNode({ sid: 'r-3', stype: 'inline-text', text: 'three', parentId: 'p-1' } as INode);

      context.selection.setCaret(runId, offset);
      const split = globalOperationRegistry.get('insertParagraph');
      const result = await split!.execute({ type: 'insertParagraph', payload: {} } as any, context);
      expect(blocks().length, `${runId}@${offset}`).toBe(2);

      const inverse = globalOperationRegistry.get(result.inverse!.type);
      await inverse!.execute({ type: result.inverse!.type, payload: result.inverse!.payload } as any, context);

      expect(blocks(), `${runId}@${offset} 을(를) 되돌리지 못했습니다`).toEqual(['onetwothree']);
    }
  });
});
