import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, toggleMark } from '@barocss/model';

export class CodeMarkExtension implements Extension {
  name = 'codeMark';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'toggleCode',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const op = toggleMark(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          'code'
        );
        const result = await transaction(ed, [op]).commit();
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

export function createCodeMarkExtension(): CodeMarkExtension {
  return new CodeMarkExtension();
}
