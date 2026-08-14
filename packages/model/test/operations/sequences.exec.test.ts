import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * Operations one after another, which is what editing is.
 *
 * The roster runs each operation once, from a clean document. That is enough to
 * catch an operation that is wrong, and not enough to catch an operation that
 * is only wrong *after* another one — which is most of a real session: split,
 * type, split again, undo, type, join. Every fault found in this package so far
 * was in the first edit made to a fixture.
 *
 * Two things are asked of a sequence. The document must still be a tree
 * afterwards, checked between every step rather than at the end, so a failure
 * names the step that caused it. And undoing the whole sequence, in reverse,
 * must give back exactly the document it started from — which is the promise
 * Ctrl+Z makes and the only way to find an inverse that is correct alone and
 * wrong in company.
 */

const makeSchema = () =>
  new Schema('sequence-schema', {
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      heading: { name: 'heading', group: 'block', content: 'inline*' },
      list: { name: 'list', group: 'block', content: 'listItem+' },
      listItem: { name: 'listItem', group: 'block', content: 'block+' },
      link: { name: 'link', group: 'inline', content: 'inline-text*' },
      'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: ['bold'] }
    },
    marks: { bold: { name: 'bold' } }
  });

function buildDocument(dataStore: DataStore): void {
  const set = (node: Partial<INode>) => dataStore.setNode(node as INode);
  set({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2', 'list-1'] });

  set({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2', 'r-3'], parentId: 'doc-1', attributes: { align: 'left' } });
  set({ sid: 'r-1', stype: 'inline-text', text: 'one', parentId: 'p-1' });
  set({ sid: 'r-2', stype: 'inline-text', text: 'two', parentId: 'p-1', marks: [{ stype: 'bold', range: [0, 3] }] } as any);
  set({ sid: 'r-3', stype: 'inline-text', text: 'three', parentId: 'p-1' });

  set({ sid: 'p-2', stype: 'paragraph', content: ['s-1', 'l-1', 's-2'], parentId: 'doc-1', attributes: { align: 'center' } });
  set({ sid: 's-1', stype: 'inline-text', text: 'see ', parentId: 'p-2' });
  set({ sid: 'l-1', stype: 'link', content: ['lt-1'], parentId: 'p-2', attributes: { href: 'https://example.com' } });
  set({ sid: 'lt-1', stype: 'inline-text', text: 'this page', parentId: 'l-1' });
  set({ sid: 's-2', stype: 'inline-text', text: ' now', parentId: 'p-2' });

  set({ sid: 'list-1', stype: 'list', content: ['li-1'], parentId: 'doc-1' });
  set({ sid: 'li-1', stype: 'listItem', content: ['lp-1'], parentId: 'list-1' });
  set({ sid: 'lp-1', stype: 'paragraph', content: ['lr-1'], parentId: 'li-1' });
  set({ sid: 'lr-1', stype: 'inline-text', text: 'bullet', parentId: 'lp-1' });
}

function shapeOf(dataStore: DataStore, rootId = 'doc-1'): unknown {
  const node = dataStore.getNode(rootId) as INode;
  if (!node) return null;
  const shape: Record<string, unknown> = { stype: node.stype };
  if (typeof node.text === 'string') shape.text = node.text;
  if (node.marks && node.marks.length > 0) shape.marks = node.marks;
  if (node.attributes && Object.keys(node.attributes).length > 0) {
    const { $alias, ...rest } = node.attributes as Record<string, unknown>;
    if (Object.keys(rest).length > 0) shape.attributes = rest;
  }
  if (Array.isArray(node.content) && node.content.length > 0) {
    shape.content = node.content.map((childId) => shapeOf(dataStore, childId as string));
  }
  return shape;
}

function faultsInTree(dataStore: DataStore, rootId = 'doc-1'): string[] {
  const faults: string[] = [];
  const seen = new Map<string, string>();
  const walk = (id: string, parentId: string | null, trail: string[]): void => {
    if (trail.includes(id)) {
      faults.push(`cycle at ${id}`);
      return;
    }
    const node = dataStore.getNode(id) as INode;
    if (!node) {
      faults.push(`${parentId} 의 content 에 없는 노드: ${id}`);
      return;
    }
    if (seen.has(id)) {
      faults.push(`${id} 을(를) ${seen.get(id)} 와 ${parentId} 가 함께 가지고 있습니다`);
      return;
    }
    seen.set(id, parentId ?? '(root)');
    if (parentId) {
      const declared = (node as { parentId?: string }).parentId;
      const resolved = declared ? dataStore.resolveAlias(declared) : declared;
      if (resolved !== parentId) faults.push(`${id} 의 parentId 가 ${declared} 인데 실제로는 ${parentId} 안에 있습니다`);
    }
    for (const childId of ((node.content ?? []) as string[])) walk(childId, id, [...trail, id]);
  };
  walk(rootId, null, []);
  return faults;
}

const allText = (dataStore: DataStore, rootId = 'doc-1'): string => {
  const node = dataStore.getNode(rootId) as INode;
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map((id) => allText(dataStore, id as string)).join('');
};

type Step = { type: string; payload?: Record<string, unknown>; caret?: [string, number] };

describe('operations in sequence', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = makeSchema();
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
    buildDocument(dataStore);
  });

  /**
   * Run the steps, checking the tree between each, and keep the inverses.
   * Returns them newest-first, which is the order undo applies them in.
   */
  const play = async (steps: Step[]): Promise<{ type: string; payload: any }[]> => {
    const inverses: { type: string; payload: any }[] = [];
    for (const [index, step] of steps.entries()) {
      if (step.caret) context.selection.setCaret(step.caret[0], step.caret[1]);
      const op = globalOperationRegistry.get(step.type);
      expect(op, `${step.type} is not registered`).toBeDefined();
      const result = await op!.execute({ type: step.type, payload: step.payload ?? {} } as any, context);
      expect(
        faultsInTree(dataStore),
        `${index + 1}번째 (${step.type}) 뒤에 문서 구조가 깨졌습니다`
      ).toEqual([]);
      if ((result as any)?.inverse) inverses.unshift((result as any).inverse);
    }
    return inverses;
  };

  const undoAll = async (inverses: { type: string; payload: any }[]) => {
    for (const [index, inverse] of inverses.entries()) {
      const op = globalOperationRegistry.get(inverse.type);
      expect(op, `inverse ${inverse.type} is not registered`).toBeDefined();
      await op!.execute({ type: inverse.type, payload: inverse.payload, ...inverse } as any, context);
      expect(
        faultsInTree(dataStore),
        `${index + 1}번째 되돌리기 (${inverse.type}) 뒤에 문서 구조가 깨졌습니다`
      ).toEqual([]);
    }
  };

  it('splits a paragraph three times and undoes back to one', async () => {
    const before = shapeOf(dataStore);
    const inverses = await play([
      { type: 'insertParagraph', caret: ['r-1', 1] },
      { type: 'insertParagraph', caret: ['r-2', 1] },
      { type: 'insertParagraph', caret: ['r-3', 2] }
    ]);
    expect(allText(dataStore)).toContain('onetwothree');

    await undoAll(inverses);
    expect(shapeOf(dataStore), '세 번 쪼갠 뒤 되돌렸는데 원래 문서가 아닙니다').toEqual(before);
  });

  it('types, splits, types again, and undoes all of it', async () => {
    const before = shapeOf(dataStore);
    const inverses = await play([
      { type: 'insertText', payload: { nodeId: 'r-1', pos: 3, text: 'X' } },
      { type: 'insertParagraph', caret: ['r-1', 2] },
      { type: 'insertText', payload: { nodeId: 'r-3', pos: 0, text: 'Y' } }
    ]);

    await undoAll(inverses);
    expect(shapeOf(dataStore), '입력과 분할을 섞은 뒤 되돌렸는데 원래 문서가 아닙니다').toEqual(before);
  });

  it('splits inside a link and puts it back', async () => {
    const before = shapeOf(dataStore);
    const inverses = await play([{ type: 'insertParagraph', caret: ['lt-1', 4] }]);
    expect(allText(dataStore)).toContain('see this page now');

    await undoAll(inverses);
    expect(shapeOf(dataStore), '링크 안에서 쪼갠 뒤 되돌렸는데 원래 문서가 아닙니다').toEqual(before);
  });

  it('splits a bullet twice and undoes back to one', async () => {
    const before = shapeOf(dataStore);
    const inverses = await play([
      { type: 'splitListItem', caret: ['lr-1', 3] },
      { type: 'splitListItem', caret: ['lr-1', 1] }
    ]);

    await undoAll(inverses);
    expect(shapeOf(dataStore), '목록을 두 번 쪼갠 뒤 되돌렸는데 원래 문서가 아닙니다').toEqual(before);
  });

  it('joins two paragraphs, splits the result, and undoes both', async () => {
    const before = shapeOf(dataStore);
    const inverses = await play([
      { type: 'mergeBlockNodes', payload: { leftNodeId: 'p-1', rightNodeId: 'p-2' } },
      { type: 'insertParagraph', caret: ['r-2', 1] }
    ]);

    await undoAll(inverses);
    expect(shapeOf(dataStore), '합치고 쪼갠 뒤 되돌렸는데 원래 문서가 아닙니다').toEqual(before);
  });

  it('deletes a run, adds one, reorders, and undoes the lot', async () => {
    const before = shapeOf(dataStore);
    const inverses = await play([
      { type: 'delete', payload: { nodeId: 'r-3' } },
      { type: 'addChild', payload: { parentId: 'p-1', child: { stype: 'inline-text', text: 'new' }, position: 2 } },
      { type: 'reorderChildren', payload: { parentId: 'p-1', childIds: ['r-2', 'r-1'] } }
    ]);

    await undoAll(inverses);
    expect(shapeOf(dataStore), '지우고 넣고 순서를 바꾼 뒤 되돌렸는데 원래 문서가 아닙니다').toEqual(before);
  });

  it('keeps the marked run marked through a split and an undo', async () => {
    const inverses = await play([{ type: 'insertParagraph', caret: ['r-2', 1] }]);

    await undoAll(inverses);
    const rejoined = ((dataStore.getNode('p-1') as INode).content ?? []).map(
      (id) => dataStore.getNode(id) as INode
    );
    const bold = rejoined.find((run) => (run.marks ?? []).some((mark: any) => (mark.stype ?? mark.type) === 'bold'));
    expect(bold?.text, '굵게였던 런이 원래대로 돌아오지 않았습니다').toBe('two');
    expect((bold?.marks ?? [])[0]).toMatchObject({ range: [0, 3] });
  });
});
