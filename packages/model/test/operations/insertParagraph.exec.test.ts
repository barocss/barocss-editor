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

/**
 * The rest of what Enter has to survive.
 *
 * The split above was wrong for two years' worth of documents because every
 * test had one run per paragraph. That is the lesson worth generalising: the
 * cases that break are the ones the fixtures never had. So these are built
 * around what a real document actually contains — runs that carry formatting,
 * blocks that live inside table cells, headings, empty paragraphs — and around
 * the two things a split must never do, which are lose something and put it in
 * the wrong order.
 *
 * Where a case is a genuine choice rather than an obligation, the test says
 * which choice was made and why, so that changing it is a decision rather than
 * an accident.
 */
describe('insertParagraph, in the shapes a document really has', () => {
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
        table: { name: 'table', group: 'block', content: 'cell+' },
        cell: { name: 'cell', group: 'block', content: 'block+' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  const exec = async (blockType: 'same' | 'paragraph' = 'same') => {
    const op = globalOperationRegistry.get('insertParagraph');
    return await op!.execute(
      { type: 'insertParagraph', payload: insertParagraphDsl(blockType).payload } as any,
      context
    );
  };

  /** The children of a container, each as the text it holds. */
  const textsIn = (containerId: string): string[] => {
    const container = dataStore.getNode(containerId) as INode;
    return (container.content ?? []).map((blockId) => {
      const block = dataStore.getNode(blockId) as INode;
      return (block.content ?? [])
        .map((childId) => ((dataStore.getNode(childId) as INode)?.text ?? ''))
        .join('');
    });
  };

  const runsIn = (blockId: string) => {
    const block = dataStore.getNode(blockId) as INode;
    return (block.content ?? []).map((childId) => {
      const run = dataStore.getNode(childId) as INode;
      return { sid: run.sid, text: run.text, attributes: run.attributes };
    });
  };

  function threeRuns(): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
    dataStore.setNode({
      sid: 'p-1',
      stype: 'paragraph',
      content: ['r-1', 'r-2', 'r-3'],
      parentId: 'doc-1',
      attributes: { align: 'center' }
    } as INode);
    dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'one', parentId: 'p-1' } as INode);
    dataStore.setNode({
      sid: 'r-2',
      stype: 'inline-text',
      text: 'two',
      parentId: 'p-1',
      attributes: { bold: true }
    } as INode);
    dataStore.setNode({ sid: 'r-3', stype: 'inline-text', text: 'three', parentId: 'p-1' } as INode);
  }

  describe('the caret on a run boundary', () => {
    it('at the start of a middle run, cuts nothing and moves that run down', async () => {
      threeRuns();
      context.selection.setCaret('r-2', 0); // one|two three
      await exec();

      expect(textsIn('doc-1')).toEqual(['one', 'twothree']);
      // No run was cut, so none was replaced: the tail still holds the very
      // same nodes, which is what a comment or a decorator anchored to one of
      // them depends on.
      const doc = dataStore.getNode('doc-1') as INode;
      expect(runsIn(doc.content![1]).map((run) => run.sid)).toEqual(['r-2', 'r-3']);
    });

    it('at the end of a middle run, moves only what follows it', async () => {
      threeRuns();
      context.selection.setCaret('r-2', 3); // one two|three
      await exec();

      expect(textsIn('doc-1')).toEqual(['onetwo', 'three']);
      const doc = dataStore.getNode('doc-1') as INode;
      expect(runsIn(doc.content![0]).map((run) => run.sid)).toEqual(['r-1', 'r-2']);
      expect(runsIn(doc.content![1]).map((run) => run.sid)).toEqual(['r-3']);
    });

    it('at the start of the last run', async () => {
      threeRuns();
      context.selection.setCaret('r-3', 0);
      await exec();
      expect(textsIn('doc-1')).toEqual(['onetwo', 'three']);
    });
  });

  describe('what a split carries with it', () => {
    it('keeps the formatting on the runs that moved', async () => {
      threeRuns();
      context.selection.setCaret('r-1', 1);
      await exec();

      const doc = dataStore.getNode('doc-1') as INode;
      const tail = runsIn(doc.content![1]);
      const bold = tail.find((run) => run.text === 'two');
      expect(bold?.attributes).toMatchObject({ bold: true });
    });

    it('keeps the formatting on both halves of a run it cut', async () => {
      threeRuns();
      context.selection.setCaret('r-2', 1); // inside the bold run
      await exec();

      const doc = dataStore.getNode('doc-1') as INode;
      const head = runsIn(doc.content![0]);
      const tail = runsIn(doc.content![1]);
      expect(head[head.length - 1]).toMatchObject({ text: 't', attributes: { bold: true } });
      expect(tail[0]).toMatchObject({ text: 'wo', attributes: { bold: true } });
    });

    it('gives the new paragraph the same type and attributes as the one it came from', async () => {
      threeRuns();
      context.selection.setCaret('r-2', 1);
      await exec();

      const doc = dataStore.getNode('doc-1') as INode;
      const tail = dataStore.getNode(doc.content![1]) as INode;
      expect(tail.stype).toBe('paragraph');
      // A centred paragraph split in two is two centred paragraphs.
      expect(tail.attributes).toMatchObject({ align: 'center' });
    });

    it('splits a heading into two headings', async () => {
      dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['h-1'] } as INode);
      dataStore.setNode({ sid: 'h-1', stype: 'heading', content: ['r-1', 'r-2'], parentId: 'doc-1', attributes: { level: 2 } } as INode);
      dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'Chapter', parentId: 'h-1' } as INode);
      dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: ' one', parentId: 'h-1' } as INode);

      context.selection.setCaret('r-1', 4);
      await exec();

      const doc = dataStore.getNode('doc-1') as INode;
      expect(doc.content).toHaveLength(2);
      const tail = dataStore.getNode(doc.content![1]) as INode;
      expect(tail.stype, '제목을 쪼갰는데 뒷조각이 제목이 아닙니다').toBe('heading');
      expect(tail.attributes).toMatchObject({ level: 2 });
      expect(textsIn('doc-1')).toEqual(['Chap', 'ter one']);
    });
  });

  describe('an empty paragraph', () => {
    it('gets a new empty paragraph below it, with the caret in it', async () => {
      dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2'] } as INode);
      dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['r-1'], parentId: 'doc-1' } as INode);
      dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: '', parentId: 'p-1' } as INode);
      dataStore.setNode({ sid: 'p-2', stype: 'paragraph', content: ['r-2'], parentId: 'doc-1' } as INode);
      dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: 'after', parentId: 'p-2' } as INode);

      context.selection.setCaret('r-1', 0);
      const result = await exec();

      // Below, not above: an empty paragraph's start and end are the same
      // place, and Enter there is somewhere to carry on writing.
      expect(textsIn('doc-1')).toEqual(['', '', 'after']);
      const doc = dataStore.getNode('doc-1') as INode;
      const added = dataStore.getNode(doc.content![1]) as INode;
      expect(result.selectionAfter!.nodeId).toBe(added.content![0]);
    });

    it('splits around an empty run in the middle', async () => {
      dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
      dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2', 'r-3'], parentId: 'doc-1' } as INode);
      dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'left', parentId: 'p-1' } as INode);
      dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: '', parentId: 'p-1' } as INode);
      dataStore.setNode({ sid: 'r-3', stype: 'inline-text', text: 'right', parentId: 'p-1' } as INode);

      context.selection.setCaret('r-2', 0);
      await exec();
      expect(textsIn('doc-1')).toEqual(['left', 'right']);
    });
  });

  describe('inside a table cell', () => {
    function cellWithParagraph(): void {
      dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['t-1'] } as INode);
      dataStore.setNode({ sid: 't-1', stype: 'table', content: ['c-1'], parentId: 'doc-1' } as INode);
      dataStore.setNode({ sid: 'c-1', stype: 'cell', content: ['p-1'], parentId: 't-1' } as INode);
      dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2'], parentId: 'c-1' } as INode);
      dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'cell ', parentId: 'p-1' } as INode);
      dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: 'text', parentId: 'p-1' } as INode);
    }

    it('splits into the cell, not into the document', async () => {
      cellWithParagraph();
      context.selection.setCaret('r-1', 2);
      await exec();

      // The new paragraph is the cell's, and the document still holds one table.
      expect(textsIn('c-1')).toEqual(['ce', 'll text']);
      const doc = dataStore.getNode('doc-1') as INode;
      expect(doc.content, '표를 쪼개는 대신 문서에 문단이 생겼습니다').toEqual(['t-1']);
      const tail = dataStore.getNode((dataStore.getNode('c-1') as INode).content![1]) as INode;
      expect(tail.parentId).toBe('c-1');
    });

    it('adds an empty paragraph to the cell at the end of its text', async () => {
      cellWithParagraph();
      context.selection.setCaret('r-2', 4);
      await exec();

      expect(textsIn('c-1')).toEqual(['cell text', '']);
      const doc = dataStore.getNode('doc-1') as INode;
      expect(doc.content).toEqual(['t-1']);
    });
  });

  describe('undoing it', () => {
    const applyInverse = async (inverse: any) => {
      const op = globalOperationRegistry.get(inverse.type);
      expect(op, `no operation registered for ${inverse.type}`).toBeDefined();
      return await op!.execute({ type: inverse.type, payload: inverse.payload } as any, context);
    };

    it('puts a split paragraph back together', async () => {
      threeRuns();
      context.selection.setCaret('r-2', 1);
      const result = await exec();
      expect(textsIn('doc-1')).toEqual(['onet', 'wothree']);

      await applyInverse(result.inverse);
      expect(textsIn('doc-1'), '되돌렸는데 문단이 하나로 합쳐지지 않았습니다').toEqual(['onetwothree']);
    });

    it('takes back a paragraph added at the end', async () => {
      threeRuns();
      context.selection.setCaret('r-3', 5);
      const result = await exec();
      expect(textsIn('doc-1')).toEqual(['onetwothree', '']);

      await applyInverse(result.inverse);
      expect(textsIn('doc-1')).toEqual(['onetwothree']);
    });

    it('takes back a paragraph added at the start', async () => {
      threeRuns();
      context.selection.setCaret('r-1', 0);
      const result = await exec();
      expect(textsIn('doc-1')).toEqual(['', 'onetwothree']);

      await applyInverse(result.inverse);
      expect(textsIn('doc-1')).toEqual(['onetwothree']);
    });
  });

  describe('when it cannot be done', () => {
    it('refuses without a selection rather than guessing', async () => {
      threeRuns();
      context.selection.clear?.();
      await expect(exec()).rejects.toThrow(/no selection|does not resolve/);
    });

    it('never asks the store to split at an edge, which the store refuses', async () => {
      /**
       * `splitBlockNode` throws outright for position 0 or content.length, and
       * the block's two edges are exactly the positions that would produce
       * them. So every offset in the paragraph has to either split cleanly or
       * take the insert path — there is no third answer, and an off-by-one in
       * deciding which would be a thrown error in the reader's face.
       *
       * A fresh store per position, because each insert claims the alias
       * `insertedBlock` and one overlay may only hold it once.
       */
      const positions: [string, number][] = [];
      for (const [runId, length] of [['r-1', 3], ['r-2', 3], ['r-3', 5]] as const) {
        for (let offset = 0; offset <= length; offset += 1) positions.push([runId, offset]);
      }
      for (const [runId, offset] of positions) {
        dataStore = new DataStore(undefined, schema);
        selectionManager = new SelectionManager({ dataStore });
        context = createTransactionContext(dataStore, selectionManager, schema);
        threeRuns();
        context.selection.setCaret(runId, offset);
        const result = await exec();
        expect(result.ok, `${runId}@${offset}`).toBe(true);
        expect(textsIn('doc-1').join(''), `${runId}@${offset} 에서 글자가 사라졌습니다`).toBe('onetwothree');
        expect(textsIn('doc-1').length, `${runId}@${offset} 에서 문단이 늘지 않았습니다`).toBe(2);
      }
    });

    it('does it again on the paragraph it just made', async () => {
      // Enter twice is one action a reader takes without thinking about it, and
      // the second one runs against a paragraph this operation built rather
      // than one the document was loaded with.
      threeRuns();
      context.selection.setCaret('r-2', 1);
      const first = await exec();
      expect(textsIn('doc-1')).toEqual(['onet', 'wothree']);

      dataStore = new DataStore(undefined, schema);
      selectionManager = new SelectionManager({ dataStore });
      const carried = createTransactionContext(dataStore, selectionManager, schema);
      // Rebuild the state the first split left, and split the tail again.
      dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2'] } as INode);
      dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a-1'], parentId: 'doc-1' } as INode);
      dataStore.setNode({ sid: 'a-1', stype: 'inline-text', text: 'onet', parentId: 'p-1' } as INode);
      dataStore.setNode({ sid: 'p-2', stype: 'paragraph', content: ['b-1', 'b-2'], parentId: 'doc-1' } as INode);
      dataStore.setNode({ sid: 'b-1', stype: 'inline-text', text: 'wo', parentId: 'p-2' } as INode);
      dataStore.setNode({ sid: 'b-2', stype: 'inline-text', text: 'three', parentId: 'p-2' } as INode);
      context = carried;
      context.selection.setCaret('b-1', 1);
      await exec();

      expect(first.ok).toBe(true);
      expect(textsIn('doc-1')).toEqual(['onet', 'w', 'othree']);
    });
  });
});

