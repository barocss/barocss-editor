import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, toggleMark } from '@barocss/model';

export interface BoldExtensionOptions {
  enabled?: boolean;
  keyboardShortcut?: string;
}

const MARK_TYPE_BOLD = 'bold';

export class BoldExtension implements Extension {
  name = 'bold';
  priority = 100;

  private _options: BoldExtensionOptions;

  constructor(options: BoldExtensionOptions = {}) {
    this._options = {
      enabled: true,
      keyboardShortcut: 'Mod+b',
      ...options
    };
  }

  onCreate(_editor: Editor): void {
    if (!this._options.enabled) return;

    _editor.registerCommand({
      name: 'toggleBold',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._toggleBold(editor, payload?.selection ?? editor.selection);
      },
      // A toggle with nothing selected has nothing to toggle. It used to answer
      // yes to everything, which left the toolbar button enabled at all times
      // and doing nothing when pressed — the failure is silent, which is the
      // worst kind for a control that looks like it worked.
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection ?? _ed.selection;
        return !!selection && selection.type === 'range';
      }
    });

    if (this._options.keyboardShortcut) {
      this._registerKeyboardShortcut(_editor);
    }
  }

  onDestroy(_editor: unknown): void {}

  private async _toggleBold(
    editor: Editor,
    selection: ModelSelection | null | undefined
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') return false;

    // Toggles rather than applies. It applied unconditionally before, so bold
    // could be turned on and never off: pressing Mod+B on bold text left it
    // bold, and the toolbar button — drawn as pressed, announced as pressed —
    // did nothing when pressed again.
    const op = toggleMark(
      selection.startNodeId,
      selection.startOffset,
      selection.endNodeId,
      selection.endOffset,
      MARK_TYPE_BOLD
    );
    const result = await transaction(editor, [op]).commit();
    return result.success === true;
  }

  private _registerKeyboardShortcut(_editor: unknown): void {
    // Keyboard shortcut registration is handled by default keybindings in editor-core.
  }
}

export function createBoldExtension(options?: BoldExtensionOptions): BoldExtension {
  return new BoldExtension(options);
}
