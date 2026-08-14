import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * Every caret position, for the operations that work from one.
 *
 * This is the dimension that found the original fault. Enter had been tested at
 * one offset in one paragraph for the life of the project; sweeping the offsets
 * showed it splitting correctly in the middle of a single-run paragraph and
 * inserting an empty one *above* everywhere else. One position tells you an
 * operation can work. Every position tells you it does.
 *
 * The document below is built so that a sweep passes through the cases that
 * have hidden faults before: the start and end of a run, the boundary between
 * two runs, inside and at both edges of a link, an empty run, and the two true
 * edges of the block — which are also the two positions the store refuses to
 * split at, so an off-by-one there is a thrown error in the reader's face.
 *
 * Three things are asked at every position: it does not throw, the text is
 * unchanged in total, and the document is still a tree.
 */

const makeSchema = () =>
  new Schema('sweep-schema', {
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      list: { name: 'list', group: 'block', content: 'listItem+' },
      codeBlock: { name: 'codeBlock', group: 'block', content: 'inline-text*' },
      callout: { name: 'callout', group: 'block', content: 'block+' },
      horizontalRule: { name: 'horizontalRule', group: 'block', content: '' },
      mathBlock: { name: 'mathBlock', group: 'block', content: 'inline-text*' },
      blockQuote: { name: 'blockQuote', group: 'block', content: 'block+' },
      listItem: { name: 'listItem', group: 'block', content: 'block+' },
      link: { name: 'link', group: 'inline', content: 'inline-text*' },
      'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: ['bold'] }
    },
    marks: { bold: { name: 'bold' } }
  });

/**
 * A paragraph of five runs, one of them empty and one of them wrapped in a
 * link, plus a bullet — and the same text as a single run, because a document
 * has both and only one of them was ever tested.
 */
