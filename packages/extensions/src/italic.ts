import { Extension } from '@barocss/editor-core';

export interface ItalicExtensionOptions {
  enabled?: boolean;
  keyboardShortcut?: string;
}

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

  onCreate(_editor: any): void {
    if (!this._options.enabled) return;

    // Register Italic command
    _editor.registerCommand({
      name: 'toggleItalic',
      execute: (editor: any) => {
        return this._toggleItalic(editor);
      },
      canExecute: (editor: any) => {
        return this._canToggleItalic(editor);
      }
    });

    // Register keyboard shortcut
    if (this._options.keyboardShortcut) {
      this._registerKeyboardShortcut(_editor);
    }
  }

  onDestroy(_editor: any): void {
    // Cleanup
  }

  private _toggleItalic(editor: any): boolean {
    try {
      const selection = editor.selection;
      
      if (selection.empty) {
        // Empty selection: toggle italic mark at current position
        return this._toggleItalicAtPosition(editor, selection.anchor);
      } else {
        // Text selection: toggle italic mark on selected text
        return this._toggleItalicInRange(editor, selection.from, selection.to);
      }
    } catch (error) {
      console.error('Italic toggle failed:', error);
      return false;
    }
  }

  private _canToggleItalic(_editor: any): boolean {
    // TODO: Actual implementation - check if current selection can apply italic
    return true;
  }

  private _toggleItalicAtPosition(_editor: any, position: number): boolean {
    // TODO: Actual implementation - toggle italic mark at specific position
    console.log('Toggle italic at position:', position);
    return true;
  }

  private _toggleItalicInRange(_editor: any, from: number, to: number): boolean {
    // TODO: Actual implementation - toggle italic mark in range
    console.log('Toggle italic in range:', from, to);
    return true;
  }

  private _registerKeyboardShortcut(_editor: any): void {
    // TODO: Keyboard shortcut registration logic
    console.log('Register italic keyboard shortcut:', this._options.keyboardShortcut);
  }
}

// Convenience function
export function createItalicExtension(options?: ItalicExtensionOptions): ItalicExtension {
  return new ItalicExtension(options);
}

