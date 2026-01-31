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
    const parentBlock = dataStore.getParent(selection.startNodeId);
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
  const isSingleTextChild = parentBlock.content.length === 1 && parentBlock.content[0] === textNodeId;

  if (isSingleTextChild && safeOffset > 0 && safeOffset < textLength) {
    dataStore.splitTextNode(textNodeId, safeOffset);
    const newNodeId = dataStore.splitBlockNode(parentBlock.sid!, 1);
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

  const insertIndex = safeOffset === textLength ? idx + 1 : idx;
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
  // selectionAfter.nodeId는 text node여야 함 (block은 offset을 가지지 않음)
  return {
    ok: true,
    data: addedNode,
    inverse: { type: 'removeChild', payload: { parentId: grandParent.sid, childId } },
    selectionAfter: { nodeId: emptyTextId, offset: 0 }
  };
});
