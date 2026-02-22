import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, toggleMark } from '@barocss/model';

export interface HighlightExtensionOptions {
  defaultColor?: string;
}

export class HighlightExtension implements Extension {
  name = 'highlight';
  priority = 100;

  private _defaultColor: string;

  constructor(options: HighlightExtensionOptions = {}) {
    this._defaultColor = options.defaultColor ?? '#ffeb3b';
  }

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'toggleHighlight',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const color = payload?.color ?? this._defaultColor;
        const op = toggleMark(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          'highlight',
          { color }
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

export function createHighlightExtension(options?: HighlightExtensionOptions): HighlightExtension {
  return new HighlightExtension(options);
}
