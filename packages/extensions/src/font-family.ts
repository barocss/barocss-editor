import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, applyMark, toggleMark } from '@barocss/model';

export class FontFamilyExtension implements Extension {
  name = 'fontFamily';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'setFontFamily',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; family?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.family) return false;

        const op = applyMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          'fontFamily', { family: payload.family }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      // A value control that cannot go grey is a control that fails silently:
      // with nothing selected there is nothing to set, and answering yes left
      // the dropdown live and inert.
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        return !!selection && selection.type === 'range';
      }
    });

    (editor as any).registerCommand({
      name: 'removeFontFamily',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const op = toggleMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          'fontFamily'
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      // A value control that cannot go grey is a control that fails silently:
      // with nothing selected there is nothing to set, and answering yes left
      // the dropdown live and inert.
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        return !!selection && selection.type === 'range';
      }
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createFontFamilyExtension(): FontFamilyExtension {
  return new FontFamilyExtension();
}