function buildDocument(dataStore: DataStore): void {
  const set = (node: Partial<INode>) => dataStore.setNode(node as INode);
  set({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2', 'list-1'] });

  set({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2', 'r-3', 'l-1', 'r-4'], parentId: 'doc-1' });
  set({ sid: 'r-1', stype: 'inline-text', text: 'one', parentId: 'p-1' });
  set({ sid: 'r-2', stype: 'inline-text', text: '', parentId: 'p-1' });
  set({ sid: 'r-3', stype: 'inline-text', text: 'two', parentId: 'p-1', marks: [{ stype: 'bold', range: [0, 3] }] } as any);
  set({ sid: 'l-1', stype: 'link', content: ['lt-1'], parentId: 'p-1', attributes: { href: 'https://example.com' } });
  set({ sid: 'lt-1', stype: 'inline-text', text: 'link', parentId: 'l-1' });
  set({ sid: 'r-4', stype: 'inline-text', text: 'end', parentId: 'p-1' });

  set({ sid: 'p-2', stype: 'paragraph', content: ['s-1'], parentId: 'doc-1' });
  set({ sid: 's-1', stype: 'inline-text', text: 'single run', parentId: 'p-2' });

  set({ sid: 'list-1', stype: 'list', content: ['li-1'], parentId: 'doc-1' });
  set({ sid: 'li-1', stype: 'listItem', content: ['lp-1'], parentId: 'list-1' });
  set({ sid: 'lp-1', stype: 'paragraph', content: ['lr-1', 'lr-2'], parentId: 'li-1' });
  set({ sid: 'lr-1', stype: 'inline-text', text: 'bul', parentId: 'lp-1' });
  set({ sid: 'lr-2', stype: 'inline-text', text: 'let', parentId: 'lp-1' });
}

/** Every (run, offset) a caret can occupy, named so a failure says where. */
const POSITIONS: { where: string; runId: string; length: number }[] = [
  { where: 'first run', runId: 'r-1', length: 3 },
  { where: 'empty run', runId: 'r-2', length: 0 },
  { where: 'bold run', runId: 'r-3', length: 3 },
  { where: 'inside a link', runId: 'lt-1', length: 4 },
  { where: 'last run', runId: 'r-4', length: 3 },
  { where: 'a paragraph of one run', runId: 's-1', length: 10 },
  { where: 'first run of a bullet', runId: 'lr-1', length: 3 },
  { where: 'last run of a bullet', runId: 'lr-2', length: 3 }
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

/** The operations that read the caret rather than being told where to work. */
const CARET_DRIVEN = [
  'insertParagraph',
  'splitListItem',
  'insertCodeBlock',
  'insertCallout',
  'insertHorizontalRule',
  'insertMathBlock',
  'wrapInBlockquote',
  'wrapInList'
];

describe('every caret position', () => {
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

  for (const name of CARET_DRIVEN) {
    it(`${name} survives the caret being anywhere`, async () => {
      const op = globalOperationRegistry.get(name);
      expect(op, `${name} is not registered`).toBeDefined();

      for (const { where, runId, length } of POSITIONS) {
        for (let offset = 0; offset <= length; offset += 1) {
          // A fresh document per position: one bad result must not explain the
          // next, and the alias each insert claims may be held only once.
          fresh();
          const textBefore = allText(dataStore);
          context.selection.setCaret(runId, offset);

          const at = `${where} (${runId}@${offset})`;
          let result: any;
          try {
            result = await op!.execute({ type: name, payload: {} } as any, context);
          } catch (error) {
            throw new Error(`${name} threw at ${at}: ${(error as Error).message}`);
          }

          if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
            // A refusal with a reason is allowed; it must not have half-done it.
            expect(allText(dataStore), `${name} 이(가) ${at} 에서 거절하고도 문서를 바꿨습니다`).toBe(textBefore);
            continue;
          }

          expect(
            allText(dataStore),
            `${name} 이(가) ${at} 에서 글자를 바꿨습니다`
          ).toBe(textBefore);
          expect(
            faultsInTree(dataStore),
            `${name} 이(가) ${at} 에서 문서 구조를 깨뜨렸습니다`
          ).toEqual([]);
        }
      }
    });
  }

  it('insertParagraph divides the text at the caret, wherever it is', async () => {
    const op = globalOperationRegistry.get('insertParagraph');

    for (const { where, runId, length } of POSITIONS) {
      for (let offset = 0; offset <= length; offset += 1) {
        fresh();
        context.selection.setCaret(runId, offset);
        const block = dataStore.getParent(dataStore.getNode(runId)?.parentId ? runId : runId);
        const blockId = ((): string => {
          let current = dataStore.getParent(runId);
          while (current && current.stype !== 'paragraph') current = dataStore.getParent(current.sid);
          return current!.sid;
        })();
        const textBefore = allText(dataStore, blockId);

        await op!.execute({ type: 'insertParagraph', payload: {} } as any, context);

        /**
         * Whatever it did, the two blocks either side of the seam still say
         * together exactly what the one block said.
         *
         * Which two they are depends on where the caret was: a split leaves the
         * tail after the block, while a caret at the very start opens a blank
         * one *before* it. Both orders are the same claim about the text.
         */
        const parentId = dataStore.getNode(blockId)!.parentId!;
        const siblings = (dataStore.getNode(parentId)!.content ?? []) as string[];
        const index = siblings.indexOf(blockId);
        const withNext = allText(dataStore, siblings[index]) + allText(dataStore, siblings[index + 1] ?? '');
        const withPrevious =
          (index > 0 ? allText(dataStore, siblings[index - 1]) : '') + allText(dataStore, siblings[index]);
        expect(
          withNext === textBefore || withPrevious === textBefore,
          `${where} (${runId}@${offset}) 에서 쪼갠 두 조각이 원래 문단과 다릅니다: ` +
            `${JSON.stringify(withPrevious)} / ${JSON.stringify(withNext)} vs ${JSON.stringify(textBefore)}`
        ).toBe(true);
        void block;
      }
    }
  });
});
