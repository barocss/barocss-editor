import { describe, it, expect } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

// Re-use the fuzz's world by importing nothing: copy the minimum needed.
const makeSchema = () =>
  new Schema('fuzz-schema', {
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
  const set = (n: Partial<INode>) => dataStore.setNode(n as INode);
  set({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2', 'list-1'] });
  set({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2', 'l-1'], parentId: 'doc-1', attributes: { align: 'left' } });
  set({ sid: 'r-1', stype: 'inline-text', text: 'alpha', parentId: 'p-1' });
  set({ sid: 'r-2', stype: 'inline-text', text: 'beta', parentId: 'p-1', marks: [{ stype: 'bold', range: [0, 4] }] } as any);
  set({ sid: 'l-1', stype: 'link', content: ['lt-1'], parentId: 'p-1', attributes: { href: 'https://example.com' } });
  set({ sid: 'lt-1', stype: 'inline-text', text: 'gamma', parentId: 'l-1' });
  set({ sid: 'p-2', stype: 'paragraph', content: ['s-1'], parentId: 'doc-1', attributes: { align: 'center' } });
  set({ sid: 's-1', stype: 'inline-text', text: 'delta', parentId: 'p-2' });
  set({ sid: 'list-1', stype: 'list', content: ['li-1'], parentId: 'doc-1' });
  set({ sid: 'li-1', stype: 'listItem', content: ['lp-1'], parentId: 'list-1' });
  set({ sid: 'lp-1', stype: 'paragraph', content: ['lr-1'], parentId: 'li-1' });
  set({ sid: 'lr-1', stype: 'inline-text', text: 'bullet', parentId: 'lp-1' });
}

const shapeOf = (ds: DataStore, id = 'doc-1'): any => {
  const n = ds.getNode(id) as INode;
  if (!n) return null;
  const o: any = { stype: n.stype };
  if (typeof n.text === 'string') o.text = n.text;
  if (n.marks?.length) o.marks = n.marks;
  if (n.attributes && Object.keys(n.attributes).length) {
    const { $alias, ...rest } = n.attributes as any;
    if (Object.keys(rest).length) o.attributes = rest;
  }
  if (Array.isArray(n.content) && n.content.length) o.content = n.content.map((c) => shapeOf(ds, c as string));
  return o;
};

type Step = { type: string; payload: any; operationFields?: any; caret?: [string, number] };

/** Run a fixed list of steps, then undo, and say whether the document came back. */
async function replay(steps: Step[]): Promise<boolean> {
  const schema = makeSchema();
  const dataStore = new DataStore(undefined, schema);
  const context = createTransactionContext(dataStore, new SelectionManager({ dataStore }), schema);
  buildDocument(dataStore);
  const before = JSON.stringify(shapeOf(dataStore));
  const inverses: any[] = [];
  for (const step of steps) {
    if (step.caret) context.selection.setCaret(step.caret[0], step.caret[1]);
    const op = globalOperationRegistry.get(step.type);
    if (!op) continue;
    try {
      const r: any = await op.execute({ type: step.type, payload: step.payload, ...(step.operationFields ?? {}) } as any, context);
      if (r?.inverse) inverses.unshift(r.inverse);
    } catch { /* refusal */ }
  }
  try {
    for (const inv of inverses) {
      const op = globalOperationRegistry.get(inv.type);
      if (op) await op.execute({ type: inv.type, payload: inv.payload, ...inv } as any, context);
    }
  } catch { return false; }
  return JSON.stringify(shapeOf(dataStore)) === before;
}

/** Every operation with a payload the fixture supports, as one step each. */
const MOVES: Step[] = [
  { type: 'insertText', payload: { nodeId: 'r-1', pos: 2, text: 'zz' } },
  { type: 'deleteTextRange', payload: { nodeId: 'r-2', start: 1, end: 3 } },
  { type: 'insertParagraph', payload: {}, caret: ['r-1', 2] },
  { type: 'splitListItem', payload: {}, caret: ['lr-1', 3] },
  { type: 'splitTextNode', payload: { nodeId: 'r-1', splitPosition: 2 } },
  { type: 'setAttrs', payload: { nodeId: 'p-1', attrs: { align: 'right' } } },
  { type: 'applyMark', payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, markType: 'bold' } },
  { type: 'transformNode', payload: { nodeId: 'p-1', newType: 'heading' } },
  { type: 'setText', payload: { nodeId: 'r-1', text: 'ALPHA' } },
  { type: 'setMarks', payload: { nodeId: 'r-1', marks: [{ stype: 'bold', range: [0, 2] }] } },
  { type: 'removeMark', payload: { nodeId: 'r-2', markType: 'bold', range: [0, 4] } },
  { type: 'update', payload: { nodeId: 'p-1', data: { attributes: { align: 'right' } } } },
  { type: 'delete', payload: { nodeId: 'r-2' } },
  { type: 'addChild', payload: { parentId: 'p-1', child: { stype: 'inline-text', text: 'added' }, position: 0 } },
  { type: 'removeChild', payload: { parentId: 'p-1', childId: 'r-2' } },
  { type: 'removeChildren', payload: { parentId: 'p-1', childIds: ['r-2'] } },
  { type: 'reorderChildren', payload: { parentId: 'p-1', childIds: ['l-1', 'r-2', 'r-1'] } },
  { type: 'moveNode', payload: { nodeId: 'r-2', newParentId: 'p-2', position: 0 } },
  { type: 'moveChildren', payload: { fromParentId: 'p-1', toParentId: 'p-2', childIds: ['r-2'], position: 0 } },
  { type: 'moveBlockUp', payload: { nodeId: 'p-2' } },
  { type: 'moveBlockDown', payload: { nodeId: 'p-1' } },
  { type: 'copyNode', payload: { nodeId: 'r-1', newParentId: 'p-2' } },
  { type: 'cloneNodeWithChildren', payload: { nodeId: 'l-1', newParentId: 'p-2' } },
  { type: 'splitBlockNode', payload: { nodeId: 'p-1', splitPosition: 1 } },
  { type: 'mergeBlockNodes', payload: { leftNodeId: 'p-1', rightNodeId: 'p-2' } },
  { type: 'mergeTextNodes', payload: { leftNodeId: 'r-1', rightNodeId: 'r-2' } },
  { type: 'autoMergeTextNodes', payload: { nodeId: 'r-1' } },
  { type: 'deleteRange', payload: { range: { startNodeId: 'r-1', startOffset: 1, endNodeId: 'r-1', endOffset: 3 } } },
  { type: 'replaceText', payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, newText: 'X' } },
  { type: 'replacePattern', payload: {}, operationFields: { nodeId: 'r-1', start: 0, end: 5, pattern: 'a', replacement: 'Q' } },
  { type: 'toggleMark', payload: { nodeId: 'r-1', range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, markType: 'bold' } },
  { type: 'indentText', payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 1 } } },
  { type: 'outdentText', payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 1 } } },
  { type: 'wrap', payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, prefix: '*', suffix: '*' } },
  { type: 'unwrap', payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 5 }, prefix: 'a', suffix: 'a' } }
];

