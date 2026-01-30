import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

interface SelectNodePayload {
  type: 'selectNode';
  payload?: { nodeId: string };
  nodeId?: string;
}

// Select node
defineOperation('selectNode', async (operation: SelectNodePayload, context: TransactionContext) => {
  const nodeId = operation.nodeId ?? operation.payload?.nodeId;
  if (!nodeId) return;
  await context.selectionManager.setSelection({
    type: 'node',
    startNodeId: nodeId,
    startOffset: 0,
    endNodeId: nodeId,
    endOffset: 0
  });
});

// DSL: control(target, [selectNode()])
export const selectNode = defineOperationDSL(
  () => ({ type: 'selectNode' }),
  { atom: true, category: 'selection' }
);
