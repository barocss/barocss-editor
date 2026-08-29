import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, applyMark, toggleMark } from '@barocss/model';
import { hasRange } from './guards';

export class FontSizeExtension implements Extension {
  name = 'fontSize';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'setFontSize',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; size?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.size) return false;

        const op = applyMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          'fontSize', { size: payload.size }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      /*
       * A value control that cannot go grey is a control that fails silently: with nothing selected
       * there is nothing to set, and answering yes left the dropdown live and inert.
       *
       * And a **collapsed** range is the same failure one step in. `applyMark` over zero characters
       * commits and changes nothing, so a caret got a size that reported success and drew nothing —
       * which is the class `guards.ts` was written for, and these two were missed when it was applied
       * to the nine beside them. Found by looking for a surface to put a size control on: the panel
       * would have been live over a caret from its first day.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload, 'something')
    });

    (editor as any).registerCommand({
      name: 'removeFontSize',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const op = toggleMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          'fontSize'
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      /*
       * A value control that cannot go grey is a control that fails silently: with nothing selected
       * there is nothing to set, and answering yes left the dropdown live and inert.
       *
       * And a **collapsed** range is the same failure one step in. `applyMark` over zero characters
       * commits and changes nothing, so a caret got a size that reported success and drew nothing —
       * which is the class `guards.ts` was written for, and these two were missed when it was applied
       * to the nine beside them. Found by looking for a surface to put a size control on: the panel
       * would have been live over a caret from its first day.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload, 'something')
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createFontSizeExtension(): FontSizeExtension {
  return new FontSizeExtension();
}
