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

  const ok = context.dataStore.outdentNode(nodeId);

  // If outdentNode returns false (e.g., already at top level),
  // treat as no-op rather than error
  if (!ok) {
    return {
      ok: true,
      data: context.dataStore.getNode(nodeId)
    };
  }

  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'indentNode', payload: { nodeId } }
  };
});


