import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';


/**
 * deleteRange operation DSL
 *
 * 목적
 * - 지정한 범위(단일/복수 노드)의 텍스트를 삭제한다. DataStore.range.deleteText에 위임한다.
 *
 * 입력 형태(DSL)
 * - deleteRange(range) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset } }
 */
export const deleteRange = defineOperationDSL(
  (range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number }) => ({
    type: 'deleteRange',
    payload: { range }
  }),
  { atom: false, category: 'text' }
);

/**
 * deleteRange operation (runtime)
 *
 * 목적
 * - 지정한 범위(단일/복수 노드)의 텍스트를 삭제한다. DataStore.range.deleteText에 위임한다.
 *
 * 입력 형태(DSL)
 * - deleteRange(range) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset } }
 *
 * Selection 매핑
 * - 삭제 후 selection 정리는 TransactionManager/DataStore 전용 API에 위임한다.
 */
type DeleteRangePayload = {
  range: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
};

defineOperation('deleteRange', async (operation: any, context: TransactionContext) => {
  const payload = operation.payload as DeleteRangePayload;
  if (!payload?.range) {
    throw new Error('[deleteRange] payload.range is required');
  }

  const { startNodeId, startOffset, endNodeId, endOffset } = payload.range;
  const contentRange = {
    type: 'range' as const,
    startNodeId,
    startOffset,
    endNodeId,
    endOffset
  };

  if (!context.dataStore.range || typeof context.dataStore.range.deleteText !== 'function') {
    throw new Error('DataStore.range.deleteText is not available');
  }

  /**
   * The marks the run carried, before the deletion rewrites them.
   *
   * `deleteTextRange` learned this and this one, its sibling, did not: putting
   * the characters back does not put the marks back, because the store's rules
   * for an edit are right for a reader making one and are not reversible.
   * Deleting the first two letters of a bold word and undoing gave them back
   * plain.
   */
  const startNode = context.dataStore.getNode(startNodeId);
  const marksBefore =
    startNodeId === endNodeId && Array.isArray((startNode as any)?.marks)
      ? JSON.parse(JSON.stringify((startNode as any).marks))
      : undefined;

  /**
   * Every run this is about to rewrite, with the whole of what it holds — captured **before**.
   *
   * The two ends and everything between them, walked with the store's own range iterator rather than
   * a walk written here: `deleteText` uses that iterator to decide what to empty, so using it too is
   * what keeps the record and the deletion talking about the same set of nodes. A walk of its own
   * would be a second opinion, and the two would drift.
   */
  const runsBefore: { sid: string; text: string; marks?: unknown[] }[] = [];
  if (startNodeId !== endNodeId) {
    const held = (sid: string) => {
      const node = context.dataStore.getNode(sid) as { text?: string; marks?: unknown[] } | undefined;
      if (!node || typeof node.text !== 'string') return;
      runsBefore.push({ sid, text: node.text, marks: node.marks ? JSON.parse(JSON.stringify(node.marks)) : [] });
    };

    held(startNodeId);
    try {
      const between = context.dataStore.createRangeIterator(startNodeId, endNodeId, {
        includeStart: false,
        includeEnd: false
      });
      for (const one of between ?? []) {
        const sid = typeof one === 'string' ? one : (one as { sid?: string })?.sid;
        if (sid) held(sid);
      }
    } catch {
      // No iterator, or a range it cannot walk: the two ends are still worth keeping.
    }
    held(endNodeId);
  }

  const deletedText = context.dataStore.range.deleteText(contentRange);

  /**
   * Undo puts the text back; it does not delete it again.
   *
   * The inverse used to be this same operation with this same range, so undoing
   * a deletion deleted as much again from where the first one stopped:
   * "abcdefgh" minus [2,5) is "abfgh", and Ctrl+Z made it "ab". `transaction.ts`
   * collects these and that collection *is* undo, so this was a keystroke that
   * damaged the document — and nothing caught it, because this operation had no
   * tests at all.
   *
   * ## And for a range spanning several runs, there used to be **no inverse at all**
   *
   * The reason written here was: *"a deletion spanning several nodes removes
   * structure as well as characters, and re-inserting a string would not rebuild
   * it — so rather than offer an inverse that half-works, it offers none."*
   *
   * Careful reasoning from a wrong premise. `range.deleteText` **removes no
   * structure**: it truncates the run the range starts in, empties the runs
   * between, and trims the run it ends in. Nothing is added, nothing is taken
   * away, and every node involved is still there afterwards — so the deletion is
   * exactly reversible, and declining to try cost the worst thing in this
   * repository: **select across two paragraphs, press Backspace, press ⌘Z, and
   * the words are gone for good.** The everyday gesture, in all three products,
   * losing text in silence.
   *
   * Found by the extensions' conformance run the first time its probe was given
   * a range spanning two nodes. `restoreRuns` is the way back, and its argument
   * is `restoreTextNodes`': an operation that cannot be undone can usually be
   * **told** what it would need to know.
   */
  const withinOneNode = startNodeId === endNodeId;
  const inverse = withinOneNode
    ? deletedText
      ? {
          type: 'insertText',
          payload: {
            nodeId: startNodeId,
            pos: startOffset,
            text: deletedText,
            ...(marksBefore ? { marksAfter: marksBefore } : {})
          }
        }
      : undefined
    : runsBefore.length > 0
      ? { type: 'restoreRuns', payload: { runs: runsBefore } }
      : undefined;

  return {
    ok: true,
    data: deletedText,
    ...(inverse ? { inverse } : {})
  };
});
