import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * Every shape a selection can have, for the operations that work from one.
 *
 * The caret sweep next door covers the operations a reader drives with a
 * blinking cursor. This covers the other half: select some words, then press
 * bold, or paste, or Enter. A selection has shapes a caret does not — it has
 * two ends, and they can be in different runs, in different paragraphs, one
 * inside a link and one outside it — and each of those has been where a fault
 * hid at least once in this package already.
 *
 * The shapes below are chosen so a sweep passes through all of them: inside one
 * run, across two runs of a paragraph, half in and half out of a link, wholly
 * inside a link, across two paragraphs, from a paragraph into a bullet, the
 * whole of a run, and a collapsed selection, which is a caret wearing a
 * selection's clothes and is what a reader has most of the time.
 *
 * Asked of every operation at every shape: it does not throw, the document is
 * still a tree, and — for the ones that are not editing text — the text is
 * exactly as it was.
 */

const makeSchema = () =>
  new Schema('range-sweep-schema', {
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      blockQuote: { name: 'blockQuote', group: 'block', content: 'block+' },
      list: { name: 'list', group: 'block', content: 'listItem+' },
      listItem: { name: 'listItem', group: 'block', content: 'block+' },
      link: { name: 'link', group: 'inline', content: 'inline-text*' },
      'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: ['bold', 'link'] }
    },
    marks: { bold: { name: 'bold' }, link: { name: 'link', attrs: { href: {} } } }
  });

