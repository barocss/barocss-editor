import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
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

export function createMentionExtension(): MentionExtension {
  return new MentionExtension();
}
