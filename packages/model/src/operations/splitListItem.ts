import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { resolveCaret, splitBlockAtCaret } from './split-at-caret';

/**
 * splitListItem operation (selection-based)
 *
 * Enter inside a bullet. The item's block is cut where the caret is and the
 * tail becomes a new item after it; at either end of the item, a blank one
 * opens instead. Not inside a list item, this is a no-op — the caller reaches
 * for `insertParagraph`.
 *
 * It did not do that. Whether to split was decided by
 *
 *     listItem.content.length === 1 && listItem.content[0] === textNodeId
 *
 * and a list item's children are *blocks*, so `content[0]` is the paragraph's
 * sid and can never equal a text node's. The condition was false for every list
 * item there has ever been, and the split it guarded was unreachable: Enter in
 * the middle of a bullet left the text whole and added an empty bullet after
 * it. The tests did not see it because they counted items and never read a
 * character — the same way a paragraph split stayed broken while its tests
 * counted paragraphs.
 *
 * The cut is shared with `insertParagraph` now. See `split-at-caret.ts`.
 */

/** The list item a caret is in, and the list holding it. */
function listContext(
  dataStore: any,
  blockId: string
): { listItemId: string; listItem: any; listId: string; listItemIndex: number } | null {
  const listItem = dataStore.getParent(blockId);
  if (!listItem || listItem.stype !== 'listItem') return null;
  const list = dataStore.getNode(dataStore.resolveAlias(listItem.parentId));
  if (!list || list.stype !== 'list' || !Array.isArray(list.content)) return null;
  const listItemIndex = list.content.indexOf(listItem.sid);
  if (listItemIndex === -1) return null;
  return { listItemId: listItem.sid, listItem, listId: list.sid, listItemIndex };
}

defineOperation('splitListItem', async (_operation: { type: string; payload: Record<string, unknown> }, context: TransactionContext) => {
  const dataStore = context.dataStore;
  const schema = context.schema;

  const where = resolveCaret(dataStore, schema, context.selection.current);
  if (!where) return { ok: true, data: null };
  const list = listContext(dataStore, where.block.sid);
  if (!list) return { ok: true, data: null };

  const { listId, listItem, listItemIndex } = list;
  const blockStype = (dataStore.getNode(where.block.sid) as { stype?: string })?.stype ?? 'paragraph';
  const cut = splitBlockAtCaret(dataStore, where, 'splitListItem');

  /** A new item beside this one, holding `blockId`. */
  const itemAt = (index: number, blockId: string): string => {
    const newListItemId = dataStore.content.addChild(listId, { stype: 'listItem', content: [] as string[] }, index);
    dataStore.content.moveNode(blockId, newListItemId, 0);
    return newListItemId;
  };

  if (cut.at === 'inside') {
    if (!cut.firstTextNodeId) throw new Error('splitListItem: splitBlockNode did not yield a text node');
    const newListItemId = itemAt(listItemIndex + 1, cut.newBlockId);
    context.lastCreatedBlock = { blockId: cut.newBlockId, firstTextNodeId: cut.firstTextNodeId };
    return {
      ok: true,
      data: dataStore.getNode(newListItemId),
      // Folding the new item back into the one it came from — three steps, so
      // one operation, because an inverse may only be one.
      inverse: { type: 'mergeListItems', payload: { leftNodeId: listItem.sid, rightNodeId: newListItemId, tidySeam: cut.cutSomething } },
      selectionAfter: { nodeId: cut.firstTextNodeId, offset: 0 }
    };
  }

  // Either end of the item: a blank bullet, of the same kind of block the item
  // is written in, so that carrying on typing behaves the same as the line above.
  const blankBlockId = dataStore.content.addChild(
    listItem.sid,
    { stype: blockStype, attributes: {}, content: [] as string[] },
    listItem.content.length
  );
  const emptyTextId = dataStore.content.addChild(blankBlockId, { stype: 'inline-text', text: '' } as any, 0);
  const newListItemId = itemAt(cut.at === 'end' ? listItemIndex + 1 : listItemIndex, blankBlockId);

  context.lastCreatedBlock = { blockId: blankBlockId, firstTextNodeId: emptyTextId };
  return {
    ok: true,
    data: dataStore.getNode(newListItemId),
    /**
     * Folding the blank item back out again. Nothing was cut to make it — it
     * opened at one end of the item — so the seam must be left alone: joining
     * there would merge the blank's empty run into the text beside it.
     */
    inverse: {
      type: 'mergeListItems',
      payload:
        cut.at === 'end'
          ? { leftNodeId: listItem.sid, rightNodeId: newListItemId, tidySeam: false }
          : { leftNodeId: newListItemId, rightNodeId: listItem.sid, tidySeam: false }
    },
    /**
     * At the end, the blank bullet is where the reader carries on. At the
     * start, they are still writing the bullet they were in — which has just
     * moved down — so the caret stays with its text.
     */
    selectionAfter:
      cut.at === 'end' ? { nodeId: emptyTextId, offset: 0 } : { nodeId: where.textNodeId, offset: 0 }
  };
});
