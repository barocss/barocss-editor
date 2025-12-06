import { Editor, Extension } from '@barocss/editor-core';

export interface EscapeExtensionOptions {
  enabled?: boolean;
}

/**
 * EscapeExtension
 *
 * - Provides `escape` command.
 * - Clears selection if present, otherwise removes focus
 */
export class EscapeExtension implements Extension {
  name = 'escape';
  priority = 100;

  private _options: EscapeExtensionOptions;

  constructor(options: EscapeExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // Register escape command
    (editor as any).registerCommand({
      name: 'escape',
      execute: (ed: Editor) => {
        return this._executeEscape(ed);
      },
      canExecute: () => {
        return true;
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // Add cleanup work here if needed
  }

  private _executeEscape(editor: Editor): boolean {
    const selection = editor.selection;
    
    // Clear selection if present
    if (selection && !this._isSelectionEmpty(selection)) {
      editor.clearSelection();
      return true;
    }
    
    // Emit blur request event if no selection (handled by EditorViewDOM)
    editor.emit('editor:blur.request', {});
    return true;
  }

  private _isSelectionEmpty(selection: any): boolean {
    if (!selection) return true;
    
    if (selection.type === 'range') {
      return selection.collapsed || 
             (selection.startNodeId === selection.endNodeId && 
              selection.startOffset === selection.endOffset);
    }
    
    return false;
  }
}

// Convenience function
export function createEscapeExtension(options?: EscapeExtensionOptions): EscapeExtension {
  return new EscapeExtension(options);
}

