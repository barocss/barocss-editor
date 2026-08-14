import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';
import { findBlockAncestor } from './split-at-caret';

export const insertHorizontalRule = defineOperationDSL(
  () => ({ type: 'insertHorizontalRule', payload: {} } as any),
  { atom: true, category: 'structure' }
);

defineOperation('insertHorizontalRule', async (_operation: any, context: TransactionContext) => {
  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!selection || selection.type !== 'range') {
    throw new Error('insertHorizontalRule: no selection');
  }

  const startNode = dataStore.getNode(selection.startNodeId);
  if (!startNode) throw new Error('insertHorizontalRule: start node not found');

  /**
   * The block to put this beside, which is not always the run's parent.
   *
   * A link wraps its text, so inside one the parent is the link — and a block
   * inserted "beside" it went inside the paragraph, next to a run. Nine
   * operations shared the idiom and so shared the fault.
   */
  let blockNode = startNode;
  if (typeof startNode.text === 'string') {
    const parent = findBlockAncestor(dataStore, context.schema, startNode.sid!);
    if (parent) blockNode = parent;
  }

  const grandParent = blockNode.parentId ? dataStore.getNode(blockNode.parentId) : null;
  if (!grandParent || !Array.isArray(grandParent.content)) {
    throw new Error('insertHorizontalRule: cannot find parent container');
  }

  const idx = grandParent.content.indexOf(blockNode.sid!);
  if (idx === -1) throw new Error('insertHorizontalRule: block not in parent');

  const hrId = dataStore.content.addChild(grandParent.sid!, { stype: 'horizontalRule', attributes: {} } as any, idx + 1);

  const newParagraphId = dataStore.content.addChild(grandParent.sid!, { stype: 'paragraph', content: [] } as any, idx + 2);
  const emptyTextId = dataStore.content.addChild(newParagraphId, { stype: 'inline-text', text: '' } as any, 0);

  return {
    ok: true,
    data: dataStore.getNode(hrId),
    inverse: { type: 'delete', payload: { nodeId: hrId } },
    selectionAfter: { nodeId: emptyTextId, offset: 0 }
  };
});
