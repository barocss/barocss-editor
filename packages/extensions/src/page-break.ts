import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
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
            /*
       * A **range**, which is what the run has always required and this did not say.
       *
       * `canExecute: () => true` beside an execute whose first line is
       * `if (!selection || selection.type !== 'range') return false`. Over a held box or with
       * nothing selected the control lights up, the reader presses it, and the refusal goes to a
       * console nobody is watching — the class `guards.ts` names, and the one a **builder** meets
       * most, because a deck and a page builder spend their time with a node selected rather than a
       * caret.
       *
       * Invisible until the probe was given the two states a builder has. It had only ever put a
       * caret in a run, where every one of these works.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload)
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createPageBreakExtension(): PageBreakExtension {
  return new PageBreakExtension();
}
