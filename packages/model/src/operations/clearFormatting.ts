import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

/**
 * clearFormatting — take every mark off the selected text, in one gesture.
 *
 * ## Why this exists as its own operation
 *
 * `removeMark` takes off **one type, on one node**, and the eleven `remove…` commands above it each
 * take off one. A reader who has bolded, coloured and raised a word wants it plain in one press, and
 * composing eleven operations to say that is both wrong and incomplete: it names the marks the author
 * of the list happened to think of, so a mark added to the schema afterwards survives the clear.
 *
 * The walk itself was already written — `DataStore.range.clearFormatting` has existed as long as the
 * range API — and nothing above it could reach it. No operation, no command, and in Word a ⌘Space
 * binding that named a command nobody registers. Found by asking whether every chord a product prints
 * names a command it has.
 *
 * ## Selection
 *
 * Preserved. Clearing formatting does not move the caret, and a reader usually clears and then types.
 */
interface ClearFormattingOperation {
  type: 'clearFormatting';
  range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
}

export const clearFormatting = defineOperationDSL(
  (...args: [ClearFormattingOperation['range']] | [string, number, string, number]) => {
    if (args.length === 1) {
      return { type: 'clearFormatting', payload: { range: args[0] } } as unknown as ClearFormattingOperation;
    }
    const [startNodeId, startOffset, endNodeId, endOffset] = args;
    return {
      type: 'clearFormatting',
      payload: { range: { startNodeId, startOffset, endNodeId, endOffset } }
    } as unknown as ClearFormattingOperation;
  },
  { atom: false, category: 'marks' }
);

defineOperation('clearFormatting', async (operation: any, context: TransactionContext) => {
  const range = operation.payload?.range;
  if (!range?.startNodeId || !range?.endNodeId) throw new Error('clearFormatting needs a range');

  const store: any = context.dataStore;
  if (typeof store?.range?.clearFormatting !== 'function') {
    throw new Error('DataStore.range.clearFormatting is not available');
  }

  /**
   * Exactly what every run in the range carried, so undo puts back what was there.
   *
   * The whole list per node rather than "apply these again": a mark may have reached past the
   * selection, or carried attributes, or there may have been several of one type. That is the shape
   * `removeMark`, `applyMark` and `toggleMark` each arrived at, one at a time, and for the same
   * reason — an inverse written as the mirror gesture undoes more or less than the thing it reverses.
   */
  const touched: Array<{ nodeId: string; marks: unknown[] }> = [];
  for (const nodeId of store.createRangeIterator(range.startNodeId, range.endNodeId, {
    includeStart: true,
    includeEnd: true
  })) {
    const node = store.getNode(nodeId);
    if (!node || typeof node.text !== 'string' || !Array.isArray(node.marks)) continue;
    touched.push({ nodeId, marks: JSON.parse(JSON.stringify(node.marks)) });
  }

  const cleared = store.range.clearFormatting({ type: 'range', ...range });

  const undo = touched.map((was) => ({ type: 'setMarks', payload: { nodeId: was.nodeId, marks: was.marks } }));
  return {
    ok: true,
    data: { cleared },
    inverse: undo.length === 1 ? undo[0] : { type: 'batch', payload: { operations: undo } }
  };
});
