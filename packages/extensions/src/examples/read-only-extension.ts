/**
 * Read-Only Extension Example
 * 
 * Demonstrates how to use onBeforeTransaction to enforce read-only mode.
 * All transactions are cancelled when read-only mode is enabled.
 */

import { Extension, Editor } from '@barocss/editor-core';
import type { Transaction } from '@barocss/model';

export interface ReadOnlyExtensionOptions {
  enabled?: boolean;
  contextKey?: string;
}

export class ReadOnlyExtension implements Extension {
  name = 'readOnly';
  priority = 10; // High priority (executes first)
  
  private _options: ReadOnlyExtensionOptions;
  
  constructor(options: ReadOnlyExtensionOptions = {}) {
    this._options = {
      enabled: false,
      contextKey: 'readOnly',
      ...options
    };
  }
  
  onCreate(editor: Editor): void {
    if (this._options.enabled) {
      editor.setContext(this._options.contextKey!, true);
    }
  }
  
  onBeforeTransaction(
    editor: Editor,
    transaction: Transaction
  ): Transaction | null {
    // Check if read-only mode is enabled
    const isReadOnly = editor.getContext(this._options.contextKey!);
    
    if (isReadOnly) {
      console.warn('[ReadOnlyExtension] Transaction cancelled: read-only mode is enabled');
      return null; // Cancel transaction
    }
    
    return transaction; // Allow to proceed
  }
  
  /**
   * Enable read-only mode
   */
  enable(editor: Editor): void {
    editor.setContext(this._options.contextKey!, true);
    this._options.enabled = true;
  }
  
  /**
   * Disable read-only mode
   */
  disable(editor: Editor): void {
    editor.setContext(this._options.contextKey!, false);
    this._options.enabled = false;
  }
}

// Convenience function
export function createReadOnlyExtension(
  options?: ReadOnlyExtensionOptions
): ReadOnlyExtension {
  return new ReadOnlyExtension(options);
}
