import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * outdentNode operation DSL (structural outdent)
 *
 * Purpose
 * - Outdents the specified node one level. Uses DataStore.outdentNode.
 *
 * Input format (DSL)
 * - control(nodeId, [ outdentNode() ]) → payload: {}
 * - outdentNode(nodeId) → payload: { nodeId }
 */

interface OutdentNodeOperation {
  type: 'outdentNode';
  nodeId: string;
}

export const outdentNode = defineOperationDSL(
  (...args: [] | [string]) => {
    if (args.length === 0) {
      // In control(nodeId, [ outdentNode() ]), nodeId is filled by control
      return { type: 'outdentNode', payload: {} } as unknown as OutdentNodeOperation;
    }
    const [nodeId] = args as [string];
    return { type: 'outdentNode', payload: { nodeId } } as unknown as OutdentNodeOperation;
  },
  { atom: false, category: 'structure' }
);