/**
 * Two shapes where the run's parent is not the paragraph.
 *
 * The operation finds the block to split by taking the *direct parent* of the
 * text node the caret is in. That is the paragraph only when runs are direct
 * children of it, which is the common case and the only one any fixture here
 * has ever had. A link wraps its text, so the direct parent is the link; a
 * paragraph can also hold things that are not text at all.
 *
 * These are written as what a reader would expect, so that if the operation
 * does something else the difference is stated rather than assumed.
 */
describe('insertParagraph where a run is not a direct child', () => {
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
        image: { name: 'image', group: 'inline', content: '' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  const exec = async () => {
    const op = globalOperationRegistry.get('insertParagraph');
    return await op!.execute(
      { type: 'insertParagraph', payload: insertParagraphDsl('same').payload } as any,
      context
    );
  };

  /** Every block in the document, as the text underneath it, however deep. */
  const blockTexts = (): string[] => {
    const doc = dataStore.getNode('doc-1') as INode;
    const textOf = (id: string): string => {
      const node = dataStore.getNode(id) as INode;
      if (!node) return '';
      if (typeof node.text === 'string') return node.text;
      return (node.content ?? []).map(textOf).join('');
    };
    return (doc.content ?? []).map(textOf);
  };

  it('splits the paragraph, not the link, when the caret is inside a link', async () => {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'l-1', 'r-2'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'see ', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'l-1', stype: 'link', content: ['lt-1'], parentId: 'p-1', attributes: { href: 'https://example.com' } } as INode);
    dataStore.setNode({ sid: 'lt-1', stype: 'inline-text', text: 'this page', parentId: 'l-1' } as INode);
    dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: ' now', parentId: 'p-1' } as INode);

    context.selection.setCaret('lt-1', 4); // see this| page now
    await exec();

    // Two paragraphs in the document, cut where the caret was.
    expect(blockTexts(), '링크 안에서 Enter를 쳤는데 문단이 나뉘지 않았습니다').toEqual(['see this', ' page now']);
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content, '문서에 블록이 둘이 아닙니다').toHaveLength(2);
    for (const blockId of doc.content!) {
      expect((dataStore.getNode(blockId) as INode).stype, '쪼갠 결과가 문단이 아닙니다').toBe('paragraph');
    }
  });

  it('splits a paragraph that holds something other than text', async () => {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'img-1', 'r-2'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'before', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'img-1', stype: 'image', content: [], parentId: 'p-1', attributes: { src: 'a.png' } } as INode);
    dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: 'after', parentId: 'p-1' } as INode);

    context.selection.setCaret('r-1', 6); // caret between the text and the image
    await exec();

    expect(blockTexts()).toEqual(['before', 'after']);
    // The picture went with the half it was in, and is still there.
    const doc = dataStore.getNode('doc-1') as INode;
    const tail = dataStore.getNode(doc.content![1]) as INode;
    expect(tail.content, '그림이 사라졌습니다').toContain('img-1');
    expect(dataStore.getNode('img-1'), '그림 노드가 사라졌습니다').toBeTruthy();
  });
});
