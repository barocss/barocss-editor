import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * splitListItem operation (selection-based)
 *
 * When the caret is inside a list item (e.g. in its paragraph's text), creates a new list item
 * after the current one with an empty block (paragraph) and moves the caret into that new item's
 * first text node. If not inside a list item, no-op (caller may use insertParagraph instead).
 */

function getCurrentBlockAndListContext(
  dataStore: any,
  schema: any,
  selection: { type: string; startNodeId: string; startOffset?: number } | null
): {
  blockId: string;
  block: any;
  listItemId: string;
  listItem: any;
  listId: string;
  list: any;
  listItemIndex: number;
  textNodeId: string;
  offset: number;
  textLength: number;
} | null {
  if (!selection || selection.type !== 'range') return null;
  const node = dataStore.getNode(selection.startNodeId);
  if (!node) return null;

  let textNodeId: string;
  let offset: number;
  let textLength: number;
  let block: any;

  if (typeof (node as { text?: string }).text === 'string') {
    textNodeId = selection.startNodeId;
    const text = (node as { text: string }).text;
    offset = typeof selection.startOffset === 'number' && selection.startOffset >= 0 ? Math.min(selection.startOffset, text.length) : 0;
    textLength = text.length;
    block = dataStore.getParent(textNodeId);
  } else {
    const nodeType = schema?.getNodeType((node as { stype?: string }).stype);
    if (nodeType?.group !== 'block') return null;
    block = node as { sid?: string; content?: string[] };
    const lastText = getLastTextNodeInBlock(dataStore, block.sid!);
    if (!lastText) return null;
    textNodeId = lastText.sid;
    textLength = lastText.text.length;
    offset = textLength;
  }

  if (!block || !Array.isArray(block.content)) return null;
  const listItem = dataStore.getParent(block.sid);
  if (!listItem || listItem.stype !== 'listItem') return null;
  const list = dataStore.getNode(dataStore.resolveAlias(listItem.parentId));
  if (!list || list.stype !== 'list' || !Array.isArray(list.content)) return null;

  const listItemIndex = list.content.indexOf(listItem.sid);
  if (listItemIndex === -1) return null;

  return {
    blockId: block.sid,
    block,
    listItemId: listItem.sid,
    listItem,
    listId: list.sid,
    list,
    listItemIndex,
    textNodeId,
    offset,
    textLength
  };
}

function getLastTextNodeInBlock(dataStore: any, blockId: string): { sid: string; text: string } | null {
  const block = dataStore.getNode(blockId);
  if (!block || !Array.isArray((block as { content?: string[] }).content)) return null;
  const content = (block as { content: string[] }).content;
  let last: { sid: string; text: string } | null = null;
  const visit = (id: string): void => {
    const n = dataStore.getNode(id);
    if (!n) return;
    if (typeof (n as { text?: string }).text === 'string') {
      last = { sid: (n as { sid: string }).sid, text: (n as { text: string }).text };
      return;
    }
    const childIds = (n as { content?: string[] }).content;
    if (Array.isArray(childIds)) for (const cid of childIds) visit(cid);
  };
  for (const id of content) visit(id);
  return last;
}

defineOperation('splitListItem', async (operation: { type: string; payload: Record<string, unknown> }, context: TransactionContext) => {
  const dataStore = context.dataStore;
  const schema = context.schema;
  const selection = context.selection.current;

  const resolved = getCurrentBlockAndListContext(dataStore, schema, selection);
  if (!resolved) {
    return { ok: true, data: null };
  }

  const { listId, listItem, listItemIndex, textNodeId, offset, textLength } = resolved;
  const safeOffset = Math.max(0, Math.min(offset, textLength));
  const isSingleTextChild = listItem.content.length === 1 && listItem.content[0] === textNodeId;

  if (isSingleTextChild && safeOffset > 0 && safeOffset < textLength) {
    dataStore.splitTextNode(textNodeId, safeOffset);
    const newNodeId = dataStore.splitBlockNode(resolved.blockId, 1);
    const newBlock = dataStore.getNode(newNodeId);
    const firstTextNodeId =
      newBlock && Array.isArray(newBlock.content) && newBlock.content[0] ? (newBlock.content[0] as string) : null;
    if (!firstTextNodeId) throw new Error('splitListItem: splitBlockNode did not yield a text node');
    const newListItemNode = {
      stype: 'listItem',
      content: [] as string[]
    };
    const newListItemId = dataStore.content.addChild(listId, newListItemNode, listItemIndex + 1);
    dataStore.content.moveNode(newNodeId, newListItemId, 0);
    context.lastCreatedBlock = { blockId: newNodeId, firstTextNodeId };
    return {
      ok: true,
      data: dataStore.getNode(newListItemId),
      selectionAfter: { nodeId: firstTextNodeId, offset: 0 }
    };
  }

  const newParagraph = {
    stype: 'paragraph',
    attributes: {},
    content: [] as string[]
  };
  const newBlockId = dataStore.content.addChild(listItem.sid, newParagraph, listItem.content.length);
  const emptyTextId = dataStore.content.addChild(newBlockId, { stype: 'inline-text', text: '' } as any, 0);

  const newListItemNode = {
    stype: 'listItem',
    content: [] as string[]
  };
  const newListItemId = dataStore.content.addChild(listId, newListItemNode, listItemIndex + 1);
  dataStore.content.moveNode(newBlockId, newListItemId, 0);

  context.lastCreatedBlock = { blockId: newBlockId, firstTextNodeId: emptyTextId };
  return {
    ok: true,
    data: dataStore.getNode(newListItemId),
    selectionAfter: { nodeId: emptyTextId, offset: 0 }
  };
});
