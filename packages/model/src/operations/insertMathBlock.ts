import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

export const insertMathBlock = defineOperationDSL(
  (tex?: string, engine?: string) => ({
    type: 'insertMathBlock',
    payload: {
      tex: tex ?? '',
      ...(engine != null && { engine })
    }
  } as any),
  { atom: true, category: 'structure' }
);

defineOperation('insertMathBlock', async (operation: any, context: TransactionContext) => {
  const { tex = '', engine = 'katex' } = operation.payload || {};
  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!selection || selection.type !== 'range') {
    throw new Error('insertMathBlock: no selection');
  }

  const startNode = dataStore.getNode(selection.startNodeId);
  if (!startNode) throw new Error('insertMathBlock: start node not found');

  let blockNode = startNode;
  if (typeof startNode.text === 'string') {
    const parent = dataStore.getParent(startNode.sid!);
    if (parent) blockNode = parent;
  }

  const grandParent = blockNode.parentId ? dataStore.getNode(blockNode.parentId) : null;
  if (!grandParent || !Array.isArray(grandParent.content)) {
    throw new Error('insertMathBlock: cannot find parent container');
  }

  const idx = grandParent.content.indexOf(blockNode.sid!);
  if (idx === -1) throw new Error('insertMathBlock: block not in parent');

  const mathBlockId = dataStore.content.addChild(grandParent.sid!, {
    stype: 'mathBlock',
    attributes: { tex, engine }
  } as any, idx + 1);

  return {
    ok: true,
    data: dataStore.getNode(mathBlockId),
    inverse: { type: 'delete', payload: { nodeId: mathBlockId } },
    selectionAfter: { nodeId: mathBlockId, offset: 0 }
  };
});
