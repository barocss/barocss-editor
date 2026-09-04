import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, control, insertText } from '@barocss/model';
import { deleteRangeOperations } from './range-delete';

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
      canExecute: (_editor: Editor, payload?: any) => {
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
    /**
     * **비었는가는 두 가지를 다 물어야 합니다** — 같은 런인가, 그리고 같은 자리인가.
     *
     * This asked only the offsets. A range from the first paragraph's 2 to the third paragraph's 2 is
     * two paragraphs of text and reads here as *nothing selected* — so a reader typing over three
     * paragraphs got the character **inserted** and nothing removed. Measured with exactly that
     * range, which is not a contrived one: dragging straight down a column of similar lines lands on
     * the same offset constantly.
     */
    if (range.startNodeId === range.endNodeId && range.startOffset === range.endOffset) {
      const operations = this._buildInsertTextOperations(range, text);
      const result = await transaction(editor, operations).commit();
      return result.success;
    }

    // Replace or delete case
    // Combine multiple operations and execute as single transaction
    const operations = [
      ...this._buildDeleteTextOperations(range, editor),
      ...this._buildInsertTextOperations({ ...range, endOffset: range.startOffset }, text)
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
  /**
   * Delete between two points — `range-delete.ts`, because this was **the wrong half of two**.
   *
   * `delete.ts` had a function of the same name that branched on whether the range crossed runs; this
   * one always cut inside the start run. So typing over three paragraphs mangled the first and left
   * the other two untouched, while Backspace over the same three at least got the characters right.
   *
   * Two spellings of one act, and the second was not a smaller version of the first.
   */
  private _buildDeleteTextOperations(range: ModelSelection, editor?: Editor): any[] {
    const ops = deleteRangeOperations(range, editor) as any;
    return Array.isArray(ops) ? ops : [ops];
  }
}

// Convenience function
export function createTextExtension(options?: TextExtensionOptions): TextExtension {
  return new TextExtension(options);
}

