import type { Editor, ModelSelection } from '@barocss/editor-core';
import { isNotePageId } from './note-schema';
import { deleteRange, removeChild, transaction } from '@barocss/model';

export interface InsertNotePageReferencePayload {
  pageId: string;
  title: string;
  /** Includes the [[ trigger and query; endpoints must be text runs in one inline container. */
  replaceRange?: ModelSelection;
  selection?: ModelSelection;
}

function insertion(editor: Editor, payload?: InsertNotePageReferencePayload) {
  if (!editor.isEditable || !isNotePageId(payload?.pageId) || typeof payload.title !== 'string') return;
  const range = payload.replaceRange ?? payload.selection ?? editor.selection;
  if (!range || range.type !== 'range') return;
  const store = editor.dataStore, start = store.getNode(range.startNodeId), end = store.getNode(range.endNodeId);
  if (!start?.parentId || start.parentId !== end?.parentId || typeof start.text !== 'string' || typeof end.text !== 'string') return;
  const parent = store.getNode(start.parentId), schema = store.getActiveSchema();
  if (!parent || !schema?.getNodeType('pageReference')) return;
  const children = parent.content ?? [], first = children.indexOf(start.sid!), last = children.indexOf(end.sid!);
  if (first < 0 || last < 0 || !Number.isInteger(range.startOffset) || !Number.isInteger(range.endOffset) || range.startOffset < 0 || range.startOffset > start.text.length || range.endOffset < 0 || range.endOffset > end.text.length) return;
  const backwards = first > last || (first === last && range.startOffset > range.endOffset);
  const ordered = backwards ? { ...range, startNodeId: range.endNodeId, startOffset: range.endOffset, endNodeId: range.startNodeId, endOffset: range.startOffset } : range;
  const at = backwards ? last : first, to = backwards ? first : last;
  // Every node in this container must be inline; a broad selection cannot replace block structure.
  const nodes = children.map(id => typeof id === 'string' ? store.getNode(id) : id);
  if (nodes.some(node => !node || schema.getNodeType(node.stype)?.group !== 'inline')) return;
  if (!schema.validateContent(parent.stype, [...nodes, { stype: 'pageReference' }] as never).valid) return;
  return { parentId: start.parentId, range: ordered, at, to, children };
}

/** Insert one durable workspace identity; navigation and title freshness belong to the host. */
export function registerNotePageReferenceCommands(editor: Editor): void {
  editor.registerCommand({
    name: 'insertNotePageReference',
    canExecute: (_editor, payload?: InsertNotePageReferencePayload) => !!insertion(editor, payload),
    execute: async (_editor, payload?: InsertNotePageReferencePayload) => {
      const target = insertion(editor, payload);
      if (!target || !payload) return false;
      const store = editor.dataStore, { range, parentId, at, to, children } = target;
      const start = store.getNode(range.startNodeId)!;
      const atom = { sid: store.generateId(), stype: 'pageReference', attributes: { pageId: payload.pageId, title: payload.title.trim() || '제목 없음' } };
      const ops: unknown[] = [];
      if (range.startNodeId !== range.endNodeId || range.startOffset !== range.endOffset) {
        ops.push(deleteRange({ startNodeId: range.startNodeId, startOffset: range.startOffset, endNodeId: range.endNodeId, endOffset: range.endOffset }));
        for (const sid of children.slice(at + 1, to)) if (typeof sid === 'string') ops.push(removeChild(parentId, sid));
      }
      const remainingLength = range.startNodeId === range.endNodeId
        ? start.text!.length - (range.endOffset - range.startOffset) : range.startOffset;
      let caretId: string;
      if (range.startOffset === 0) {
        ops.push({ type: 'addChild', payload: { parentId, children: [atom], position: at } });
        caretId = range.startNodeId;
      } else if (range.startOffset === remainingLength) {
        caretId = store.generateId();
        ops.push({ type: 'addChild', payload: { parentId, children: [atom, { sid: caretId, stype: 'inline-text', text: '' }], position: at + 1 } });
      } else {
        caretId = store.generateId();
        ops.push({ type: 'splitTextNode', payload: { nodeId: range.startNodeId, splitPosition: range.startOffset, newNodeId: caretId } },
          { type: 'addChild', payload: { parentId, children: [atom], position: at + 1 } });
      }
      ops.push({ type: 'setSelection', payload: { anchor: { nodeId: caretId, offset: 0 }, head: { nodeId: caretId, offset: 0 } } });
      return (await transaction(editor, ops as never).commit()).success;
    }
  });
}
