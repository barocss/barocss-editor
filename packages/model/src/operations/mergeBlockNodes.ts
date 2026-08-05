import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

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
  // Captured before the merge: afterwards the two blocks are one and the
  // boundary between them is no longer visible in the model.
  const lastLeftChildId =
    leftChildrenCount > 0 ? ((left as any).content[leftChildrenCount - 1] as string) : null;
  const lastLeftChild = lastLeftChildId ? context.dataStore.getNode(lastLeftChildId) : null;

  const mergedNodeId = context.dataStore.splitMerge.mergeBlockNodes(leftNodeId, rightNodeId);

  // Where the caret goes: the end of the text the left block already had, which
  // is where the right block's content now starts.
  //
  // The caret does not dangle without this — the text node it was in survives,
  // it just moves — which is why the symptom was so confusing. It stays at
  // offset 0 of the moved content, so the next Backspace is again "at the start
  // of a node", tries the same boundary case, and finds nothing left to merge.
  // Holding the key deleted one block and then appeared to stop.
  if (lastLeftChildId && typeof (lastLeftChild as any)?.text === 'string') {
    context.selection.setCaret(lastLeftChildId, ((lastLeftChild as any).text as string).length);
  }

  return {
    ok: true,
    data: mergedNodeId,
    inverse: { type: 'splitBlockNode', payload: { nodeId: mergedNodeId, splitPosition: leftChildrenCount } }
  };
});



