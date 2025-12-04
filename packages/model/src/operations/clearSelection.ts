import { defineOperation } from './define-operation';
import type { ClearSelectionOperation } from './index';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

// 선택 해제
defineOperation('clearSelection', async (operation: ClearSelectionOperation, context: TransactionContext) => {
  await context.selectionManager.clearSelection();
});

// DSL: selection 해제
export const clearSelection = defineOperationDSL(
  () => ({ type: 'clearSelection' }),
  { atom: true, category: 'selection' }
);
