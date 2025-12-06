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

  const ok = context.dataStore.indentNode(nodeId);

  // If indentNode returns false (e.g., cannot indent further),
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
    inverse: { type: 'outdentNode', payload: { nodeId } }
  };
});


