import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

export class PageBreakExtension implements Extension {
  name = 'pageBreak';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertPageBreak',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const dataStore = (ed as any).dataStore;
        if (!dataStore) return false;

        const startNode = dataStore.getNode(selection.startNodeId);
        if (!startNode) return false;

        let blockId = selection.startNodeId;
        let current = startNode;
        const schema = dataStore.getActiveSchema?.();
        while (current?.parentId) {
          const parent = dataStore.getNode(current.parentId);
          if (!parent) break;
          const parentType = schema?.getNodeType?.(parent.stype);
          if (parentType?.group === 'block') {
            blockId = parent.sid ?? current.parentId;
            break;
          }
          current = parent;
        }

        const blockNode = dataStore.getNode(blockId);
        if (!blockNode?.parentId) return false;

        const docParent = dataStore.getNode(blockNode.parentId);
        if (!docParent || !Array.isArray(docParent.content)) return false;

        const blockIndex = docParent.content.indexOf(blockId);
        const insertPos = blockIndex === -1 ? docParent.content.length : blockIndex + 1;

        const ops = [
          addChild(blockNode.parentId, { stype: 'pageBreak' } as any, insertPos)
        ];

        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createPageBreakExtension(): PageBreakExtension {
  return new PageBreakExtension();
}
