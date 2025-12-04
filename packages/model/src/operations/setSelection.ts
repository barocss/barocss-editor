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

// Selection 설정 (anchor/head 형식)
defineOperation('setSelection', async (operation: SetSelectionOperation, context: TransactionContext) => {
  const { anchor, head } = operation.payload;
  
  // TransactionContext의 selection을 업데이트
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

