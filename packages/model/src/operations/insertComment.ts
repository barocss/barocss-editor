import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

export const insertComment = defineOperationDSL(
  (threadId: string) => ({
    type: 'insertComment',
    payload: { threadId }
  } as any),
  { atom: false, category: 'structure' }
);

defineOperation('insertComment', async (operation: any, context: TransactionContext) => {
  const { threadId } = operation.payload || {};
  if (!threadId) throw new Error('insertComment: threadId is required');

  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!selection || selection.type !== 'range') {
    throw new Error('insertComment: no selection');
  }

  const startNode = dataStore.getNode(selection.startNodeId);
  if (!startNode) throw new Error('insertComment: start node not found');

  let blockNode = startNode;
  if (typeof startNode.text === 'string') {
    const parent = dataStore.getParent(startNode.sid!);
    if (parent) blockNode = parent;
  }

  const grandParent = blockNode.parentId ? dataStore.getNode(blockNode.parentId) : null;
  if (!grandParent || !Array.isArray(grandParent.content)) {
    throw new Error('insertComment: cannot find parent container');
  }

  const idx = grandParent.content.indexOf(blockNode.sid!);
  if (idx === -1) throw new Error('insertComment: block not in parent');

  const commentId = dataStore.content.addChild(grandParent.sid!, {
    stype: 'commentThread',
    attributes: { id: threadId },
    content: []
  } as any, idx + 1);
  const textId = dataStore.content.addChild(commentId, { stype: 'inline-text', text: '' } as any, 0);

  return {
    ok: true,
    data: dataStore.getNode(commentId),
    inverse: { type: 'delete', payload: { nodeId: commentId } },
    selectionAfter: { nodeId: textId, offset: 0 }
  };
});
