import { Editor, Extension } from '@barocss/editor-core';
import { transaction, wrapInBlockquote as wrapInBlockquoteOp } from '@barocss/model';

export class BlockquoteExtension implements Extension {
  name = 'blockquote';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'toggleBlockquote',
      execute: async (ed: Editor) => {
        const ops = [wrapInBlockquoteOp()];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}
