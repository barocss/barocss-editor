import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * outdentNode operation (structural outdent)
 *
 * Purpose
 * - Outdents the specified node one level according to schema-based rules.
 * - Internally calls DataStore.outdentNode(nodeId).
 *
 * Input format (DSL)
 * - control(nodeId, [ outdentNode() ]) → payload: {}
 * - outdentNode(nodeId) → payload: { nodeId }
 */

export interface OutdentNodeOperation {
  type: 'outdentNode';
  nodeId: string;
}

defineOperation('outdentNode', async (operation: any, context: TransactionContext) => {
  const nodeId: string | undefined = operation.payload.nodeId;
  if (!nodeId) {
    throw new Error('[outdentNode] nodeId is required in payload');
  }

  const node = context.dataStore.getNode(nodeId);
  if (!node) {
    throw new Error(`[outdentNode] Node not found: ${nodeId}`);
  }

  // Where it was, read before it moves: see `indentNode` for why the opposite
  // operation is not a faithful inverse of this one.
  const wasIn = node.parentId ? context.dataStore.resolveAlias(node.parentId) : null;
  const parentBefore = wasIn ? context.dataStore.getNode(wasIn) : null;
  const wasAt = Array.isArray(parentBefore?.content)
    ? (parentBefore!.content as string[]).indexOf(nodeId)
    : -1;

  const ok = context.dataStore.outdentNode(nodeId);

  /**
   * Already at the top level is a refusal, not a success.
   *
   * See `indentNode` for what reporting success at nothing costs: the roster
   * reads "no inverse" as a property of the operation and stops checking undo
   * for the case where there is one.
   */
  if (!ok) {
    return { ok: false, error: `outdentNode: ${nodeId} is already at the top level` };
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    ...(wasIn && wasAt >= 0
      ? { inverse: { type: 'moveNode', payload: { nodeId, newParentId: wasIn, position: wasAt } } }
      : {})
  };
});


