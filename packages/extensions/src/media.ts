import { registerMediaRenderers } from './default-renderers';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

export class MediaExtension implements Extension {
  name = 'media';
  priority = 100;

  /** What this extension's nodes look like when the product has not said. */

  defaultRenderers(): void {

    registerMediaRenderers();

  }


  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertVideo',
      execute: async (ed: Editor, payload?: { src?: string; poster?: string; selection?: ModelSelection }) => {
        if (!payload?.src) return false;
        const insertInfo = this._getInsertInfo(ed, payload?.selection);
        if (!insertInfo) return false;

        const attrs: any = { src: payload.src, controls: true };
        if (payload.poster) attrs.poster = payload.poster;

        const ops = [addChild(insertInfo.parentId, { stype: 'mediaVideo', attributes: attrs } as any, insertInfo.position)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'insertAudio',
      execute: async (ed: Editor, payload?: { src?: string; selection?: ModelSelection }) => {
        if (!payload?.src) return false;
        const insertInfo = this._getInsertInfo(ed, payload?.selection);
        if (!insertInfo) return false;

        const ops = [addChild(insertInfo.parentId, { stype: 'mediaAudio', attributes: { src: payload.src, controls: true } } as any, insertInfo.position)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'insertEmbed',
      execute: async (ed: Editor, payload?: { provider?: string; id?: string; title?: string; selection?: ModelSelection }) => {
        if (!payload?.provider || !payload?.id) return false;
        const insertInfo = this._getInsertInfo(ed, payload?.selection);
        if (!insertInfo) return false;

        const attrs: any = { provider: payload.provider, id: payload.id };
        if (payload.title) attrs.title = payload.title;

        const ops = [addChild(insertInfo.parentId, { stype: 'mediaEmbed', attributes: attrs } as any, insertInfo.position)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}

  private _getInsertInfo(editor: Editor, selection?: ModelSelection): { parentId: string; position: number } | null {
    const sel = selection || (editor as any).selection;
    if (!sel || sel.type !== 'range') return null;
    const dataStore = (editor as any).dataStore;
    if (!dataStore) return null;
    const node = dataStore.getNode(sel.startNodeId);
    if (!node) return null;

    let blockId = sel.startNodeId;
    let current = node;
    const schema = dataStore.getActiveSchema?.();
    while (current?.parentId) {
      const parent = dataStore.getNode(current.parentId);
      if (!parent) break;
      if (schema?.getNodeType?.(parent.stype)?.group === 'block') { blockId = parent.sid ?? current.parentId; break; }
      current = parent;
    }
    const block = dataStore.getNode(blockId);
    if (!block?.parentId) return null;
    const docParent = dataStore.getNode(block.parentId);
    if (!docParent || !Array.isArray(docParent.content)) return null;
    const idx = docParent.content.indexOf(blockId);
    return { parentId: block.parentId, position: idx === -1 ? docParent.content.length : idx + 1 };
  }
}

export function createMediaExtension(): MediaExtension {
  return new MediaExtension();
}
