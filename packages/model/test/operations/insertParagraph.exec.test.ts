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
