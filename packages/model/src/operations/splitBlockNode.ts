import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';


type SplitBlockNodeOperation =
  | { type: 'splitBlockNode'; nodeId: string; splitPosition: number }
  | { type: 'splitBlockNode'; splitPosition: number };

export const splitBlockNode = defineOperationDSL(
  (...args: [number] | [string, number]) => {
    if (args.length === 1) {
      const [splitPosition] = args as [number];
      return { type: 'splitBlockNode', payload: { splitPosition } } as unknown as SplitBlockNodeOperation;
    }
    const [nodeId, splitPosition] = args as [string, number];
    return { type: 'splitBlockNode', payload: { nodeId, splitPosition } } as unknown as SplitBlockNodeOperation;
  },
  { atom: false, category: 'block' }
);

/**
 * splitBlockNode operation (runtime)
 *
 * 목적
 * - 블록 노드를 지정한 인덱스에서 두 블록으로 분리한다. DataStore.splitMerge.splitBlockNode 사용.
 *
 * 입력 형태(DSL)
 * - splitBlockNode(nodeId, splitPosition)
 * - control(nodeId, [ splitBlockNode(splitPosition) ]) → payload: { splitPosition }
 */

defineOperation('splitBlockNode', async (operation: any, context: TransactionContext) => {
  const { nodeId, splitPosition, newNodeAttributes, newNodeId: wantedId } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!Array.isArray(node.content)) throw new Error('Node has no content to split');
  /**
   * `wantedId` is how a merge asks for its own block back — see `splitTextNode`
   * for the same arrangement one level down.
   */
  const newNodeId = context.dataStore.splitMerge.splitBlockNode(nodeId, splitPosition, wantedId);

  /**
   * What the new block's own attributes were, when the caller knows.
   *
   * A split copies the attributes of the block it cut, which is right for a
   * reader dividing a paragraph — both halves keep its formatting. It is wrong
   * when this split is undoing a *merge*, because the block being restored had
   * attributes of its own before it was folded in, and a merge keeps the left
   * side's. Without this, undoing the join of a centred paragraph and a
   * left-aligned one left both aligned left.
   */
  if (newNodeAttributes && typeof newNodeAttributes === 'object') {
    // Replaced, not merged: the block being restored had exactly these
    // attributes, and `updateNode` merges — so a block that had none would keep
    // the ones the split copied onto it.
    const created = context.dataStore.getNode(newNodeId);
    if (created) {
      context.dataStore.setNode({ ...created, attributes: { ...newNodeAttributes } } as any, false);
    }
  }
  const newBlock = context.dataStore.getNode(newNodeId);
  const firstTextNodeId =
    newBlock && Array.isArray(newBlock.content) && newBlock.content[0]
      ? (newBlock.content[0] as string)
      : null;
  context.lastCreatedBlock = { blockId: newNodeId, firstTextNodeId };
  const selectionTargetNodeId = firstTextNodeId ?? newNodeId;
  return {
    ok: true,
    data: newNodeId,
    inverse: { type: 'mergeBlockNodes', payload: { leftNodeId: nodeId, rightNodeId: newNodeId } },
    selectionAfter: { nodeId: selectionTargetNodeId, offset: 0 }
  };
});



