import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
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

export function createMathInlineExtension(): MathInlineExtension {
  return new MathInlineExtension();
}
