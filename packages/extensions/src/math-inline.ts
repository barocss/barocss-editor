import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

export class MathInlineExtension implements Extension {
  name = 'mathInline';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertMathInline',
      execute: async (ed: Editor, payload?: { tex?: string; selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const dataStore = (ed as any).dataStore;
        if (!dataStore) return false;

        const node = dataStore.getNode(selection.startNodeId);
        if (!node) return false;

        const parentId = node.parentId ?? selection.startNodeId;
        const parent = dataStore.getNode(parentId);
        if (!parent || !Array.isArray(parent.content)) return false;

        const tex = payload?.tex ?? '';
        const childIndex = parent.content.indexOf(selection.startNodeId);
        const insertPos = childIndex === -1 ? parent.content.length : childIndex + 1;

        const ops = [
          addChild(parentId, { stype: 'mathInline', attributes: { tex, engine: 'katex' } } as any, insertPos)
        ];

        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createMathInlineExtension(): MathInlineExtension {
  return new MathInlineExtension();
}
