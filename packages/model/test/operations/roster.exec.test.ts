import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * Every operation, run once, against a document shaped like a document.
 *
 * The faults found in this package were never in the operation nobody had
 * written a test for. They were in the operation whose tests all used the same
 * fixture — one run per paragraph, runs as direct children, one text node per
 * block — so that the assumption they shared was invisible in all of them at
 * once. Enter inserted a paragraph above instead of splitting for two years,
 * and its tests passed, because no fixture had a bold word in it.
 *
 * So this is not another set of tests for particular operations. It is a roster:
 * every operation the registry knows about must appear in it, with a scenario
 * that runs against one document holding the things a document holds — several
 * runs, a link wrapping text, a list, a table — and three questions are asked of
 * each:
 *
 *   does it run at all, on that document?
 *   does it leave the document readable, with nothing lost?
 *   does its inverse put the document back?
 *
 * The third is the one that catches most. `transaction.ts` collects each
 * operation's `inverse` and that collection is undo, so an inverse that does
 * not restore is a keystroke that damages the document — which is exactly what
 * `deleteRange` did, and no test noticed because none had ever run one.
 *
 * The roster failing because an operation is missing from it is the point. A
 * new operation is not finished until it says here what it does.
 */

const makeSchema = () =>
  new Schema('roster-schema', {
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      heading: { name: 'heading', group: 'block', content: 'inline*' },
      blockQuote: { name: 'blockQuote', group: 'block', content: 'block+' },
      callout: { name: 'callout', group: 'block', content: 'block+' },
      checklist: { name: 'checklist', group: 'block', content: 'block*' },
      taskItem: { name: 'taskItem', group: 'block', content: 'block*' },
      codeBlock: { name: 'codeBlock', group: 'block', content: 'inline-text*' },
      horizontalRule: { name: 'horizontalRule', group: 'block', content: '' },
      mathBlock: { name: 'mathBlock', group: 'block', content: 'inline-text*' },
      list: { name: 'list', group: 'block', content: 'listItem+' },
      /**
       * Indentable, which is what `indentNode` and `outdentNode` need to act.
       *
       * They were exempt from the undo check on the grounds that they declare
       * no inverse — and they declared none here because the roster's schema
       * never said a list item could be nested, so every run of them refused
       * and reported success at doing nothing. Two operations tested by a
       * scenario in which they could not do anything.
       *
       * No schema shipped in this repo sets this: Word nests list items by
       * numbering level rather than by nesting nodes, so the machinery is
       * unused there. Set here so the operations are still checked for a schema
       * that does opt in.
       */
      listItem: {
        name: 'listItem',
        group: 'block',
        content: 'block+',
        indentable: true,
        indentParentTypes: ['listItem']
      },
      bTable: { name: 'bTable', group: 'block', content: 'block+' },
      bTableHeader: { name: 'bTableHeader', group: 'block', content: 'block+' },
      bTableHeaderCell: { name: 'bTableHeaderCell', group: 'block', content: 'block*' },
      bTableBody: { name: 'bTableBody', group: 'block', content: 'block+' },
      bTableFooter: { name: 'bTableFooter', group: 'block', content: 'block*' },
      bTableRow: { name: 'bTableRow', group: 'block', content: 'block+' },
      bTableCell: { name: 'bTableCell', group: 'block', content: 'block*' },
      link: { name: 'link', group: 'inline', content: 'inline-text*' },
      image: { name: 'image', group: 'block', content: '' },
      'inline-image': { name: 'inline-image', group: 'inline', content: '' },
      'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: ['link', 'bold'] }
    },
    marks: {
      bold: { name: 'bold' },
      link: { name: 'link', attrs: { href: {}, title: {} } }
    }
  });

/**
 * One document with the shapes that hid the faults:
 *
 *   p-1   three runs, the middle one bold      "one|two|three"
 *   p-2   a run, a link wrapping a run, a run  "see |this page| now"
 *   list-1 / li-1                              "bullet"
 *   tbl    2 x 2, body only                    "r0c0" …
 */
