import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

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

/**
 * The block a run belongs to, however deeply it is wrapped.
 *
 * A run is usually a direct child of its paragraph, and taking the run's parent
 * was therefore the same thing as taking the block — until the run is inside a
 * link, or anything else that wraps text. Then the parent is the link, and
 * splitting "the block" split the link instead: the reader pressed Enter inside
 * a hyperlink and the paragraph did not divide at all.
 */
function findBlockAncestor(dataStore: any, schema: any, nodeId: string): any {
  const seen = new Set<string>();
  let current = dataStore.getParent(nodeId);
  while (current && !seen.has(current.sid)) {
    seen.add(current.sid);
    const group = schema?.getNodeType((current as { stype?: string }).stype)?.group;
    // Without a schema to ask, the first parent is the best answer available —
    // which is what this did everywhere before.
    if (!schema || group === 'block' || group === 'document') return current;
    current = dataStore.getParent(current.sid);
  }
  return current ?? dataStore.getParent(nodeId);
}

function resolveSelectionToTextAndOffset(
  dataStore: any,
  schema: any,
  selection: { type: string; startNodeId: string; startOffset?: number } | null
): { textNodeId: string; offset: number; textLength: number; parentBlock: any } | null {
  if (!selection || selection.type !== 'range') return null;
  const node = dataStore.getNode(selection.startNodeId);
  if (!node) return null;

  if (typeof (node as { text?: string }).text === 'string') {
    const text = (node as { text: string }).text;
    const offset =
      typeof selection.startOffset === 'number' && selection.startOffset >= 0
        ? Math.min(selection.startOffset, text.length)
        : 0;
    const parentBlock = findBlockAncestor(dataStore, schema, selection.startNodeId);
    if (!parentBlock || !Array.isArray(parentBlock.content)) return null;
    return { textNodeId: selection.startNodeId, offset, textLength: text.length, parentBlock };
  }

  const nodeType = schema?.getNodeType((node as { stype?: string }).stype);
  if (nodeType?.group !== 'block') return null;
  const block = node as { sid?: string; content?: string[] };
  const lastText = getLastTextNodeInBlock(dataStore, block.sid!);
  if (!lastText) return null;
  const textLen = typeof lastText.text === 'string' ? lastText.text.length : 0;
  const parentBlock = dataStore.getParent(block.sid!);
  if (!parentBlock || !Array.isArray(parentBlock.content)) return null;
  return {
    textNodeId: lastText.sid!,
    offset: textLen,
    textLength: textLen,
    parentBlock: block
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

defineOperation('insertParagraph', async (operation: { type: string; payload: InsertParagraphPayload }, context: TransactionContext) => {
  const { blockType = 'same', selectionAlias = 'insertedBlock' } = operation.payload;
  const dataStore = context.dataStore;
  const schema = context.schema;
  const selection = context.selection.current;

  const resolved = resolveSelectionToTextAndOffset(dataStore, schema, selection);
  if (!resolved) {
    throw new Error('insertParagraph: no selection or selection does not resolve to a block text position');
  }
  const { textNodeId, offset, textLength, parentBlock } = resolved;
  const safeOffset = Math.max(0, Math.min(offset, textLength));

  /**
   * Where the tail begins, counted in the block's own children.
   *
   * Two things used to be assumed here, and a document breaks both.
   *
   * The first is that a block holds one text node. A paragraph holds one run
   * per stretch of formatting, so anything with a bold word in it holds
   * several — and every one of those fell through to the branch that does not
   * split at all, which puts an empty paragraph beside this one and moves the
   * caret into it. Reported by hand as a paragraph appearing *above* with the
   * caret in it, and that is exactly what it is: a caret anywhere but the last
   * run reads as "not at the end", so it inserts before.
   *
   * The second is that the run's parent is the block. A link wraps its text, so
   * inside one the parent is the link, and splitting "the block" split the link
   * instead — the paragraph did not divide and Enter appeared to do nothing.
   *
   * So the position is carried upwards instead. Cut the run if the caret is
   * inside it, then cut each wrapper so everything from the caret onwards ends
   * up in a new sibling, until what is left is an index into the block. A
   * wrapper with nothing before the caret is not cut at all — the whole of it
   * belongs to the tail — and likewise for one with nothing after it. What
   * decides a split, in the end, is whether the block has children on both
   * sides of that index; only its two true edges are an insertion.
   */
  if (safeOffset > 0 && safeOffset < textLength) dataStore.splitTextNode(textNodeId, safeOffset);

  const holderOf = (id: string): { sid: string; content: string[] } => {
    const parent = dataStore.getParent(id);
    if (!parent || !Array.isArray(parent.content)) {
      throw new Error('insertParagraph: ran out of parents before reaching the block');
    }
    return parent as { sid: string; content: string[] };
  };

  let carried: string = textNodeId;
  let holder = holderOf(carried);
  let tailIndex = holder.content.indexOf(carried) + (safeOffset > 0 ? 1 : 0);

  while (holder.sid !== parentBlock.sid) {
    if (tailIndex > 0 && tailIndex < holder.content.length) {
      carried = dataStore.splitBlockNode(holder.sid, tailIndex);
      holder = holderOf(carried);
      tailIndex = holder.content.indexOf(carried);
    } else {
      // All of this wrapper is on one side of the caret: it moves whole.
      const wholeGoesToTail = tailIndex <= 0;
      carried = holder.sid;
      holder = holderOf(carried);
      tailIndex = holder.content.indexOf(carried) + (wholeGoesToTail ? 0 : 1);
    }
  }

  // Re-read: the block's children have moved under us, and the copy resolved
  // before the splits still describes the paragraph as it was.
  const block = dataStore.getNode(parentBlock.sid!) as { sid: string; content: string[] };
  const atBlockStart = tailIndex <= 0;
  const atBlockEnd = tailIndex >= block.content.length;

  if (!atBlockStart && !atBlockEnd) {
    const newNodeId = dataStore.splitBlockNode(parentBlock.sid!, tailIndex);
    const newBlock = dataStore.getNode(newNodeId);
    const firstTextNodeId =
      newBlock && Array.isArray(newBlock.content) && newBlock.content[0]
        ? (newBlock.content[0] as string)
        : null;
    context.lastCreatedBlock = { blockId: newNodeId, firstTextNodeId };
    // selectionAfter.nodeId는 text node여야 함 (block은 offset을 가지지 않음)
    if (!firstTextNodeId) throw new Error('insertParagraph: splitBlockNode did not yield a text node');
    return {
      ok: true,
      data: newBlock,
      inverse: { type: 'mergeBlockNodes', payload: { leftNodeId: parentBlock.sid, rightNodeId: newNodeId } },
      selectionAfter: { nodeId: firstTextNodeId, offset: 0 }
    };
  }

  const grandParent = parentBlock.parentId ? dataStore.getNode(dataStore.resolveAlias(parentBlock.parentId)) : null;
  if (!grandParent || !Array.isArray(grandParent.content)) {
    throw new Error(`insertParagraph: parent block has no parent`);
  }
  const idx = grandParent.content.indexOf(parentBlock.sid);
  if (idx === -1) throw new Error(`insertParagraph: block not in parent content`);

  // Only the block's two edges reach here: an empty paragraph after it, or an
  // empty paragraph before it.
  const insertIndex = atBlockEnd ? idx + 1 : idx;
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
   * the caret into the blank there is the same complaint as the split bug
   * above, arrived at from the other side: a paragraph appears above and the
   * caret is in it.
   *
   * selectionAfter.nodeId must name a text node either way; a block has no
   * offset to sit at.
   */
  return {
    ok: true,
    data: addedNode,
    inverse: { type: 'removeChild', payload: { parentId: grandParent.sid, childId } },
    selectionAfter: atBlockEnd ? { nodeId: emptyTextId, offset: 0 } : { nodeId: textNodeId, offset: 0 }
  };
});
