import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

// Clear selection
defineOperation('clearSelection', async (_operation: { type: 'clearSelection' }, context: TransactionContext) => {
  await context.selectionManager.clearSelection();
});

// DSL: clear selection
export const clearSelection = defineOperationDSL(
  () => ({ type: 'clearSelection' }),
  { atom: true, category: 'selection' }
);
