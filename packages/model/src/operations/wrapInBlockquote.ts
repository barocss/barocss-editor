import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { findBlockAncestor } from './split-at-caret';

function getCurrentBlockFromSelection(
  dataStore: any,
  schema: any,
  selection: { type: string; startNodeId: string; startOffset?: number } | null
): { blockId: string; block: any; parentId: string; parent: any; blockIndex: number } | null {
  if (!selection || selection.type !== 'range') return null;
  const node = dataStore.getNode(selection.startNodeId);
  if (!node) return null;
  if (typeof (node as { text?: string }).text === 'string') {
    // The nearest block, not the run's parent: inside a link the parent is
    // the link, and wrapping that wraps a word rather than the paragraph.
    const parentBlock = findBlockAncestor(dataStore, schema, selection.startNodeId);
    if (!parentBlock || !Array.isArray(parentBlock.content)) return null;
    const grandParent = parentBlock.parentId ? dataStore.getNode(dataStore.resolveAlias(parentBlock.parentId)) : null;
    if (!grandParent || !Array.isArray(grandParent.content)) return null;
    const blockIndex = grandParent.content.indexOf(parentBlock.sid);
    if (blockIndex === -1) return null;
    return { blockId: parentBlock.sid, block: parentBlock, parentId: grandParent.sid, parent: grandParent, blockIndex };
  }
  const nodeType = schema?.getNodeType((node as { stype?: string }).stype);
  if (nodeType?.group !== 'block') return null;
  const block = node as { sid?: string; content?: string[] };
  const parent = dataStore.getParent(block.sid!);
  if (!parent || !Array.isArray(parent.content)) return null;
  const grandParent = parent.parentId ? dataStore.getNode(dataStore.resolveAlias(parent.parentId)) : null;
  if (!grandParent || !Array.isArray(grandParent.content)) return null;
  const blockIndex = grandParent.content.indexOf(parent.sid);
  if (blockIndex === -1) return null;
  return { blockId: parent.sid, block: parent, parentId: grandParent.sid, parent: grandParent, blockIndex };
}

defineOperation('wrapInBlockquote', async (_operation: { type: string; payload: Record<string, unknown> }, context: TransactionContext) => {
  const dataStore = context.dataStore;
  const schema = context.schema;
  const selection = context.selection.current;
  const resolved = getCurrentBlockFromSelection(dataStore, schema, selection);
  if (!resolved) throw new Error('wrapInBlockquote: no selection or selection does not resolve to a block');
  const { blockId, block: _block, parentId, parent, blockIndex } = resolved;
  const currentSelectionNodeId = selection?.startNodeId ?? null;
  const currentSelectionOffset = typeof selection?.startOffset === 'number' ? selection.startOffset : 0;

  if (parent.stype === 'blockQuote') {
    const docId = dataStore.resolveAlias(parent.parentId);
    const doc = dataStore.getNode(docId);
    if (!doc || !Array.isArray(doc.content)) throw new Error('wrapInBlockquote: blockQuote has no document parent');
    const bqIndexInDoc = doc.content.indexOf(parent.sid);
    if (bqIndexInDoc === -1) throw new Error('wrapInBlockquote: blockQuote not in document');
    const blockIds = (parent.content as string[]).slice();
    let insertPos = bqIndexInDoc;
    for (const bid of blockIds) {
      dataStore.content.removeChild(parent.sid, bid);
      dataStore.content.addChild(docId, bid, insertPos);
      insertPos += 1;
    }
    // The quote as it stands now, which is empty: its blocks have already moved
    // out, and the steps that carry them back run after it is put back.
    const emptied = JSON.parse(JSON.stringify(dataStore.getNode(parent.sid)));
    dataStore.content.removeChild(docId, parent.sid);

    return {
      ok: true,
      data: { unwrapped: true },
      /**
       * Put the quote back, then its blocks into it, in order.
       *
       * Taking a quote off is several changes — one per block it held, plus the
       * quote itself — and one inverse could not say all of them, so this said
       * none: Ctrl+Z after unquoting a paragraph did nothing at all. See `batch`.
       */
      inverse: {
        type: 'batch',
        payload: {
          operations: [
            { type: 'addChild', payload: { parentId: docId, child: emptied, position: bqIndexInDoc } },
            ...blockIds.map((bid, index) => ({
              type: 'moveNode',
              payload: { nodeId: bid, newParentId: parent.sid, position: index }
            }))
          ]
        }
      },
      selectionAfter: currentSelectionNodeId ? { nodeId: currentSelectionNodeId, offset: currentSelectionOffset } : undefined
    };
  }

  const blockQuoteNode = { stype: 'blockQuote', content: [] as string[] };
  const bqId = dataStore.content.addChild(parentId, blockQuoteNode, blockIndex);
  dataStore.content.moveNode(blockId, bqId, 0);
  return {
    ok: true,
    data: dataStore.getNode(bqId),
    // The block goes home first, so what is removed second is an empty quote.
    inverse: {
      type: 'batch',
      payload: {
        operations: [
          { type: 'moveNode', payload: { nodeId: blockId, newParentId: parentId, position: blockIndex } },
          { type: 'removeChild', payload: { parentId, childId: bqId } }
        ]
      }
    },
    selectionAfter: currentSelectionNodeId ? { nodeId: currentSelectionNodeId, offset: currentSelectionOffset } : undefined
  };
});
