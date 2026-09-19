import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

export interface SetSelectionOperation {
  type: 'setSelection';
  payload: {
    anchor: {
      nodeId: string;
      offset: number;
    };
    head: {
      nodeId: string;
      offset: number;
    };
  };
}

// Set Selection (anchor/head format → ModelSelection)
defineOperation('setSelection', async (operation: SetSelectionOperation, context: TransactionContext) => {
  const { anchor, head } = operation.payload;
  const collapsed = anchor.nodeId === head.nodeId && anchor.offset === head.offset;
  context.selection.current = {
    type: 'range',
    startNodeId: anchor.nodeId,
    startOffset: anchor.offset,
    endNodeId: head.nodeId,
    endOffset: head.offset,
    collapsed
  };
  return {
    ok: true,
    data: context.selection.current,
    // An explicit caret must supersede an earlier edit's suggested caret in this transaction.
    ...(collapsed ? { selectionAfter: { nodeId: anchor.nodeId, offset: anchor.offset } } : {})
  };
});
