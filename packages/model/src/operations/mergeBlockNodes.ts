import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { lastTextNodeIn } from './split-at-caret';

/**
 * mergeBlockNodes operation (runtime)
 *
 * 목적
 * - 동일 타입의 인접 블록 노드 두 개를 병합한다. DataStore.splitMerge.mergeBlockNodes 사용.
 *
 * 입력 형태(DSL)
 * - mergeBlockNodes(leftNodeId, rightNodeId)
 * - control(leftNodeId, [ mergeBlockNodes(rightNodeId) ]) → payload: { rightNodeId } (left는 control이 주입)
 */

defineOperation('mergeBlockNodes', async (operation: any, context: TransactionContext) => {
  const { leftNodeId, rightNodeId } = operation.payload;

  const left = context.dataStore.getNode(leftNodeId);
  const right = context.dataStore.getNode(rightNodeId);
  if (!left) throw new Error(`Node not found: ${leftNodeId}`);
  if (!right) throw new Error(`Node not found: ${rightNodeId}`);
  if (left.stype !== right.stype) throw new Error(`Cannot merge different node types: ${left.stype} and ${right.stype}`);

  const leftChildrenCount = Array.isArray((left as any).content) ? (left as any).content.length : 0;
  /**
   * The seam, captured before the merge: afterwards the two blocks are one and
   * the boundary between them is no longer visible in the model.
   *
   * The *last text* under the left block, not its last child. A block can end
   * in something a caret cannot sit in — a link wrapping its text, a picture —
   * and taking the last child then found a node with no text, set no caret at
   * all, and left the reader with none. Measured: joining onto a paragraph
   * ending in a hyperlink merged the text correctly and lost the caret.
   */
  const seam = lastTextNodeIn(context.dataStore, leftNodeId);

  const mergedNodeId = context.dataStore.splitMerge.mergeBlockNodes(leftNodeId, rightNodeId);

  // Where the caret goes: the end of the text the left block already had, which
  // is where the right block's content now starts.
  //
  // The caret does not dangle without this — the text node it was in survives,
  // it just moves — which is why the symptom was so confusing. It stays at
  // offset 0 of the moved content, so the next Backspace is again "at the start
  // of a node", tries the same boundary case, and finds nothing left to merge.
  // Holding the key deleted one block and then appeared to stop.
  if (seam) {
    context.selection.setCaret(seam.sid, seam.text.length);
  }

  return {
    ok: true,
    data: mergedNodeId,
    inverse: { type: 'splitBlockNode', payload: { nodeId: mergedNodeId, splitPosition: leftChildrenCount } }
  };
});



