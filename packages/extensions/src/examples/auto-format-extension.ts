/**
 * Auto-Format Extension Example
 * 
 * Demonstrates how to use onBeforeTransaction to automatically format content.
 * This example converts URLs to links automatically.
 */

import { Extension, Editor } from '@barocss/editor-core';
import type { Transaction, TransactionOperation } from '@barocss/model';

export interface AutoFormatExtensionOptions {
  enabled?: boolean;
  formatUrls?: boolean;
  formatDates?: boolean;
}

export class AutoFormatExtension implements Extension {
  name = 'autoFormat';
  priority = 50; // Medium priority
  
  private _options: AutoFormatExtensionOptions;
  
  constructor(options: AutoFormatExtensionOptions = {}) {
    this._options = {
      enabled: true,
      formatUrls: true,
      formatDates: false,
      ...options
    };
  }
  
  onCreate(editor: Editor): void {
    if (!this._options.enabled) {
      return;
    }
    // Extension is ready
  }
  
  onBeforeTransaction(
    editor: Editor,
    transaction: Transaction
  ): Transaction | null {
    if (!this._options.enabled) {
      return transaction;
    }
    
    const newOps: TransactionOperation[] = [];
    let hasChanges = false;
    
    for (const op of transaction.operations) {
      if (op.type === 'insertText' && this._options.formatUrls) {
        // Auto-format URLs to links
        const text = op.payload?.text || '';
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        
        if (urlMatch) {
          const url = urlMatch[0];
          const urlStart = text.indexOf(url);
          const urlEnd = urlStart + url.length;
          
          // Add text insertion operation
          newOps.push(op);
          
          // Add link mark operation
          newOps.push({
            type: 'addMark',
            payload: {
              nodeId: op.payload?.nodeId,
              mark: {
                type: 'link',
                attrs: { href: url }
              },
              range: [
                (op.payload?.offset || 0) + urlStart,
                (op.payload?.offset || 0) + urlEnd
              ]
            }
          });
          
          hasChanges = true;
          continue;
        }
      }
      
      newOps.push(op);
    }
    
    // Return modified transaction if changed
    if (hasChanges) {
      return {
        ...transaction,
        operations: newOps
      };
    }
    
    return transaction;
  }
  
  onDestroy(_editor: Editor): void {
    // Cleanup if needed
  }
}

// Convenience function
export function createAutoFormatExtension(
  options?: AutoFormatExtensionOptions
): AutoFormatExtension {
  return new AutoFormatExtension(options);
}
