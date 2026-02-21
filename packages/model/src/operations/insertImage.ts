import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

export const insertImage = defineOperationDSL(
  (src: string, alt?: string) => ({
    type: 'insertImage',
    payload: { src, ...(alt != null && { alt }) }
  } as any),
  { atom: true, category: 'content' }
);

defineOperation('insertImage', async (operation: any, context: TransactionContext) => {
  const { src, alt } = operation.payload;
  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!src) throw new Error('insertImage: src is required');
  if (!selection || selection.type !== 'range') {
    throw new Error('insertImage: no selection');
  }

  const startNode = dataStore.getNode(selection.startNodeId);
  if (!startNode) throw new Error('insertImage: start node not found');

  let blockNode = startNode;
  if (typeof startNode.text === 'string') {
    const parent = dataStore.getParent(startNode.sid!);
    if (parent) blockNode = parent;
  }

  if (!Array.isArray(blockNode.content)) {
    throw new Error('insertImage: target block has no content array');
  }

  const textNodeId = selection.startNodeId;
  const textNode = dataStore.getNode(textNodeId);
  let insertIndex: number;

  if (textNode && typeof textNode.text === 'string') {
    insertIndex = blockNode.content.indexOf(textNodeId);
    if (insertIndex === -1) insertIndex = blockNode.content.length;
    else insertIndex += 1;
  } else {
    insertIndex = blockNode.content.length;
  }

  const imageId = dataStore.content.addChild(blockNode.sid!, {
    stype: 'inline-image',
    attributes: { src, ...(alt != null && { alt }) }
  } as any, insertIndex);

  return {
    ok: true,
    data: dataStore.getNode(imageId),
    inverse: { type: 'removeChild', payload: { parentId: blockNode.sid, childId: imageId } }
  };
});
