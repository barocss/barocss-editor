import type { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { isWordTracking } from './word-commands';

export const WORD_CAPTION_LABELS = [
  { id: 'Figure', label: '그림' }, { id: 'Table', label: '표' }, { id: 'Equation', label: '수식' }
] as const;
export type CaptionSession = { rootId: string; surfaceId: string; blockId: string };
export type CaptionSettings = { sequence: string; text: string; position: 'before' | 'after' };

function bodyTarget(editor: Editor, id?: string): CaptionSession | undefined {
  let node = id ? editor.dataStore.getNode(id) : undefined;
  for (let depth = 0; node && depth < 64; depth++) {
    if (node.stype === 'contentControl' || node.attributes?.locked === true) return;
    const parent = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined;
    if (parent?.stype === 'surface') {
      if (parent.attributes?.kind === 'canvas' || parent.parentId !== editor.getRootId() || !parent.content?.includes(node.sid!) ||
        !['paragraph', 'heading', 'bTable', 'math', 'omath'].includes(node.stype)) return;
      return { rootId: editor.getRootId()!, surfaceId: parent.sid!, blockId: node.sid! };
    }
    node = parent;
  }
}

export function captureCaptionSession(editor: Editor): CaptionSession | undefined {
  if (!editor.isEditable || isWordTracking(editor)) return;
  const selection = editor.selection;
  if (selection?.type === 'range') {
    const start = bodyTarget(editor, selection.startNodeId), end = bodyTarget(editor, selection.endNodeId);
    return start && start.blockId === end?.blockId ? start : undefined;
  }
  if (selection?.type === 'node' && selection.nodeIds?.length === 1) return bodyTarget(editor, selection.nodeIds[0]);
}

function valid(editor: Editor, payload?: CaptionSession & CaptionSettings): boolean {
  if (!payload || !editor.isEditable || isWordTracking(editor) || payload.rootId !== editor.getRootId()) return false;
  const target = bodyTarget(editor, payload.blockId);
  return target?.surfaceId === payload.surfaceId &&
    WORD_CAPTION_LABELS.some(label => label.id === payload.sequence) &&
    ['before', 'after'].includes(payload.position) && typeof payload.text === 'string' &&
    payload.text.length <= 1000 && !/[\r\n]/.test(payload.text);
}

export function createWordCaptionCommands(): Extension {
  return { name: 'wordCaptionCommands', onCreate(editor) {
    editor.registerCommand({ name: 'insertWordCaption', canExecute: valid,
      execute: async (ed, payload?: CaptionSession & CaptionSettings) => {
        if (!valid(ed, payload)) return false;
        const p = payload!, surface = ed.dataStore.getNode(p.surfaceId)!;
        const label = WORD_CAPTION_LABELS.find(label => label.id === p.sequence)!.label;
        const textId = ed.dataStore.generateId();
        const suffix = p.text.trim() ? `: ${p.text.trim()}` : ' ';
        ed.historyManager.closeGroup();
        const result = await transaction(ed, [
          { type: 'addChild', payload: { parentId: p.surfaceId,
            position: surface.content!.indexOf(p.blockId) + (p.position === 'after' ? 1 : 0),
            child: { stype: 'paragraph', attributes: { styleId: 'Body', spacingBefore: 80, spacingAfter: 120, keepNext: p.position === 'before' }, content: [
              { stype: 'inline-text', text: `${label} ` },
              { stype: 'fieldSeq', attributes: { sequence: p.sequence, format: 'decimal' } },
              { stype: 'inline-text', sid: textId, text: suffix }
            ] } } },
          { type: 'setSelection', payload: { anchor: { nodeId: textId, offset: suffix.length }, head: { nodeId: textId, offset: suffix.length } } }
        ] as never).commit();
        ed.historyManager.closeGroup();
        return result.success;
      }
    });
  } };
}
