import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { resolveCaret, splitBlockAtCaret } from './split-at-caret';
import { defineOperationDSL } from './define-operation-dsl';


/**
 * insertParagraph operation (DSL) — selection-based.
 *
 * - context.selection.current 기준으로 새 블록을 삽입한다. blockId/position은 payload에 없음.
 *
 * 사용
 * - insertParagraph()
 * - insertParagraph(blockType?)
 * - insertParagraph(blockType?, selectionAlias?)
 */
export interface InsertParagraphOperation {
  type: 'insertParagraph';
  payload: {
    blockType?: 'paragraph' | 'same';
    selectionAlias?: string;
  };
}

export const insertParagraph = defineOperationDSL(
  (blockType?: 'paragraph' | 'same', selectionAlias?: string) => ({
    type: 'insertParagraph',
    payload: {
      ...(blockType != null && { blockType }),
      ...(selectionAlias != null && { selectionAlias })
    }
  } as InsertParagraphOperation),
  { atom: false, category: 'content' }
);

/**
 * insertParagraph operation (selection-based)
 *
 * 목적
 * - 현재 selection(context.selection.current) 기준으로 새 블록을 삽입한다.
 * - blockId/position을 payload로 받지 않고, selection에서 블록·위치를 해석한다.
 * - datastore API만 사용 (다른 operation 호출 없음).
 *
 * payload
 * - blockType?: 'paragraph' | 'same' — 기본 'same'
 * - selectionAlias?: string — 새 블록에 부여할 $alias
 *
 * 동작
 * - selection이 블록 끝(offset === textLength) → content.addChild로 해당 블록 뒤에 새 블록 추가
 * - selection이 블록 처음(offset === 0) → content.addChild로 해당 블록 앞에 새 블록 추가
 * - selection이 블록 중간 → splitMerge.splitTextNode + splitMerge.splitBlockNode (새 블록 시작에 캐럿)
 */

export interface InsertParagraphPayload {
  blockType?: 'paragraph' | 'same';
  selectionAlias?: string;
}

defineOperation('insertParagraph', async (operation: { type: string; payload: InsertParagraphPayload }, context: TransactionContext) => {
  const { blockType = 'same', selectionAlias = 'insertedBlock' } = operation.payload;
  const dataStore = context.dataStore;
  const schema = context.schema;

  const where = resolveCaret(dataStore, schema, context.selection.current);
  if (!where) {
    throw new Error('insertParagraph: no selection or selection does not resolve to a block text position');
  }
  const parentBlock = dataStore.getNode(where.block.sid) as {
    sid: string;
    stype: string;
    parentId?: string;
    attributes?: Record<string, unknown>;
  };
  if (!parentBlock) throw new Error('insertParagraph: block disappeared before it could be split');
  const cut = splitBlockAtCaret(dataStore, where, 'insertParagraph');

  if (cut.at === 'inside') {
    const newBlock = dataStore.getNode(cut.newBlockId);
    context.lastCreatedBlock = { blockId: cut.newBlockId, firstTextNodeId: cut.firstTextNodeId };
    // selectionAfter.nodeId must name a text node; a block has no offset to sit at.
    if (!cut.firstTextNodeId) throw new Error('insertParagraph: splitBlockNode did not yield a text node');
    return {
      ok: true,
      data: newBlock,
      inverse: { type: 'mergeBlockNodes', payload: { leftNodeId: where.block.sid, rightNodeId: cut.newBlockId, tidySeam: cut.cutSomething } },
      selectionAfter: { nodeId: cut.firstTextNodeId, offset: 0 }
    };
  }

  const grandParent = parentBlock.parentId
    ? dataStore.getNode(dataStore.resolveAlias(parentBlock.parentId))
    : null;
  if (!grandParent || !Array.isArray(grandParent.content)) {
    throw new Error(`insertParagraph: parent block has no parent`);
  }
  const idx = grandParent.content.indexOf(where.block.sid);
  if (idx === -1) throw new Error(`insertParagraph: block not in parent content`);

  // Only the block's two edges reach here: an empty paragraph after it, or an
  // empty paragraph before it.
  const insertIndex = cut.at === 'end' ? idx + 1 : idx;
  const stype = blockType === 'paragraph' ? 'paragraph' : (parentBlock as { stype: string }).stype;
  const newBlock = {
    stype,
    attributes: {
      ...((parentBlock as { attributes?: Record<string, unknown> }).attributes || {}),
      $alias: selectionAlias
    },
    content: [] as string[]
  };
  const childId = dataStore.content.addChild(grandParent.sid!, newBlock, insertIndex);
  const emptyTextId = dataStore.content.addChild(childId, { stype: 'inline-text', text: '' } as any, 0);
  context.lastCreatedBlock = { blockId: childId, firstTextNodeId: emptyTextId };
  const addedNode = dataStore.getNode(childId);
  /**
   * The caret goes with the text, not with the blank.
   *
   * Pressing Enter at the end of a paragraph makes a new one to carry on
   * writing in, so the caret belongs in it. Pressing Enter at the *start*
   * pushes the paragraph down and opens a blank line above it — and the reader
   * is still writing the paragraph they were in, which is now below. Sending
   * the caret into the blank there is the split bug arrived at from the other
   * side: a paragraph appears above and the caret is in it.
   */
  return {
    ok: true,
    data: addedNode,
    inverse: { type: 'removeChild', payload: { parentId: grandParent.sid, childId } },
    selectionAfter:
      cut.at === 'end' ? { nodeId: emptyTextId, offset: 0 } : { nodeId: where.textNodeId, offset: 0 }
  };
});
