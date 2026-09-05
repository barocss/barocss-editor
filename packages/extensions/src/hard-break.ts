import { holdsText } from '@barocss/shared';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild, splitTextNode } from '@barocss/model';

export class HardBreakExtension implements Extension {
  name = 'hardBreak';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertHardBreak',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const dataStore = (ed as any).dataStore;
        if (!dataStore) return false;

        const node = dataStore.getNode(selection.startNodeId);
        if (!holdsText(node)) return false;

        const parentId = node.parentId;
        if (!parentId) return false;

        const parent = dataStore.getNode(parentId);
        if (!parent || !Array.isArray(parent.content)) return false;

        const childIndex = parent.content.indexOf(selection.startNodeId);
        if (childIndex === -1) return false;

        const ops: any[] = [];

        if (selection.startOffset > 0 && selection.startOffset < (node.text?.length ?? 0)) {
          ops.push(splitTextNode(selection.startNodeId, selection.startOffset));
        }

        const insertPos = selection.startOffset === 0 ? childIndex : childIndex + 1;
        ops.push(addChild(parentId, { stype: 'hardBreak' } as any, insertPos));

        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        const sel = payload?.selection || (_ed as any).selection;
        return !!sel && sel.type === 'range';
      }
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createHardBreakExtension(): HardBreakExtension {
  return new HardBreakExtension();
}
