import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';
import { findBlockAncestor } from './split-at-caret';

export const insertCallout = defineOperationDSL(
  (calloutType?: string, title?: string) => ({
    type: 'insertCallout',
    payload: {
      calloutType: calloutType ?? 'info',
      ...(title != null && { title })
    }
  } as any),
  { atom: false, category: 'structure' }
);

defineOperation('insertCallout', async (operation: any, context: TransactionContext) => {
  const { calloutType = 'info', title } = operation.payload || {};
  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!selection || selection.type !== 'range') {
    throw new Error('insertCallout: no selection');
  }

  const startNode = dataStore.getNode(selection.startNodeId);
  if (!startNode) throw new Error('insertCallout: start node not found');

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
    throw new Error('insertCallout: cannot find parent container');
  }

  const idx = grandParent.content.indexOf(blockNode.sid!);
  if (idx === -1) throw new Error('insertCallout: block not in parent');

  const attrs: Record<string, any> = { type: calloutType };
  if (title != null) attrs.title = title;

  const calloutId = dataStore.content.addChild(grandParent.sid!, {
    stype: 'callout',
    attributes: attrs,
    content: []
  } as any, idx + 1);

  const paragraphId = dataStore.content.addChild(calloutId, {
    stype: 'paragraph',
    content: []
  } as any, 0);
  const textId = dataStore.content.addChild(paragraphId, { stype: 'inline-text', text: '' } as any, 0);

  return {
    ok: true,
    data: dataStore.getNode(calloutId),
    inverse: { type: 'delete', payload: { nodeId: calloutId } },
    selectionAfter: { nodeId: textId, offset: 0 }
  };
});
