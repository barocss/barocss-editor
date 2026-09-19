import type { Editor, Extension, ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { createFieldResolver, documentBookmarks, walkBlocks } from '@barocss/office-text';
import { isWordTracking } from './word-commands';

export type BookmarkSession = { rootId: string; selection: ModelSelection };
const docOf = (editor: Editor) => ({ rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) });
export const wordBookmarks = (editor: Editor) => documentBookmarks(docOf(editor));
export const wordCaptions = (editor: Editor) => createFieldResolver(docOf(editor)).captions();
export function captureBookmarkSession(editor: Editor): BookmarkSession | undefined {
  return editor.selection?.type === 'range' ? { rootId: editor.getRootId()!, selection: structuredClone(editor.selection) } : undefined;
}
export type BookmarkPayload = Partial<BookmarkSession> & { name?: string; nextName?: string; format?: 'text' | 'aboveBelow' | 'labelNumber' | 'number'; targetKind?: 'bookmark' | 'caption'; targetSid?: string };
type Payload = BookmarkPayload;
function textTarget(editor: Editor, at?: ModelSelection | null) {
  if (at?.type !== 'range') return;
  const start = editor.dataStore.getNode(at.startNodeId), end = editor.dataStore.getNode(at.endNodeId);
  const parent = start?.parentId && editor.dataStore.getNode(start.parentId);
  if (start?.stype !== 'inline-text' || end?.stype !== 'inline-text' || !parent ||
    !['paragraph','heading'].includes(parent.stype) || start.parentId !== end.parentId ||
    at.startOffset < 0 || at.startOffset > start.text!.length || at.endOffset < 0 || at.endOffset > end.text!.length) return;
  let ancestor = parent;
  for (let depth = 0; depth < 64; depth++) {
    if (ancestor.stype === 'contentControl' || ancestor.attributes?.locked === true) return;
    if (ancestor.sid === editor.getRootId()) break;
    const next = ancestor.parentId ? editor.dataStore.getNode(ancestor.parentId) : undefined;
    if (!next || depth === 63) return;
    ancestor = next;
  }
  return { start, end, parent, at, collapsed: start.sid === end.sid && at.startOffset === at.endOffset };
}
function insertAtom(editor: Editor, target: NonNullable<ReturnType<typeof textTarget>>, atom: object): unknown[] {
  const { start, parent, at } = target;
  const index = parent.content!.indexOf(start.sid!);
  const caret = editor.dataStore.generateId();
  const add = (position: number, children: object[]) => ({ type: 'addChild', payload: { parentId: parent.sid, position, children } });
  const ops: unknown[] = [];
  let next = start.sid!;
  if (at.startOffset === 0) ops.push(add(index, [atom]));
  else if (at.startOffset === start.text!.length) { ops.push(add(index + 1, [atom, { stype: 'inline-text', sid: caret, text: '' }])); next = caret; }
  else { ops.push({ type: 'splitTextNode', payload: { nodeId: start.sid, splitPosition: at.startOffset, newNodeId: caret } }, add(index + 1, [atom])); next = caret; }
  ops.push({ type: 'setSelection', payload: { anchor: { nodeId: next, offset: 0 }, head: { nodeId: next, offset: 0 } } });
  return ops;
}
export function bookmarkSelection(editor: Editor, name: string, kind = 'bookmark'): ModelSelection | undefined {
  if (kind === 'caption') {
    const matches = wordCaptions(editor).filter(caption => caption.targetId === name);
    if (matches.length !== 1) return;
    const block = editor.dataStore.getNode(matches[0].blockId);
    const text = block?.content?.map(id => editor.dataStore.getNode(String(id))).find(node => node?.stype === 'inline-text');
    return text?.sid ? { type: 'range', startNodeId: text.sid, endNodeId: text.sid, startOffset: 0, endOffset: 0, collapsed: true } : undefined;
  }
  if (kind !== 'bookmark') return;
  const entry = wordBookmarks(editor).find(item => item.name === name);
  if (!entry) return;
  let id = entry.sid, offset = entry.offset;
  if (entry.kind === 'point') {
    const anchor = editor.dataStore.getNode(entry.sid)!;
    const parent = editor.dataStore.getNode(anchor.parentId!)!;
    const index = parent.content!.indexOf(entry.sid);
    const after = parent.content!.slice(index + 1).map(sid => editor.dataStore.getNode(String(sid))).find(node => node?.stype === 'inline-text');
    const before = parent.content!.slice(0, index).reverse().map(sid => editor.dataStore.getNode(String(sid))).find(node => node?.stype === 'inline-text');
    const text = after ?? before;
    if (!text) return;
    id = text.sid!; offset = after ? 0 : text.text!.length;
  }
  return { type: 'range', startNodeId: id, endNodeId: id, startOffset: offset, endOffset: offset, collapsed: true };
}
export function createWordBookmarkCommands(): Extension {
  return { name: 'wordBookmarkCommands', onCreate(editor) {
    for (const action of ['addWordBookmark', 'renameWordBookmark', 'deleteWordBookmark', 'insertWordReference']) {
      const valid = (ed: Editor, payload?: Payload) => {
        if (!payload || !ed.isEditable || isWordTracking(ed) || (payload.rootId && payload.rootId !== ed.getRootId())) return false;
        if (action === 'insertWordReference' && payload.targetKind === 'caption') {
          const target = textTarget(ed, payload.selection ?? ed.selection);
          const caption = wordCaptions(ed).find(entry => entry.sid === payload.targetSid);
          return !!target?.collapsed && !!caption && ['text', 'labelNumber', 'number'].includes(payload.format ?? 'labelNumber') &&
            (!caption.targetId || wordCaptions(ed).filter(entry => entry.targetId === caption.targetId).length === 1);
        }
        if (payload.targetKind && payload.targetKind !== 'bookmark') return false;
        const entries = wordBookmarks(ed);
        const name = payload.name?.trim();
        if (!name || name.length > 80) return false;
        if (action !== 'addWordBookmark' && !entries.some(entry => entry.name === name)) return false;
        if (action === 'renameWordBookmark') return !!payload.nextName?.trim() && payload.nextName.trim().length <= 80 &&
          !entries.some(entry => entry.name.toLocaleLowerCase() === payload.nextName!.trim().toLocaleLowerCase());
        if (action === 'deleteWordBookmark') return true;
        const target = textTarget(ed, payload.selection ?? ed.selection);
        if (!target) return false;
        if (action === 'insertWordReference') return target.collapsed && ['text','aboveBelow'].includes(payload.format ?? 'text');
        return !entries.some(entry => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      };
      editor.registerCommand({ name: action, canExecute: valid, execute: async (ed, payload?: Payload) => {
        if (!valid(ed, payload)) return false;
        const p = payload!, name = p.name?.trim() ?? '';
        const ops: unknown[] = [];
        if (action === 'addWordBookmark' || action === 'insertWordReference') {
          const target = textTarget(ed, p.selection ?? ed.selection)!;
          if (action === 'insertWordReference') {
            let targetId = name;
            if (p.targetKind === 'caption') {
              const caption = wordCaptions(ed).find(entry => entry.sid === p.targetSid)!;
              targetId = caption.targetId || `caption_${crypto.randomUUID()}`;
              if (!caption.targetId) ops.push({ type: 'setAttrs', payload: { nodeId: caption.sid, attrs: { id: targetId } } });
            }
            ops.push(...insertAtom(ed, target, { stype: 'fieldRef', attributes: { targetId, targetKind: p.targetKind ?? 'bookmark', format: p.format ?? (p.targetKind === 'caption' ? 'labelNumber' : 'text'), useHyperlink: true } }));
          }
          else if (target.collapsed) ops.push(...insertAtom(ed, target, { stype: 'bookmarkAnchor', attributes: { id: name } }));
          else for (const id of ed.dataStore.createRangeIterator(target.at.startNodeId, target.at.endNodeId, { includeStart: true, includeEnd: true })) {
            const node = ed.dataStore.getNode(id);
            if (node?.stype !== 'inline-text') continue;
            const from = id === target.at.startNodeId ? target.at.startOffset : 0;
            const to = id === target.at.endNodeId ? target.at.endOffset : node.text!.length;
            if (from < to) ops.push({ type: 'setMarks', payload: { nodeId: id, marks: [...(node.marks ?? []), { stype: 'bookmark', attrs: { name }, range: [from, to] }] } });
          }
        } else {
          const doc = docOf(ed);
          for (const node of walkBlocks(doc, doc.getNode(doc.rootId))) {
            if (node.stype === 'bookmarkAnchor' && node.attributes?.id === name) ops.push(action === 'deleteWordBookmark'
              ? { type: 'delete', payload: { nodeId: node.sid } }
              : { type: 'setAttrs', payload: { nodeId: node.sid, attrs: { id: p.nextName!.trim() } } });
            if (node.marks?.some(mark => mark.stype === 'bookmark' && mark.attrs?.name === name)) {
              const marks = action === 'deleteWordBookmark' ? node.marks.filter(mark => !(mark.stype === 'bookmark' && mark.attrs?.name === name))
                : node.marks.map(mark => mark.stype === 'bookmark' && mark.attrs?.name === name ? { ...mark, attrs: { ...mark.attrs, name: p.nextName!.trim() } } : mark);
              ops.push({ type: 'setMarks', payload: { nodeId: node.sid, marks } });
            }
            if (action === 'renameWordBookmark' && node.stype === 'fieldRef' && node.attributes?.targetKind !== 'caption' && node.attributes?.targetId === name)
              ops.push({ type: 'setAttrs', payload: { nodeId: node.sid, attrs: { targetId: p.nextName!.trim() } } });
          }
        }
        if (!ops.length) return false;
        ed.historyManager.closeGroup();
        const result = await transaction(ed, ops as never).commit();
        ed.historyManager.closeGroup(); return result.success;
      } });
    }
  } };
}
