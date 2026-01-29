import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, applyMark } from '@barocss/model';

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
      execute: async (editor: Editor) => {
        return await this._toggleBold(editor);
      },
      canExecute: () => this._canToggleBold(),
    });

    if (this._options.keyboardShortcut) {
      this._registerKeyboardShortcut(_editor);
    }
  }

  onDestroy(_editor: unknown): void {}

  private async _toggleBold(editor: Editor): Promise<boolean> {
    const selection = editor.selection as ModelSelection | null;
    if (!selection || selection.type !== 'range') return false;

    // 범위 전체를 bold로 적용. model의 applyMark(전체 범위) 사용.
    const op = applyMark(
      selection.startNodeId,
      selection.startOffset,
      selection.endNodeId,
      selection.endOffset,
      MARK_TYPE_BOLD
    );
    const result = await transaction(editor, [op]).commit();
    return result.success === true;
  }

  private _canToggleBold(): boolean {
    return true;
  }

  private _registerKeyboardShortcut(_editor: unknown): void {
    // TODO: Keyboard shortcut registration logic
  }
}

export function createBoldExtension(options?: BoldExtensionOptions): BoldExtension {
  return new BoldExtension(options);
}
