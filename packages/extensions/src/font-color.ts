import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, applyMark, removeMark } from '@barocss/model';
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

        return removeColor(ed, selection, 'fontColor');
      },
      // A colour covers the text between two points; on a caret it is a commit that changes
      // nothing. See `guards.ts` — this was `() => true` and the command asked for a range.
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) =>
        hasRange(ed, payload, 'something') && canRemoveColor(ed, payload?.selection || (ed as any).selection, 'fontColor')
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

        return removeColor(ed, selection, 'bgColor');
      },
      // A colour covers the text between two points; on a caret it is a commit that changes
      // nothing. See `guards.ts` — this was `() => true` and the command asked for a range.
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) =>
        hasRange(ed, payload, 'something') && canRemoveColor(ed, payload?.selection || (ed as any).selection, 'bgColor')
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createFontColorExtension(): FontColorExtension {
  return new FontColorExtension();
}

/** Reset one color channel without toggling it on in uncolored parts of a mixed selection. */
async function removeColor(editor: Editor, selection: ModelSelection, mark: string): Promise<boolean> {
  const operations = colorRemovalOperations(editor, selection, mark);
  if (!operations.length) return false;
  return (await transaction(editor, operations).commit()).success;
}

function canRemoveColor(editor: Editor, selection: ModelSelection | undefined, mark: string): boolean {
  return !!selection && selection.type === 'range' && colorRemovalOperations(editor, selection, mark).length > 0;
}

function colorRemovalOperations(editor: Editor, selection: ModelSelection, mark: string) {
  const ids = selection.startNodeId === selection.endNodeId ? [selection.startNodeId]
    : [...editor.dataStore.createRangeIterator(selection.startNodeId, selection.endNodeId, { includeStart: true, includeEnd: true })];
  return ids.flatMap(id => {
    const node = editor.dataStore.getNode(id);
    if (typeof node?.text !== 'string') return [];
    const start = id === selection.startNodeId ? selection.startOffset : 0;
    const end = id === selection.endNodeId ? selection.endOffset : node.text.length;
    const overlaps = node.marks?.some(item => item.stype === mark && item.range && item.range[1] > start && item.range[0] < end);
    return start < end && overlaps ? [removeMark(id, mark, [start, end])] : [];
  });
}
