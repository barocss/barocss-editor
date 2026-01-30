import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, applyMark } from '@barocss/model';

export interface ItalicExtensionOptions {
  enabled?: boolean;
  keyboardShortcut?: string;
}

const MARK_TYPE_ITALIC = 'italic';

export class ItalicExtension implements Extension {
  name = 'italic';
  priority = 100;

  private _options: ItalicExtensionOptions;

  constructor(options: ItalicExtensionOptions = {}) {
    this._options = {
      enabled: true,
      keyboardShortcut: 'Mod+i',
      ...options
    };
  }

  onCreate(_editor: Editor): void {
    if (!this._options.enabled) return;

    _editor.registerCommand({
      name: 'toggleItalic',
      execute: async (editor: Editor) => {
        return await this._toggleItalic(editor);
      },
      canExecute: () => this._canToggleItalic(),
    });

    if (this._options.keyboardShortcut) {
      this._registerKeyboardShortcut(_editor);
    }
  }

  onDestroy(_editor: Editor): void {}

  private async _toggleItalic(editor: Editor): Promise<boolean> {
    const selection = editor.selection as ModelSelection | null;
    if (!selection || selection.type !== 'range') return false;

    const op = applyMark(
      selection.startNodeId,
      selection.startOffset,
      selection.endNodeId,
      selection.endOffset,
      MARK_TYPE_ITALIC
    );
    const result = await transaction(editor, [op]).commit();
    return result.success === true;
  }

  private _canToggleItalic(): boolean {
    return true;
  }

  private _registerKeyboardShortcut(_editor: Editor): void {
    // TODO: Keyboard shortcut registration logic
  }
}

export function createItalicExtension(options?: ItalicExtensionOptions): ItalicExtension {
  return new ItalicExtension(options);
}