/**
 * The same question the random runs ask, asked one step at a time.
 *
 * A run of eight operations that does not undo says only that the eight of them
 * together do not. This asks it of one operation, and then of every ordered
 * pair — which turns "41 of 60 runs fail" into a list of exactly which
 * operations, and which of them only fail in company. That list is the worklist;
 * every fault fixed here so far was found by narrowing one down to it.
 *
 * Both counts are ratchets. They may go down and not up, and the lists are
 * printed so the next one to look at is in front of whoever runs the suite.
 */
describe('narrowing', () => {
  /** Operations whose own inverse does not put the document back. Lower this. */
  const ALONE = 4;
  /** Ordered pairs that do not, where each alone does. Lower this. */
  const PAIRS = 14;

  it(`${ALONE} operations do not undo themselves, and no more`, async () => {
    const bad: string[] = [];
    for (const move of MOVES) if (!(await replay([move]))) bad.push(move.type);
    // eslint-disable-next-line no-console
    console.log(`  alone: ${bad.length ? bad.join(', ') : '(none)'}`);
    expect(bad.length, `혼자서 되돌아오지 않는 연산: ${bad.join(', ')}`).toBeLessThanOrEqual(ALONE);
  });

  it(`${PAIRS} pairs do not undo, and no more`, async () => {
    const alone = new Set<string>();
    for (const move of MOVES) if (!(await replay([move]))) alone.add(move.type);

    const bad: string[] = [];
    for (const first of MOVES) {
      if (alone.has(first.type)) continue;
      for (const second of MOVES) {
        if (alone.has(second.type)) continue;
        if (!(await replay([first, second]))) bad.push(`${first.type} → ${second.type}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`  pairs (${bad.length}):\n    ${bad.join('\n    ')}`);
    expect(bad.length, `되돌아오지 않는 짝:\n  ${bad.join('\n  ')}`).toBeLessThanOrEqual(PAIRS);
  });
});
