import { defineOperation } from './define-operation';
import type { SelectNodeOperation } from './index';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';

// 노드 선택
defineOperation('selectNode', async (operation: SelectNodeOperation, context: TransactionContext) => {
  const { nodeId } = operation;
  
  await context.selectionManager.setSelection({
    type: 'node',
    nodeId
  });
});

// DSL: control(target, [selectNode()])
export const selectNode = defineOperationDSL(
  () => ({ type: 'selectNode' }),
  { atom: true, category: 'selection' }
);
