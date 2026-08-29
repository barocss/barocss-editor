import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, wrapInBlockquote as wrapInBlockquoteOp } from '@barocss/model';
import { hasRange } from './guards';
import { liftOutOf, wrapperAround } from './lift';

export class BlockquoteExtension implements Extension {
  name = 'blockquote';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'toggleBlockquote',
      /**
       * **Toggle**, which is what it is called and was half of what it did.
       *
       * `wrapInBlockquote`, and nothing else — so a paragraph became a quotation the first time and
       * stayed one for ever. Pressing 인용 again ran the command, wrapped nothing, reported success
       * and changed nothing, and there was no way back out but undo.
       *
       * Found by asking whether a toggle is its own inverse: every mark toggle here is, and the
       * three block ones were not. See `lift.ts`, which is the half all three were missing.
       */
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const at = payload?.selection ?? (ed as { selection?: ModelSelection }).selection;
        const inside = at?.type === 'range' ? wrapperAround(ed, at.startNodeId, 'blockQuote') : undefined;

        // A quotation holds its blocks directly, so there is no level to go through.
        const ops = inside ? liftOutOf(ed, inside.sid) : [wrapInBlockquoteOp()];
        if (!ops) return false;

        const result = await transaction(ed, ops as never, { applySelectionToView: true }).commit();
        return result.success;
      },
      /*
       * A range, rather than `() => true`: `wrapInBlockquote` reads the selection and refuses
       * without one, so with a node held this lit up, ran and did nothing. A caret is enough — a
       * quotation is made of the block the caret is in.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
    });
  }

  onDestroy(_editor: Editor): void {}
}
