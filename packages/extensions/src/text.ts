import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, control, insertText, deleteTextRange } from '@barocss/model';

export interface TextExtensionOptions {
  enabled?: boolean;
}

/**
 * Text Extension - Extension that provides text input functionality
 * 
 * Main features:
 * - Text replacement (insert/delete/replace)
 * - Automatic history management (handled by TransactionManager)
 */
export class TextExtension implements Extension {
  name = 'text';
  priority = 200; // High priority (basic text functionality)
  
  private _options: TextExtensionOptions;

  constructor(options: TextExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // Register replaceText command
    editor.registerCommand({
      name: 'replaceText',
      execute: async (editor: Editor, payload: { 
        range: ModelSelection,
        text: string 
      }) => {
        return await this._executeReplaceText(editor, payload.range, payload.text);
      },
      canExecute: (editor: Editor, payload?: any) => {
        return payload?.range != null && payload?.text != null;
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // Cleanup
  }

  /**
   * Execute text replacement
   * 
   * Command responsibilities:
   * 1. Combine operations (determine if only insert or if replace exists)
   * 2. Execute transaction
   */
  private async _executeReplaceText(
    editor: Editor,
    range: ModelSelection,
    text: string
  ): Promise<boolean> {
    // Only insert case (start === end)
    if (range.startOffset === range.endOffset) {
      const operations = this._buildInsertTextOperations(range, text);
      const result = await transaction(editor, operations).commit();
      return result.success;
    }

    // Replace or delete case
    // Combine multiple operations and execute as single transaction
    const operations = [
      ...this._buildDeleteTextOperations(range),
      ...this._buildInsertTextOperations(
        { ...range, endOffset: range.startOffset },
        text
      )
    ];
    
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * Build insert operations (DSL: insertText(pos, text) inside control)
   */
  private _buildInsertTextOperations(
    range: ModelSelection,
    text: string
  ): ReturnType<typeof control> {
    return control(range.startNodeId, [
      insertText(range.startOffset, text)
    ]);
  }

  /**
   * Build delete operations (DSL: deleteTextRange(start, end) inside control)
   */
  private _buildDeleteTextOperations(range: ModelSelection): ReturnType<typeof control> {
    return control(range.startNodeId, [
      deleteTextRange(range.startOffset, range.endOffset)
    ]);
  }
}

// Convenience function
export function createTextExtension(options?: TextExtensionOptions): TextExtension {
  return new TextExtension(options);
}

