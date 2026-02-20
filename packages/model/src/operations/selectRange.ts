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
  const normalizedStart = Math.min(start, end);
  const normalizedEnd = Math.max(start, end);

  await context.selectionManager.setSelection({
    type: 'range',
    startNodeId: nodeId,
    startOffset: normalizedStart,
    endNodeId: nodeId,
    endOffset: normalizedEnd
  });

  context.selection.setRange(nodeId, normalizedStart, nodeId, normalizedEnd);
});

// DSL: control(target, [selectRange(anchor, focus)])
export const selectRange = defineOperationDSL(
  (anchor: number, focus: number) => ({
    type: 'selectRange',
    payload: { anchor, focus }
  }),
  { atom: true, category: 'selection' }
);