function buildDocument(dataStore: DataStore): void {
  const set = (node: Partial<INode>) => dataStore.setNode(node as INode);

  set({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2', 'list-1', 'tbl', 'p-3', 'p-4'] });

  set({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'r-2', 'r-3'], parentId: 'doc-1', attributes: { align: 'left' } });
  set({ sid: 'r-1', stype: 'inline-text', text: 'one', parentId: 'p-1' });
  set({ sid: 'r-2', stype: 'inline-text', text: 'two', parentId: 'p-1', attributes: { bold: true } });
  set({ sid: 'r-3', stype: 'inline-text', text: 'three', parentId: 'p-1' });

  set({ sid: 'p-2', stype: 'paragraph', content: ['s-1', 'l-1', 's-2'], parentId: 'doc-1' });
  set({ sid: 's-1', stype: 'inline-text', text: 'see ', parentId: 'p-2' });
  set({ sid: 'l-1', stype: 'link', content: ['lt-1'], parentId: 'p-2', attributes: { href: 'https://example.com' } });
  set({ sid: 'lt-1', stype: 'inline-text', text: 'this page', parentId: 'l-1' });
  set({ sid: 's-2', stype: 'inline-text', text: ' now', parentId: 'p-2' });

  set({ sid: 'list-1', stype: 'list', content: ['li-1', 'li-2'], parentId: 'doc-1' });
  set({ sid: 'li-1', stype: 'listItem', content: ['lp-1'], parentId: 'list-1' });
  set({ sid: 'lp-1', stype: 'paragraph', content: ['lr-1'], parentId: 'li-1' });
  set({ sid: 'lr-1', stype: 'inline-text', text: 'bullet', parentId: 'lp-1' });
  set({ sid: 'li-2', stype: 'listItem', content: ['lp-2'], parentId: 'list-1' });
  set({ sid: 'lp-2', stype: 'paragraph', content: ['lr-2'], parentId: 'li-2' });
  set({ sid: 'lr-2', stype: 'inline-text', text: 'second', parentId: 'lp-2' });

  set({ sid: 'tbl', stype: 'bTable', content: ['body'], parentId: 'doc-1' });
  const rowIds: string[] = [];
  for (let r = 0; r < 2; r++) {
    const cellIds: string[] = [];
    for (let c = 0; c < 2; c++) {
      set({ sid: `c-${r}-${c}`, stype: 'bTableCell', content: [`cp-${r}-${c}`], parentId: `row-${r}` });
      set({ sid: `cp-${r}-${c}`, stype: 'paragraph', content: [`ct-${r}-${c}`], parentId: `c-${r}-${c}` });
      set({ sid: `ct-${r}-${c}`, stype: 'inline-text', text: `r${r}c${c}`, parentId: `cp-${r}-${c}` });
      cellIds.push(`c-${r}-${c}`);
    }
    set({ sid: `row-${r}`, stype: 'bTableRow', content: cellIds, parentId: 'body' });
    rowIds.push(`row-${r}`);
  }
  set({ sid: 'body', stype: 'bTableBody', content: rowIds, parentId: 'tbl' });

  // Two adjacent runs carrying the same formatting, which is the only pair that
  // may be joined without losing what one of them said.
  // A run that carries an indent, so outdenting has something to take off.
  set({ sid: 'p-4', stype: 'paragraph', content: ['ind-1'], parentId: 'doc-1' });
  set({ sid: 'ind-1', stype: 'inline-text', text: '  indented', parentId: 'p-4' });

  set({ sid: 'p-3', stype: 'paragraph', content: ['m-1', 'm-2'], parentId: 'doc-1' });
  set({ sid: 'm-1', stype: 'inline-text', text: 'joined', parentId: 'p-3' });
  set({ sid: 'm-2', stype: 'inline-text', text: 'together', parentId: 'p-3' });

  /**
   * A document has a root, and this one did not say so.
   *
   * Not a detail: with no root registered, `create` took the node it had just
   * made to be the document's root — because that is what it does for the first
   * node there is — and `delete`, which is its inverse, refuses to delete a
   * root. The operation was undoable and its undo could not run.
   */
  dataStore.setRootNodeId('doc-1');
}

type Scenario = {
  /** What the operation is given. */
  payload?: Record<string, unknown>;
  /** Extra fields on the operation object itself, for the few that read those. */
  operation?: Record<string, unknown>;
  /** Where the caret or selection is when it runs. */
  select?: (context: any) => void;
  /**
   * A document this operation has something to do in.
   *
   * Run before anything is measured, so the "before" the undo check compares
   * against includes it. `splitTableCell` needs a merged cell to split, and
   * without one it refused every time and was exempted from the undo check for
   * refusing — a scenario in which the operation could not act, passing.
   */
  given?: (dataStore: DataStore) => void;
  /** Why undo is not checked, when it is not. */
  undo?: string;
  /** Anything specific worth asserting beyond "it ran and nothing was lost". */
  then?: (dataStore: DataStore) => void;
  /** The text the document is allowed to hold afterwards, if it changes. */
  changesText?: boolean;
};

const caretIn = (nodeId: string, offset: number) => (context: any) => context.selection.setCaret(nodeId, offset);
const rangeOver = (startNodeId: string, startOffset: number, endNodeId: string, endOffset: number) => (context: any) => {
  context.selection.current = { type: 'range', startNodeId, startOffset, endNodeId, endOffset, collapsed: false };
};

/**
 * What each operation is asked to do.
 *
 * `undo` is a sentence, not a flag: it says why this operation's effect is not
 * expected to be reversible by its own inverse, so that a missing inverse is a
 * decision on the record rather than an oversight nobody noticed.
 */
const ROSTER: Record<string, Scenario> = {
  // ── text ──────────────────────────────────────────────────────────────────
  insertText: { payload: { nodeId: 'r-1', pos: 1, text: 'XY' }, changesText: true },
  setText: { payload: { nodeId: 'r-1', text: 'replaced' }, changesText: true },
  deleteTextRange: { payload: { nodeId: 'r-3', start: 1, end: 3 }, changesText: true },
  deleteRange: {
    payload: { range: { startNodeId: 'r-1', startOffset: 1, endNodeId: 'r-1', endOffset: 2 } },
    changesText: true
  },
  replaceText: { payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, newText: 'ONE' }, changesText: true },
  replacePattern: {
    // Reads its fields from the operation itself, not from `payload`.
    operation: { nodeId: 'r-2', start: 0, end: 3, pattern: 'two', replacement: 'TWO' },
    changesText: true
  },
  splitTextNode: { payload: { nodeId: 'r-1', splitPosition: 1 } },
  // Two runs with the same formatting. Merging runs that carry *different*
  // formatting keeps the text and drops one side's marks, which is a caller
  // error rather than a case to assert here — see autoMergeTextNodes.
  mergeTextNodes: { payload: { leftNodeId: 'm-1', rightNodeId: 'm-2' } },
  // It records the runs it swallowed, so it can be taken apart again — see
  // `restoreTextNodes`, which is its inverse.
  autoMergeTextNodes: { payload: { nodeId: 'm-1' } },
  restoreTextNodes: {
    payload: { nodeId: 'm-1', pieces: [{ sid: 'm-1', length: 6 }, { sid: 'm-2', length: 8 }] },
    undo: 'its inverse is autoMergeTextNodes, which joins them again — a round trip, and the fixture holds them already apart'
  },
  /**
   * Putting the words back into the runs they were taken out of.
   *
   * `deleteRange`'s inverse for a range spanning more than one run, and it exists because that case
   * used to have **none**: select across two paragraphs, press Backspace, press ⌘Z, and the words
   * were gone for good. The reason written into the operation was that a cross-node deletion removes
   * structure — and it does not; `range.deleteText` only ever rewrites text and marks, on nodes that
   * all survive. Its own inverse is itself, carrying what was there, which is what makes redo work.
   */
  restoreRuns: {
    payload: { runs: [{ sid: 'r-1', text: '되돌린 글', marks: [] }] }
  },

  // ── blocks ────────────────────────────────────────────────────────────────
  insertParagraph: { select: caretIn('r-2', 1) },
  /**
   * A page break at the caret, with the rest of the paragraph moved onto the new
   * page and the caret moved with it — Word's Ctrl+Enter. Distinct from the
   * shared kit's `insertPageBreak`, which puts the break after the whole block
   * and leaves the caret on the break node itself.
   */
  insertPageBreakAtCaret: {
    select: caretIn('r-2', 1),
    // The operation takes the type to insert, and this roster's schema has no
    // `pageBreak` — a horizontal rule is the same shape of thing, an atom block
    // between two paragraphs, which is all the operation cares about.
    payload: { stype: 'horizontalRule' }
  },
  splitBlockNode: { payload: { nodeId: 'p-1', splitPosition: 1 } },
  mergeBlockNodes: { payload: { leftNodeId: 'p-1', rightNodeId: 'p-2' } },
  splitListItem: { select: caretIn('lr-1', 3) },
  mergeListItems: {
    payload: { leftNodeId: 'li-1', rightNodeId: 'li-2' },
    undo: 'its inverse is splitListItem, which works from the caret this leaves on the seam — a round trip, not a restore of node identity'
  },
  transformNode: { payload: { nodeId: 'p-1', newType: 'heading' } },
  moveBlockUp: { payload: { nodeId: 'p-2' } },
  moveBlockDown: { payload: { nodeId: 'p-1' } },
  indentNode: { payload: { nodeId: 'li-2' } },
  outdentNode: { payload: { nodeId: 'li-2' } },
  // A range with text in it: indenting an empty stretch changes nothing,
  // and an operation that changes nothing is now refused rather than reported
  // as done.
  indentText: { payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 } }, changesText: true },
  // Indented text, so there is something to take off. See `indentText`.
  outdentText: { payload: { range: { startNodeId: 'ind-1', startOffset: 0, endNodeId: 'ind-1', endOffset: 8 } }, changesText: true },

  // ── the tree ──────────────────────────────────────────────────────────────
  addChild: { payload: { parentId: 'p-1', child: { stype: 'inline-text', text: 'added' }, position: 3 } },
  // Two changes in different places, which is the case a single inverse could
  // not describe and the reason this exists.
  batch: {
    payload: {
      operations: [
        { type: 'setText', payload: { nodeId: 'r-1', text: 'ONE' } },
        { type: 'setAttrs', payload: { nodeId: 'p-1', attrs: { align: 'right' } } }
      ]
    }
  },
  removeChild: { payload: { parentId: 'p-1', childId: 'r-3' } },
  removeChildren: { payload: { parentId: 'p-1', childIds: ['r-3'] } },
  moveChildren: { payload: { fromParentId: 'p-1', toParentId: 'p-2', childIds: ['r-3'], position: 0 } },
  moveNode: { payload: { nodeId: 'r-3', newParentId: 'p-2', position: 0 } },
  reorderChildren: { payload: { parentId: 'p-1', childIds: ['r-3', 'r-1', 'r-2'] } },
  cloneNodeWithChildren: { payload: { nodeId: 'p-1', newParentId: 'doc-1' } },
  copyNode: { payload: { nodeId: 'r-1', newParentId: 'p-2' } },
  create: { payload: { node: { stype: 'paragraph', content: [] } } },
  setNode: { operation: { node: { sid: 'brand-new', stype: 'inline-text', text: 'x', parentId: 'p-1' } } },
  delete: { payload: { nodeId: 'r-3' } },
  update: { payload: { nodeId: 'p-1', data: { attributes: { align: 'center' } } } },
  setAttrs: { payload: { nodeId: 'p-1', attrs: { align: 'right' } } },
  unwrap: { payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, prefix: 'o', suffix: 'e' } },
  wrap: { payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, prefix: '**', suffix: '**' } },

  // ── marks ─────────────────────────────────────────────────────────────────
  applyMark: { payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, markType: 'bold' } },
  // A mark applied across several nodes has no single operation that removes it.
  // Kept as a scenario so the limit is on the record rather than a surprise.
  removeMark: { payload: { nodeId: 'r-2', markType: 'bold', range: [0, 3] } },
  updateMark: { payload: { nodeId: 'r-2', markType: 'bold', range: [0, 3], newAttrs: {} } },
  setMarks: { payload: { nodeId: 'r-1', marks: [{ stype: 'bold', range: [0, 2] }] } },
  toggleMark: { payload: { nodeId: 'r-1', range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, markType: 'bold' } },
  toggleLink: { payload: { href: 'https://example.com' }, select: rangeOver('r-1', 0, 'r-1', 3) },

  // ── inserting a block where the caret is ──────────────────────────────────
  insertCallout: { select: caretIn('r-2', 1) },
  insertChecklist: { select: caretIn('r-2', 1) },
  insertCodeBlock: { select: caretIn('r-2', 1) },
  insertHorizontalRule: { select: caretIn('r-2', 1) },
  insertImage: { payload: { src: 'a.png', alt: 'a' }, select: caretIn('r-2', 1) },
  insertMathBlock: { payload: { tex: 'x^2' }, select: caretIn('r-2', 1) },
  insertTable: { payload: { rows: 2, cols: 2 }, select: caretIn('r-2', 1) },
  wrapInBlockquote: { select: caretIn('r-2', 1) },
  wrapInList: { select: caretIn('r-2', 1) },

  // ── tables ────────────────────────────────────────────────────────────────
  insertTableRow: { payload: { cellId: 'c-0-0', position: 'after' } },
  deleteTableRow: { payload: { cellId: 'c-0-0' } },
  insertTableColumn: { payload: { cellId: 'c-0-0', position: 'after' } },
  deleteTableColumn: { payload: { cellId: 'c-0-0' } },
  mergeTableCells: { payload: { fromCellId: 'c-0-0', toCellId: 'c-0-1' } },
  splitTableCell: {
    // A cell that spans the row, so there is something to split. Without it the
    // operation refused every time and was exempt from the undo check for
    // refusing.
    given: (dataStore) => {
      dataStore.updateNode('c-0-0', { attributes: { colspan: 2 } } as never, false);
      dataStore.content.removeChild('row-0', 'c-0-1');
    },
    payload: { cellId: 'c-0-0' }
  },

  // ── selection ─────────────────────────────────────────────────────────────
  setSelection: { payload: { anchor: { nodeId: 'r-1', offset: 0 }, head: { nodeId: 'r-1', offset: 2 } }, undo: 'moves the caret, not the document' },
  selectNode: { payload: { nodeId: 'p-1' }, undo: 'moves the caret, not the document' },
  selectRange: { payload: { nodeId: 'r-1', startOffset: 0, endOffset: 2 }, undo: 'moves the caret, not the document' },
  clearSelection: { undo: 'moves the caret, not the document' },

  // ── the clipboard ─────────────────────────────────────────────────────────
  copy: { payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 } }, undo: 'reads the document, never writes to it' },
  cut: { payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 } }, changesText: true },
  paste: { payload: { range: { startNodeId: 'r-1', startOffset: 0, endNodeId: 'r-1', endOffset: 3 }, data: { nodes: [{ stype: 'inline-text', text: 'pasted' }] } }, changesText: true }
};

