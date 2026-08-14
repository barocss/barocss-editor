import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { findBlockAncestor } from './split-at-caret';

/**
 * wrapInList operation (selection-based)
 *
 * - Wraps the current block in a list (list > listItem > block), or unwraps if already inside a list.
 * - Payload: listType?: 'bullet' | 'ordered' (default 'bullet').
 * - selectionAfter: caret stays in the same text node (wrap/unwrap does not move caret).
 */

export interface WrapInListPayload {
  listType?: 'bullet' | 'ordered';
}

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
    return {
      blockId: parentBlock.sid,
      block: parentBlock,
      parentId: grandParent.sid,
      parent: grandParent,
      blockIndex
    };
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
  return {
    blockId: parent.sid,
    block: parent,
    parentId: grandParent.sid,
    parent: grandParent,
    blockIndex
  };
}

defineOperation('wrapInList', async (operation: { type: string; payload: WrapInListPayload }, context: TransactionContext) => {
  const listType = operation.payload.listType ?? 'bullet';
  const dataStore = context.dataStore;
  const schema = context.schema;
  const selection = context.selection.current;

  const resolved = getCurrentBlockFromSelection(dataStore, schema, selection);
  if (!resolved) {
    throw new Error('wrapInList: no selection or selection does not resolve to a block');
  }
  const { blockId, block: _block, parentId, parent, blockIndex } = resolved;

  const currentSelectionNodeId = selection?.startNodeId ?? null;
  const currentSelectionOffset = typeof selection?.startOffset === 'number' ? selection.startOffset : 0;

  if (parent.stype === 'listItem') {
    const parentListId = parent.parentId;
    if (parentListId == null) throw new Error('wrapInList: listItem has no parent');
    const list = dataStore.getNode(dataStore.resolveAlias(parentListId));
    if (!list || list.stype !== 'list' || !Array.isArray(list.content)) {
      throw new Error('wrapInList: listItem parent is not a list');
    }
    const listParentId = list.parentId;
    if (listParentId == null) throw new Error('wrapInList: list has no parent');
    const docId = dataStore.resolveAlias(listParentId);
    const doc = dataStore.getNode(docId);
    if (!doc || !Array.isArray(doc.content)) {
      throw new Error('wrapInList: list has no document parent');
    }
    const listSid = list.sid;
    if (listSid == null) throw new Error('wrapInList: list has no sid');
    const listIndexInDoc = doc.content.indexOf(listSid);
    if (listIndexInDoc === -1) throw new Error('wrapInList: list not in document');

    const listItemIds = (list.content as string[]).slice();
    /** Which item each block came out of, and where in it — undo's material. */
    const homes: { blockId: string; itemId: string; at: number }[] = [];
    let insertPos = listIndexInDoc;
    for (const itemId of listItemIds) {
      const item = dataStore.getNode(itemId);
      if (!item || !Array.isArray(item.content)) continue;
      const blockIds = (item.content as string[]).slice();
      for (const [at, bid] of blockIds.entries()) {
        homes.push({ blockId: bid, itemId, at });
        dataStore.content.removeChild(itemId, bid);
        dataStore.content.addChild(docId, bid, insertPos);
        insertPos += 1;
      }
    }
    // The list as it stands now, its items emptied — the steps that carry the
    // blocks home run after it is put back.
    const emptied = JSON.parse(JSON.stringify(dataStore.getNode(listSid)));
    dataStore.content.removeChild(docId, listSid);

    return {
      ok: true,
      data: { unwrapped: true },
      /**
       * Put the list back, then every block into the item it came from.
       *
       * Taking a list apart is one change per block plus the list itself, and
       * one inverse could not say all of them — so this said none, and Ctrl+Z
       * after turning a list back into paragraphs did nothing. See `batch`.
       */
      inverse: {
        type: 'batch',
        payload: {
          operations: [
            { type: 'addChild', payload: { parentId: docId, child: emptied, position: listIndexInDoc } },
            ...homes.map((home) => ({
              type: 'moveNode',
              payload: { nodeId: home.blockId, newParentId: home.itemId, position: home.at }
            }))
          ]
        }
      },
      selectionAfter: currentSelectionNodeId ? { nodeId: currentSelectionNodeId, offset: currentSelectionOffset } : undefined
    };
  }

  const listNode = {
    stype: 'list',
    attributes: { type: listType },
    content: [] as string[]
  };
  const listId = dataStore.content.addChild(parentId, listNode, blockIndex);
  const listItemNode = {
    stype: 'listItem',
    content: [] as string[]
  };
  const listItemId = dataStore.content.addChild(listId, listItemNode, 0);
  dataStore.content.moveNode(blockId, listItemId, 0);

  return {
    ok: true,
    data: dataStore.getNode(listId),
    // The block goes home first, so what is removed second is an empty list —
    // and removing the list takes the item inside it with it.
    inverse: {
      type: 'batch',
      payload: {
        operations: [
          { type: 'moveNode', payload: { nodeId: blockId, newParentId: parentId, position: blockIndex } },
          { type: 'removeChild', payload: { parentId, childId: listId } }
        ]
      }
    },
    selectionAfter: currentSelectionNodeId ? { nodeId: currentSelectionNodeId, offset: currentSelectionOffset } : undefined
  };
});
