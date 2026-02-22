import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, toggleMark, applyMark } from '@barocss/model';

/**
 * TextFormattingExtension — aggregates less-common text-style marks:
 * smallCaps, kbd, spoiler, letterSpacing, wordSpacing, lineHeight,
 * textShadow, border, spanLang
 */
export class TextFormattingExtension implements Extension {
  name = 'textFormatting';
  priority = 100;

  onCreate(editor: Editor): void {
    this._registerToggle(editor, 'toggleSmallCaps', 'smallCaps');
    this._registerToggle(editor, 'toggleKbd', 'kbd');
    this._registerToggle(editor, 'toggleSpoiler', 'spoiler');

    this._registerApply(editor, 'setLetterSpacing', 'letterSpacing', 'spacing');
    this._registerApply(editor, 'setWordSpacing', 'wordSpacing', 'spacing');
    this._registerApply(editor, 'setLineHeight', 'lineHeight', 'height');
    this._registerApply(editor, 'setTextShadow', 'textShadow', 'shadow');

    this._registerApplyMulti(editor, 'setBorder', 'border', ['style', 'width', 'color']);
    this._registerApplyMulti(editor, 'setSpanLang', 'spanLang', ['lang', 'dir']);
  }

  onDestroy(_editor: Editor): void {}

  private _registerToggle(editor: Editor, cmdName: string, markType: string): void {
    (editor as any).registerCommand({
      name: cmdName,
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const op = toggleMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          markType
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

  private _registerApply(editor: Editor, cmdName: string, markType: string, attrKey: string): void {
    (editor as any).registerCommand({
      name: cmdName,
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; value?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.value) return false;

        const op = applyMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          markType, { [attrKey]: payload.value }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  private _registerApplyMulti(editor: Editor, cmdName: string, markType: string, attrKeys: string[]): void {
    (editor as any).registerCommand({
      name: cmdName,
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; attrs?: Record<string, string> }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.attrs) return false;

        const filtered: Record<string, string> = {};
        for (const key of attrKeys) {
          if (payload.attrs[key] !== undefined) filtered[key] = payload.attrs[key];
        }
        if (Object.keys(filtered).length === 0) return false;

        const op = applyMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          markType, filtered
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }
}

export function createTextFormattingExtension(): TextFormattingExtension {
  return new TextFormattingExtension();
}
