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

// Set Selection (anchor/head format)
defineOperation('setSelection', async (operation: SetSelectionOperation, context: TransactionContext) => {
  const { anchor, head } = operation.payload;
  
  // Update selection in TransactionContext
  context.selection.current = {
    anchor,
    head,
    empty: anchor.nodeId === head.nodeId && anchor.offset === head.offset
  };
  
  return {
    ok: true,
    data: context.selection.current
  };
});

