import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';
import { findBlockAncestor } from './split-at-caret';

export const insertChecklist = defineOperationDSL(
  (checked?: boolean) => ({
    type: 'insertChecklist',
    payload: { checked: checked ?? false }
  } as any),
  { atom: false, category: 'structure' }
);

defineOperation('insertChecklist', async (operation: any, context: TransactionContext) => {
  const { checked = false } = operation.payload || {};
  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!selection || selection.type !== 'range') {
    throw new Error('insertChecklist: no selection');
  }

  const startNode = dataStore.getNode(selection.startNodeId);
  if (!startNode) throw new Error('insertChecklist: start node not found');

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
    throw new Error('insertChecklist: cannot find parent container');
  }

  const idx = grandParent.content.indexOf(blockNode.sid!);
  if (idx === -1) throw new Error('insertChecklist: block not in parent');

  const taskItemId = dataStore.content.addChild(grandParent.sid!, {
    stype: 'taskItem',
    attributes: { checked },
    content: []
  } as any, idx + 1);
  const textId = dataStore.content.addChild(taskItemId, { stype: 'inline-text', text: '' } as any, 0);

  return {
    ok: true,
    data: dataStore.getNode(taskItemId),
    inverse: { type: 'delete', payload: { nodeId: taskItemId } },
    selectionAfter: { nodeId: textId, offset: 0 }
  };
});
