import { defineOperation } from './define-operation';
import type { SelectRangeOperation } from './index';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

// Set selection range
defineOperation('selectRange', async (operation: SelectRangeOperation, context: TransactionContext) => {
  const { nodeId, start, end } = operation;
  
  await context.selectionManager.setSelection({
    type: 'range',
    nodeId,
    start,
    end
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
