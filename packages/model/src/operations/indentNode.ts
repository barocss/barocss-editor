import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * indentNode operation (structural indent)
 *
 * Purpose
 * - Indents the specified node one level according to schema-based rules.
 * - Internally calls DataStore.indentNode(nodeId).
 *
 * Input format (DSL)
 * - control(nodeId, [ indentNode() ]) → payload: {}
 * - indentNode(nodeId) → payload: { nodeId }
 */

export interface IndentNodeOperation {
  type: 'indentNode';
  nodeId: string;
}

defineOperation('indentNode', async (operation: any, context: TransactionContext) => {
  const nodeId: string | undefined = operation.payload.nodeId;
  if (!nodeId) {
    throw new Error('[indentNode] nodeId is required in payload');
  }

  const node = context.dataStore.getNode(nodeId);
  if (!node) {
    throw new Error(`[indentNode] Node not found: ${nodeId}`);
  }

  /**
   * Where it was, read before it moves.
   *
   * The inverse used to be `outdentNode`, on the reasoning that indent and
   * outdent are opposites. They are not, quite: indenting puts a node at the
   * *end* of its previous sibling, and outdenting puts it after its parent —
   * so the pair is a round trip only when the node started last in its parent.
   * Where it was is exact, and says the same thing in every case.
   */
  const wasIn = node.parentId ? context.dataStore.resolveAlias(node.parentId) : null;
  const parentBefore = wasIn ? context.dataStore.getNode(wasIn) : null;
  const wasAt = Array.isArray(parentBefore?.content)
    ? (parentBefore!.content as string[]).indexOf(nodeId)
    : -1;

  const ok = context.dataStore.indentNode(nodeId);

  /**
   * Nothing to indent is a refusal, not a success.
   *
   * It used to report `ok: true` with no inverse, which reads as "done, and
   * nothing to undo" — the same sentence a successful indent would say if its
   * inverse went missing. The roster then exempted this operation from the undo
   * check on the grounds that it declared no inverse, and the check stayed off
   * for the case where it does. Saying no here is what turns it back on.
   */
  if (!ok) {
    return { ok: false, error: `indentNode: ${nodeId} cannot be indented any further` };
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    ...(wasIn && wasAt >= 0
      ? { inverse: { type: 'moveNode', payload: { nodeId, newParentId: wasIn, position: wasAt } } }
      : {})
  };
});


