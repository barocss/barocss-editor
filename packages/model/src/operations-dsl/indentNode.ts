import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * indentNode operation DSL (structural indent)
 *
 * Purpose
 * - Indents the specified node one level. Uses DataStore.indentNode.
 *
 * Input format (DSL)
 * - control(nodeId, [ indentNode() ]) → payload: {}
 * - indentNode(nodeId) → payload: { nodeId }
 */

interface IndentNodeOperation {
  type: 'indentNode';
  nodeId: string;
}

export const indentNode = defineOperationDSL(
  (...args: [] | [string]) => {
    if (args.length === 0) {
      // In control(nodeId, [ indentNode() ]), nodeId is filled by control
      return { type: 'indentNode', payload: {} } as unknown as IndentNodeOperation;
    }
    const [nodeId] = args as [string];
    return { type: 'indentNode', payload: { nodeId } } as unknown as IndentNodeOperation;
  },
  { atom: false, category: 'structure' }
);


