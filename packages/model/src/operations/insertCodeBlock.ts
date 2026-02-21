import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

export const insertCodeBlock = defineOperationDSL(
  (language?: string) => ({
    type: 'insertCodeBlock',
    payload: { ...(language != null && { language }) }
  } as any),
  { atom: false, category: 'structure' }
);

defineOperation('insertCodeBlock', async (operation: any, context: TransactionContext) => {
  const { language = '' } = operation.payload || {};
  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!selection || selection.type !== 'range') {
    throw new Error('insertCodeBlock: no selection');
  }

  const startNode = dataStore.getNode(selection.startNodeId);
  if (!startNode) throw new Error('insertCodeBlock: start node not found');

  let blockNode = startNode;
  if (typeof startNode.text === 'string') {
    const parent = dataStore.getParent(startNode.sid!);
    if (parent) blockNode = parent;
  }

  const grandParent = blockNode.parentId ? dataStore.getNode(blockNode.parentId) : null;
  if (!grandParent || !Array.isArray(grandParent.content)) {
    throw new Error('insertCodeBlock: cannot find parent container');
  }

  const idx = grandParent.content.indexOf(blockNode.sid!);
  if (idx === -1) throw new Error('insertCodeBlock: block not in parent');

  const codeBlockId = dataStore.content.addChild(grandParent.sid!, {
    stype: 'codeBlock',
    attributes: { language },
    content: []
  } as any, idx + 1);
  const textId = dataStore.content.addChild(codeBlockId, { stype: 'inline-text', text: '' } as any, 0);

  return {
    ok: true,
    data: dataStore.getNode(codeBlockId),
    inverse: { type: 'delete', payload: { nodeId: codeBlockId } },
    selectionAfter: { nodeId: textId, offset: 0 }
  };
});