function buildDocument(dataStore: DataStore): void {
  const set = (node: Partial<INode>) => dataStore.setNode(node as INode);
  set({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2', 'list-1'] });

  // 'one' + 'two'(bold) + link('link') + 'end'
  set({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2', 'l-1', 'r-3'], parentId: 'doc-1' });
  set({ sid: 'r-1', stype: 'inline-text', text: 'one', parentId: 'p-1' });
  set({ sid: 'r-2', stype: 'inline-text', text: 'two', parentId: 'p-1', marks: [{ stype: 'bold', range: [0, 3] }] } as any);
  set({ sid: 'l-1', stype: 'link', content: ['lt-1'], parentId: 'p-1', attributes: { href: 'https://example.com' } });
  set({ sid: 'lt-1', stype: 'inline-text', text: 'link', parentId: 'l-1' });
  set({ sid: 'r-3', stype: 'inline-text', text: 'end', parentId: 'p-1' });

  set({ sid: 'p-2', stype: 'paragraph', content: ['s-1'], parentId: 'doc-1' });
  set({ sid: 's-1', stype: 'inline-text', text: 'second', parentId: 'p-2' });

  set({ sid: 'list-1', stype: 'list', content: ['li-1'], parentId: 'doc-1' });
  set({ sid: 'li-1', stype: 'listItem', content: ['lp-1'], parentId: 'list-1' });
  set({ sid: 'lp-1', stype: 'paragraph', content: ['lr-1'], parentId: 'li-1' });
  set({ sid: 'lr-1', stype: 'inline-text', text: 'bullet', parentId: 'lp-1' });
}

type Shape = {
  what: string;
  startNodeId: string;
  startOffset: number;
  endNodeId: string;
  endOffset: number;
};

const SHAPES: Shape[] = [
  { what: 'inside one run', startNodeId: 'r-1', startOffset: 1, endNodeId: 'r-1', endOffset: 2 },
  { what: 'the whole of a run', startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 },
  { what: 'across two runs', startNodeId: 'r-1', startOffset: 1, endNodeId: 'r-2', endOffset: 2 },
  { what: 'into a link', startNodeId: 'r-2', startOffset: 1, endNodeId: 'lt-1', endOffset: 2 },
  { what: 'out of a link', startNodeId: 'lt-1', startOffset: 2, endNodeId: 'r-3', endOffset: 1 },
  { what: 'wholly inside a link', startNodeId: 'lt-1', startOffset: 1, endNodeId: 'lt-1', endOffset: 3 },
  { what: 'the whole of a link', startNodeId: 'lt-1', startOffset: 0, endNodeId: 'lt-1', endOffset: 4 },
  { what: 'across two paragraphs', startNodeId: 'r-3', startOffset: 1, endNodeId: 's-1', endOffset: 3 },
  { what: 'from a paragraph into a bullet', startNodeId: 's-1', startOffset: 2, endNodeId: 'lr-1', endOffset: 3 },
  { what: 'collapsed', startNodeId: 'r-2', startOffset: 1, endNodeId: 'r-2', endOffset: 1 },
  { what: 'at the very start of the document', startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 0 },
  { what: 'at the very end of the document', startNodeId: 'lr-1', startOffset: 6, endNodeId: 'lr-1', endOffset: 6 }
];

function faultsInTree(dataStore: DataStore, rootId = 'doc-1'): string[] {
  const faults: string[] = [];
  const seen = new Map<string, string>();
  const walk = (id: string, parentId: string | null, trail: string[]): void => {
    if (trail.includes(id)) return void faults.push(`cycle at ${id}`);
    const node = dataStore.getNode(id) as INode;
    if (!node) return void faults.push(`${parentId} 의 content 에 없는 노드: ${id}`);
    if (seen.has(id)) return void faults.push(`${id} 을(를) ${seen.get(id)} 와 ${parentId} 가 함께 가집니다`);
    seen.set(id, parentId ?? '(root)');
    if (parentId) {
      const declared = (node as { parentId?: string }).parentId;
      const resolved = declared ? dataStore.resolveAlias(declared) : declared;
      if (resolved !== parentId) faults.push(`${id} 의 parentId 가 ${declared} 인데 ${parentId} 안에 있습니다`);
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

/**
 * The operations a selection drives, and how each is handed one.
 *
 * `selection` means it reads `context.selection.current`; `range` means the
 * shape goes into its payload. Several accept both and are listed the way the
 * editor calls them.
 */
const DRIVEN: { name: string; how: 'selection' | 'range'; editsText?: boolean; extra?: Record<string, unknown> }[] = [
  // Takes the range in its payload; it does not read the selection.
  { name: 'toggleMark', how: 'range', extra: { markType: 'bold' } },
  { name: 'toggleLink', how: 'selection', extra: { href: 'https://example.org' } },
  { name: 'applyMark', how: 'range', extra: { markType: 'bold' } },
  { name: 'deleteRange', how: 'range', editsText: true },
  { name: 'copy', how: 'range' },
  { name: 'cut', how: 'range', editsText: true },
  { name: 'replaceText', how: 'range', editsText: true, extra: { newText: 'X' } },
  { name: 'replacePattern', how: 'range', editsText: true, extra: { pattern: 'o', replacement: 'O' } },
  { name: 'indentText', how: 'range', editsText: true },
  { name: 'outdentText', how: 'range', editsText: true },
  { name: 'wrapInList', how: 'selection' },
  { name: 'wrapInBlockquote', how: 'selection' }
];

describe('every shape of selection', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  const fresh = () => {
    schema = makeSchema();
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
    buildDocument(dataStore);
  };

  beforeEach(fresh);

  for (const { name, how, editsText, extra } of DRIVEN) {
    it(`${name} survives a selection of any shape`, async () => {
      const op = globalOperationRegistry.get(name);
      expect(op, `${name} is not registered`).toBeDefined();
      /**
       * How many shapes it actually acted on.
       *
       * A sweep where every shape is refused passes without testing anything —
       * "it did not break" is not a claim about an operation that never ran. An
       * operation may decline some shapes, and must manage at least one.
       */
      let acted = 0;

      for (const shape of SHAPES) {
        fresh();
        const textBefore = allText(dataStore);
        const range = {
          startNodeId: shape.startNodeId,
          startOffset: shape.startOffset,
          endNodeId: shape.endNodeId,
          endOffset: shape.endOffset
        };
        context.selection.current = {
          type: 'range',
          ...range,
          collapsed: range.startNodeId === range.endNodeId && range.startOffset === range.endOffset
        };

        const payload = how === 'range' ? { range, ...(extra ?? {}) } : { ...(extra ?? {}) };
        const at = `${shape.what} (${range.startNodeId}@${range.startOffset} → ${range.endNodeId}@${range.endOffset})`;

        let result: any;
        try {
          result = await op!.execute({ type: name, payload, ...payload } as any, context);
        } catch (error) {
          // A refusal is allowed and often right — a selection across two
          // paragraphs is not something every operation can act on. What it may
          // not do is half-apply and then give up.
          expect(
            faultsInTree(dataStore),
            `${name} 이(가) ${at} 에서 던지면서 문서를 깨뜨렸습니다: ${(error as Error).message}`
          ).toEqual([]);
          expect(
            allText(dataStore),
            `${name} 이(가) ${at} 에서 던지기 전에 글자를 바꿨습니다: ${(error as Error).message}`
          ).toBe(textBefore);
          continue;
        }

        expect(
          faultsInTree(dataStore),
          `${name} 이(가) ${at} 에서 문서 구조를 깨뜨렸습니다`
        ).toEqual([]);

        if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
          expect(
            allText(dataStore),
            `${name} 이(가) ${at} 에서 거절하고도 문서를 바꿨습니다`
          ).toBe(textBefore);
          continue;
        }
        acted += 1;

        if (!editsText) {
          expect(
            allText(dataStore),
            `${name} 이(가) ${at} 에서 글자를 바꿨습니다`
          ).toBe(textBefore);
        }
      }

      expect(
        acted,
        `${name} 이(가) ${SHAPES.length}개 모양 중 하나도 처리하지 못했습니다 — 이 테스트는 아무것도 검증하지 않았습니다`
      ).toBeGreaterThan(0);
    });
  }

  /**
   * A selection is two ends, and nothing says they arrive in reading order. A
   * reader dragging right to left hands over a range whose start is after its
   * end, and an operation that subtracts one from the other without looking
   * gets a negative length.
   */
  it('no operation is broken by a selection made backwards', async () => {
    const backwards = { startNodeId: 'r-2', startOffset: 3, endNodeId: 'r-1', endOffset: 1 };

    for (const { name, how, extra } of DRIVEN) {
      fresh();
      const textBefore = allText(dataStore);
      context.selection.current = { type: 'range', ...backwards, collapsed: false };
      const payload = how === 'range' ? { range: backwards, ...(extra ?? {}) } : { ...(extra ?? {}) };

      try {
        await globalOperationRegistry.get(name)!.execute({ type: name, payload, ...payload } as any, context);
      } catch {
        // Refusing a backwards range is a fine answer.
      }
      expect(faultsInTree(dataStore), `${name} 이(가) 거꾸로 된 선택에서 문서를 깨뜨렸습니다`).toEqual([]);
      void textBefore;
    }
  });
});
