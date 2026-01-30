import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

interface SelectRangePayload {
  type: 'selectRange';
  payload?: { anchor: number; focus: number };
  nodeId?: string;
  start?: number;
  end?: number;
}

// Set selection range
defineOperation('selectRange', async (operation: SelectRangePayload, context: TransactionContext) => {
  const nodeId = operation.nodeId ?? (operation.payload && 'nodeId' in operation.payload ? (operation.payload as { nodeId: string }).nodeId : undefined);
  const start = operation.start ?? operation.payload?.anchor ?? 0;
  const end = operation.end ?? operation.payload?.focus ?? 0;
  if (!nodeId) return;
  await context.selectionManager.setSelection({
    type: 'range',
    startNodeId: nodeId,
    startOffset: Math.min(start, end),
    endNodeId: nodeId,
    endOffset: Math.max(start, end)
  });
});

// DSL: control(target, [selectRange(anchor, focus)])
export const selectRange = defineOperationDSL(
  (anchor: number, focus: number) => ({
    type: 'selectRange',
    payload: { anchor, focus }
  }),
  { atom: true, category: 'selection' }
);
