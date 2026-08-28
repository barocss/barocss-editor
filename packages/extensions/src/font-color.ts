import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, applyMark, toggleMark } from '@barocss/model';
import { hasRange } from './guards';

export class FontColorExtension implements Extension {
  name = 'fontColor';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'setFontColor',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.color) return false;

        const op = applyMark(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          'fontColor',
          { color: payload.color }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      // A colour covers the text between two points; on a caret it is a commit that changes
      // nothing. See `guards.ts` — this was `() => true` and the command asked for a range.
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) =>
        hasRange(ed, payload, 'something')
    });

    (editor as any).registerCommand({
      name: 'removeFontColor',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const op = toggleMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          'fontColor'
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      // A colour covers the text between two points; on a caret it is a commit that changes
      // nothing. See `guards.ts` — this was `() => true` and the command asked for a range.
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) =>
        hasRange(ed, payload, 'something')
    });

    (editor as any).registerCommand({
      name: 'setBgColor',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.color) return false;

        /*
         * `bgColor`, which is what the **schema declares** — this wrote `color`.
         *
         * Measured: the command committed, reported success and painted nothing, because every
         * reader of this mark asks for the attribute by name — `attributes.bgColor` in the two apps
         * that draw it, `attrs.bgColor` in Word's format resolution. A mark whose attribute nobody
         * can find is a mark that is not there, and the command said `true` the whole time.
         *
         * The test beside it asked only which *mark type* was written, which is how it survived.
         */
        const op = applyMark(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          'bgColor',
          { bgColor: payload.color }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      // A colour covers the text between two points; on a caret it is a commit that changes
      // nothing. See `guards.ts` — this was `() => true` and the command asked for a range.
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) =>
        hasRange(ed, payload, 'something')
    });

    (editor as any).registerCommand({
      name: 'removeBgColor',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const op = toggleMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          'bgColor'
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      // A colour covers the text between two points; on a caret it is a commit that changes
      // nothing. See `guards.ts` — this was `() => true` and the command asked for a range.
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) =>
        hasRange(ed, payload, 'something')
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createFontColorExtension(): FontColorExtension {
  return new FontColorExtension();
}
