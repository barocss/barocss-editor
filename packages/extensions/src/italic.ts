import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, toggleMark } from '@barocss/model';

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
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._toggleItalic(editor, payload?.selection ?? editor.selection);
      },
      // Nothing selected is nothing to toggle. Answering yes regardless left the
      // toolbar button enabled always and silent when pressed.
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection ?? _ed.selection;
        return !!selection && selection.type === 'range';
      }
    });

    if (this._options.keyboardShortcut) {
      this._registerKeyboardShortcut(_editor);
    }
  }

  onDestroy(_editor: Editor): void {}

  private async _toggleItalic(
    editor: Editor,
    selection: ModelSelection | null | undefined
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') return false;

    // Toggles rather than applies: it could be turned on and never off.
    const op = toggleMark(
      selection.startNodeId,
      selection.startOffset,
      selection.endNodeId,
      selection.endOffset,
      MARK_TYPE_ITALIC
    );
    const result = await transaction(editor, [op]).commit();
    return result.success === true;
  }

  private _registerKeyboardShortcut(_editor: Editor): void {
    // Keyboard shortcut registration is handled by default keybindings in editor-core.
  }
}

export function createItalicExtension(options?: ItalicExtensionOptions): ItalicExtension {
  return new ItalicExtension(options);
}
