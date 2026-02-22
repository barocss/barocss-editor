import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, applyMark } from '@barocss/model';

export class MentionExtension implements Extension {
  name = 'mention';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertMention',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; id?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.id) return false;

        const op = applyMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          'mention', { id: payload.id }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createMentionExtension(): MentionExtension {
  return new MentionExtension();
}
