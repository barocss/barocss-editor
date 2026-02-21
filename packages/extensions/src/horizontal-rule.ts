import { Editor, Extension } from '@barocss/editor-core';
import { transaction, insertHorizontalRule as insertHorizontalRuleOp } from '@barocss/model';

export class HorizontalRuleExtension implements Extension {
  name = 'horizontalRule';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertHorizontalRule',
      execute: async (ed: Editor) => {
        const ops = [insertHorizontalRuleOp()];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createHorizontalRuleExtension(): HorizontalRuleExtension {
  return new HorizontalRuleExtension();
}