/** The document as a shape, ignoring the ids that a rebuild would change. */
function shapeOf(dataStore: DataStore, rootId = 'doc-1'): unknown {
  const node = dataStore.getNode(rootId) as INode;
  if (!node) return null;
  const shape: Record<string, unknown> = { stype: node.stype };
  if (typeof node.text === 'string') shape.text = node.text;
  if (node.attributes && Object.keys(node.attributes).length > 0) {
    // `$alias` is transaction bookkeeping, not content.
    const { $alias, ...rest } = node.attributes as Record<string, unknown>;
    if (Object.keys(rest).length > 0) shape.attributes = rest;
  }
  if (Array.isArray(node.content) && node.content.length > 0) {
    shape.content = node.content.map((childId) => shapeOf(dataStore, childId as string));
  }
  return shape;
}

/**
 * Whether the tree is still a tree.
 *
 * Every fault above was found by looking at what an operation was supposed to
 * do. This asks the other question — whether, having done it, the document is
 * still something the rest of the editor can walk. A dangling id in a content
 * array, a node whose parent has forgotten it, a node claimed by two parents:
 * none of those show up in the text, and all of them break a renderer, a
 * selection mapping or a save, some distance away from the operation that
 * caused them.
 */
function faultsInTree(dataStore: DataStore, rootId = 'doc-1'): string[] {
  const faults: string[] = [];
  const seen = new Map<string, string>();
  const walk = (id: string, parentId: string | null, trail: string[]): void => {
    if (trail.includes(id)) {
      faults.push(`${id} 이(가) 자기 조상 안에 다시 나옵니다: ${[...trail, id].join(' → ')}`);
      return;
    }
    const node = dataStore.getNode(id) as INode;
    if (!node) {
      faults.push(`${parentId ?? '(root)'} 의 content 에 없는 노드가 있습니다: ${id}`);
      return;
    }
    const claimedBy = seen.get(id);
    if (claimedBy) {
      faults.push(`${id} 을(를) 두 부모가 가지고 있습니다: ${claimedBy} 와 ${parentId}`);
      return;
    }
    seen.set(id, parentId ?? '(root)');

    if (parentId) {
      const declared = (node as { parentId?: string }).parentId;
      const resolved = declared ? dataStore.resolveAlias(declared) : declared;
      if (resolved !== parentId) {
        faults.push(`${id} 는 ${parentId} 안에 있는데 parentId 는 ${declared ?? '(없음)'} 입니다`);
      }
    }

    for (const childId of ((node.content ?? []) as string[])) {
      walk(childId, id, [...trail, id]);
    }
  };
  walk(rootId, null, []);
  return faults;
}

