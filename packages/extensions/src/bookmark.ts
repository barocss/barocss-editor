import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

export class BookmarkExtension implements Extension {
  name = 'bookmark';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertBookmark',
      execute: async (ed: Editor, payload?: { id?: string; selection?: ModelSelection }) => {
        if (!payload?.id) return false;
        const sel = payload?.selection || (ed as any).selection;
        if (!sel || sel.type !== 'range') return false;

        const dataStore = (ed as any).dataStore;
        if (!dataStore) return false;

        const node = dataStore.getNode(sel.startNodeId);
        if (!node) return false;

        const parentId = node.parentId ?? sel.startNodeId;
        const parent = dataStore.getNode(parentId);
        if (!parent || !Array.isArray(parent.content)) return false;

        const childIndex = parent.content.indexOf(sel.startNodeId);
        const insertPos = childIndex === -1 ? parent.content.length : childIndex + 1;

        const ops = [
          addChild(parentId, { stype: 'bookmarkAnchor', attributes: { id: payload.id } } as any, insertPos)
        ];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createBookmarkExtension(): BookmarkExtension {
  return new BookmarkExtension();
}
