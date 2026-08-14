import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { insertParagraph as insertParagraphDsl } from '../../src/operations-dsl/insertParagraph';
import type { INode } from '@barocss/datastore';

describe('insertParagraph operation (exec, selection-based)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        heading: { name: 'heading', group: 'block', content: 'inline-text*' },
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

  function setupDocWithTwoBlocks(): void {
    const doc: INode = { sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2'] };
    const p1: INode = { sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' };
    const p2: INode = { sid: 'p-2', stype: 'paragraph', content: ['text-2'], parentId: 'doc-1' };
    const t1: INode = { sid: 'text-1', stype: 'inline-text', text: 'AAA', parentId: 'p-1' };
    const t2: INode = { sid: 'text-2', stype: 'inline-text', text: 'B', parentId: 'p-2' };
    dataStore.setNode(doc);
    dataStore.setNode(p1);
    dataStore.setNode(p2);
    dataStore.setNode(t1);
    dataStore.setNode(t2);
  }

  it('inserts new block after reference block when selection at end of block (DSL)', async () => {
    setupDocWithTwoBlocks();
    setSelection('text-1', 3);
    const op = globalOperationRegistry.get('insertParagraph');
    expect(op).toBeDefined();
    // blockType 'same' = 새 블록을 현재 블록과 같은 타입(여기서는 paragraph)으로 생성
    const dsl = insertParagraphDsl('same');
    const result = await op!.execute({ type: 'insertParagraph', payload: dsl.payload } as any, context);

    expect(result.ok).toBe(true);
    expect(result.selectionAfter).toEqual({ nodeId: expect.any(String), offset: 0 });

    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(3);
    const newBlockId = doc.content![1];
    const newBlock = dataStore.getNode(newBlockId) as INode;
    expect(newBlock.stype).toBe('paragraph');
    // selectionAfter.nodeId는 text node id (block은 offset을 가지지 않음)
    expect(newBlock.content).toHaveLength(1);
    expect(result.selectionAfter!.nodeId).toBe(newBlock.content![0]);
  });

  it('inserts new block before reference block when selection at start of block (DSL)', async () => {
    setupDocWithTwoBlocks();
    setSelection('text-1', 0);
    const op = globalOperationRegistry.get('insertParagraph');
    const dsl = insertParagraphDsl('same'); // 새 블록 = paragraph (reference p-1과 동일)

    const result = await op!.execute({ type: 'insertParagraph', payload: dsl.payload } as any, context);

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(3);
    const newBlockId = doc.content![0];
    const newBlock = dataStore.getNode(newBlockId) as INode;
    expect(newBlock.stype).toBe('paragraph');
    expect(doc.content!).toEqual([newBlockId, 'p-1', 'p-2']);
  });

  it('splits block when selection in middle (DSL)', async () => {
    setupDocWithTwoBlocks();
    setSelection('text-1', 1);
    const op = globalOperationRegistry.get('insertParagraph');
    const dsl = insertParagraphDsl();

    const result = await op!.execute({ type: 'insertParagraph', payload: dsl.payload } as any, context);

    expect(result.ok).toBe(true);
    expect(result.selectionAfter).toBeDefined();
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(3);
  });

  it('inserts paragraph when blockType is paragraph (reference is heading)', async () => {
    const doc: INode = { sid: 'doc-1', stype: 'document', content: ['h-1'] };
    const h1: INode = { sid: 'h-1', stype: 'heading', attributes: { level: 2 }, content: ['text-h1'], parentId: 'doc-1' };
    const th1: INode = { sid: 'text-h1', stype: 'inline-text', text: 'Hi', parentId: 'h-1' };
    dataStore.setNode(doc);
    dataStore.setNode(h1);
    dataStore.setNode(th1);
    setSelection('text-h1', 2);
    // blockType 'paragraph' = reference가 heading이어도 새 블록은 항상 paragraph
    const op = globalOperationRegistry.get('insertParagraph');
    const dsl = insertParagraphDsl('paragraph');
    const result = await op!.execute({ type: 'insertParagraph', payload: dsl.payload } as any, context);

    expect(result.ok).toBe(true);
    const parent = dataStore.getNode('doc-1') as INode;
    expect(parent.content!.length).toBe(2);
    const newBlockId = parent.content![1];
    const newBlock = dataStore.getNode(newBlockId) as INode;
    expect(newBlock.stype).toBe('paragraph');
  });

  it('sets lastCreatedBlock and selectionAfter', async () => {
    setupDocWithTwoBlocks();
    setSelection('text-1', 3);
    const op = globalOperationRegistry.get('insertParagraph');
    const dsl = insertParagraphDsl();

    await op!.execute({ type: 'insertParagraph', payload: dsl.payload } as any, context);

    expect(context.lastCreatedBlock).toBeDefined();
    expect(context.lastCreatedBlock.blockId).toBeDefined();
    // 새 블록에 빈 inline-text가 하나 추가되므로 firstTextNodeId가 설정됨
    expect(context.lastCreatedBlock.firstTextNodeId).toBeDefined();
  });

  it('throws when selection is missing or invalid', async () => {
    setupDocWithTwoBlocks();
    context.selection.current = null;
    const op = globalOperationRegistry.get('insertParagraph');
    const dsl = insertParagraphDsl();

    await expect(
      op!.execute({ type: 'insertParagraph', payload: dsl.payload } as any, context)
    ).rejects.toThrow(/insertParagraph: no selection/);
  });

  it('DSL builds descriptor with optional blockType and selectionAlias', () => {
    expect(insertParagraphDsl()).toEqual({ type: 'insertParagraph', payload: {} });
    expect(insertParagraphDsl('paragraph')).toEqual({ type: 'insertParagraph', payload: { blockType: 'paragraph' } });
    expect(insertParagraphDsl('same', 'newBlock')).toEqual({
      type: 'insertParagraph',
      payload: { blockType: 'same', selectionAlias: 'newBlock' }
    });
  });
});

/**
 * A paragraph made of more than one run.
 *
 * A paragraph holds one run per stretch of formatting, so anything with a bold
 * word in it holds several — which is most of a real document. The split used
 * to be attempted only when a paragraph held exactly one text node; every other
 * paragraph fell through to the branch that inserts an empty block beside this
 * one, and since a caret anywhere but the last run reads as "not at the end",
 * it inserted *before*. Reported by hand as a paragraph appearing above with
 * the caret in it, and reproduced from the recording: the caret was in the
 * first of five runs, and the paragraph came back whole with a blank one on top.
 */
describe('insertParagraph across several runs', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  /** "one" + "two" + "three", the way formatting divides a real paragraph. */
  function setupThreeRuns(): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2', 'r-3'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'one', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: 'two', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'r-3', stype: 'inline-text', text: 'three', parentId: 'p-1' } as INode);
  }

  const run = async () => {
    const op = globalOperationRegistry.get('insertParagraph');
    return await op!.execute(
      { type: 'insertParagraph', payload: insertParagraphDsl('same').payload } as any,
      context
    );
  };

  /** The document's blocks, each as the text it now holds. */
  const blocks = (): string[] => {
    const doc = dataStore.getNode('doc-1') as INode;
    return (doc.content ?? []).map((blockId) => {
      const block = dataStore.getNode(blockId) as INode;
      return (block.content ?? [])
        .map((childId) => ((dataStore.getNode(childId) as INode)?.text ?? ''))
        .join('');
    });
  };

  it('splits inside the first run, and does not insert above', async () => {
    setupThreeRuns();
    context.selection.setCaret('r-1', 1); // o|ne two three
    const result = await run();

    expect(result.ok).toBe(true);
    expect(blocks()).toEqual(['o', 'netwothree']);
    // The caret goes with the tail, which is the second block now.
    const doc = dataStore.getNode('doc-1') as INode;
    const tail = dataStore.getNode(doc.content![1]) as INode;
    expect(result.selectionAfter).toEqual({ nodeId: tail.content![0], offset: 0 });
  });

  it('splits on a boundary between two runs without cutting either', async () => {
    setupThreeRuns();
    context.selection.setCaret('r-1', 3); // one| two three
    const result = await run();

    expect(result.ok).toBe(true);
    expect(blocks()).toEqual(['one', 'twothree']);
    expect(result.selectionAfter!.offset).toBe(0);
  });

  it('splits inside the middle run', async () => {
    setupThreeRuns();
    context.selection.setCaret('r-2', 1); // one t|wo three
    await run();
    expect(blocks()).toEqual(['onet', 'wothree']);
  });

  it('splits inside the last run', async () => {
    setupThreeRuns();
    context.selection.setCaret('r-3', 2); // one two th|ree
    await run();
    expect(blocks()).toEqual(['onetwoth', 'ree']);
  });

  it('makes an empty paragraph below when the caret is at the very end', async () => {
    setupThreeRuns();
    context.selection.setCaret('r-3', 5);
    const result = await run();

    expect(blocks()).toEqual(['onetwothree', '']);
    // Somewhere to carry on writing, so the caret goes into it.
    const doc = dataStore.getNode('doc-1') as INode;
    const added = dataStore.getNode(doc.content![1]) as INode;
    expect(result.selectionAfter!.nodeId).toBe(added.content![0]);
  });

  it('makes an empty paragraph above when the caret is at the very start, and leaves the caret in the text', async () => {
    setupThreeRuns();
    context.selection.setCaret('r-1', 0);
    const result = await run();

    expect(blocks()).toEqual(['', 'onetwothree']);
    // The reader is still writing the paragraph they were in, which is now
    // below — not the blank line that opened above it.
    expect(result.selectionAfter).toEqual({ nodeId: 'r-1', offset: 0 });
  });

  it('keeps every run, in order, however the paragraph is cut', async () => {
    for (const [runId, offset] of [['r-1', 1], ['r-1', 3], ['r-2', 2], ['r-3', 0], ['r-3', 4]] as const) {
      setupThreeRuns();
      context.selection.setCaret(runId, offset);
      await run();
      expect(blocks().join(''), `${runId}@${offset}`).toBe('onetwothree');
    }
  });
});