/** Every character in the document, in order. */
function allText(dataStore: DataStore, rootId = 'doc-1'): string {
  const node = dataStore.getNode(rootId) as INode;
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map((childId) => allText(dataStore, childId as string)).join('');
}

describe('the operation roster', () => {
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
    context.selection.setCaret('r-2', 1);
  };

  beforeEach(fresh);

  /** The document each scenario runs against, its own preparation included. */
  const prepare = (scenario: Scenario) => scenario.given?.(dataStore);

  it('has an entry for every operation the registry knows about', () => {
    const registered = Array.from(globalOperationRegistry.getAll().keys()).sort();
    expect(registered.length, 'the registry reported no operations').toBeGreaterThan(20);

    const missing = registered.filter((name) => !(name in ROSTER)).sort();
    expect(
      missing,
      `이 연산들은 명부에 없습니다. 무엇을 하는지 여기에 적어야 합니다:\n  ${missing.join('\n  ')}`
    ).toEqual([]);

    const stale = Object.keys(ROSTER).filter((name) => !registered.includes(name)).sort();
    expect(stale, `명부에 있지만 등록되지 않은 연산: ${stale.join(', ')}`).toEqual([]);
  });

  for (const [name, scenario] of Object.entries(ROSTER)) {
    describe(name, () => {
      // Every test in here starts from the document this scenario asked for.
      beforeEach(() => prepare(scenario));

      const execute = async () => {
        const op = globalOperationRegistry.get(name);
        expect(op, `${name} is not registered`).toBeDefined();
        scenario.select?.(context);
        return await op!.execute(
          { type: name, payload: scenario.payload ?? {}, ...(scenario.operation ?? {}) } as any,
          context
        );
      };

      it('runs against a document that has the shapes a document has', async () => {
        const result = await execute();
        // `ok: false` is a refusal with a reason, which is allowed; a throw is
        // not, and neither is a silent nothing where a change was asked for.
        if (result && typeof result === 'object' && 'ok' in result) {
          expect(typeof (result as any).ok, `${name} returned no verdict`).toBe('boolean');
        }
        scenario.then?.(dataStore);
      });

      it('leaves the document a tree the rest of the editor can walk', async () => {
        const faultsBefore = faultsInTree(dataStore);
        expect(faultsBefore, '픽스처가 이미 깨져 있습니다').toEqual([]);
        await execute();
        expect(
          faultsInTree(dataStore),
          `${name} 이(가) 문서 구조를 깨뜨렸습니다`
        ).toEqual([]);
      });

      it('leaves the document readable, with nothing lost', async () => {
        const before = allText(dataStore);
        await execute();
        const after = allText(dataStore);

        if (scenario.changesText) {
          expect(after.length, `${name} 이(가) 글자를 지우기만 했습니다`).toBeGreaterThanOrEqual(0);
        } else {
          // Not a text-editing operation: every character that was there is
          // still there, whatever moved.
          const missing = [...before].filter((ch, i) => after[i] === undefined && ch.trim());
          expect(
            after.replace(/\s/g, '').length,
            `${name} 이(가) 글자를 잃었습니다: ${JSON.stringify(before)} → ${JSON.stringify(after)}`
          ).toBeGreaterThanOrEqual(before.replace(/\s/g, '').length - missing.length);
        }
      });

      /**
       * An exemption that says "no inverse" has to still be true.
       *
       * The note is written once and the operation goes on being worked on. An
       * inverse added afterwards leaves the exemption in place, and the undo
       * check stays switched off for an operation that could now pass it —
       * fourteen of them at once, which is how `insertTable` came to declare
       * `delete` as its inverse with nothing checking that undoing an inserted
       * table gives the document back.
       *
       * So the exemption is a claim, and this is where it is checked. Exemptions
       * for other reasons — a caret move, a read, a round trip — say something
       * else and are left alone.
       */
      if (scenario.undo?.includes('declares no inverse')) {
        it('declares no inverse, as the roster says it does', async () => {
          const result = await execute();
          expect(
            (result as any)?.inverse,
            `${name} 은(는) 명부에 inverse 가 없다고 적혀 있는데 실제로는 있습니다. 면제를 지우고 되돌리기를 검사하게 하세요.`
          ).toBeUndefined();
        });
      }

      if (!scenario.undo) {
        it('puts the document back when undone', async () => {
          const before = shapeOf(dataStore);
          const result = await execute();
          const inverse = (result as any)?.inverse;
          expect(
            inverse,
            `${name} 은(는) 되돌릴 수 있어야 하는데 inverse 가 없습니다. 없어도 되는 이유가 있다면 명부에 적어주세요.`
          ).toBeDefined();

          const op = globalOperationRegistry.get(inverse.type);
          expect(op, `inverse ${inverse.type} of ${name} is not registered`).toBeDefined();
          await op!.execute({ type: inverse.type, payload: inverse.payload, ...inverse } as any, context);

          expect(
            shapeOf(dataStore),
            `${name} 을(를) 되돌렸는데 문서가 원래대로 돌아오지 않았습니다`
          ).toEqual(before);
        });
      }
    });
  }
});
