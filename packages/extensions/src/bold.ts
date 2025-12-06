import { Editor, Extension } from '@barocss/editor-core';
import { TransactionBuilder, TransactionManager } from '@barocss/model';

export interface BoldExtensionOptions {
  enabled?: boolean;
  keyboardShortcut?: string;
}

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

    // Register Bold command
    _editor.registerCommand({
      name: 'toggleBold',
      execute: async (editor: Editor) => {
        return await this._toggleBold(editor);
      },
      canExecute: (editor: Editor) => {
        return this._canToggleBold(editor);
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

  private async _toggleBold(editor: any): Promise<boolean> {
    try {
      const selection = editor.selection;
      console.log('[Bold] toggle:start', {
        selection,
        empty: selection?.empty,
        anchor: selection?.anchor,
        head: selection?.head,
      });
      
      // Create Transaction (using model TransactionManager)
      const tm = new TransactionManager(editor.dataStore);
      const transaction = tm.createBuilder('bold_toggle')
        .setMeta('type', 'bold_toggle')
        .setMeta('selection', selection);
      console.log('[Bold] tm:created', { hasTM: !!tm, builderOps: transaction.getOperations?.().length || 0 });
      console.log('[Bold] transaction:created', {
        meta: transaction.getMetadata?.() || {},
      });
      
      if (selection.empty) {
        // Empty selection: toggle bold mark at current position
        console.log('[Bold] path:position');
        return await this._toggleBoldAtPosition(editor, selection.anchor, transaction);
      } else {
        // Text selection: toggle bold mark on selected text
        console.log('[Bold] path:range');
        return await this._toggleBoldInRange(editor, selection.from, selection.to, transaction);
      }
    } catch (error) {
      console.error('Bold toggle failed:', error);
      return false;
    }
  }

  private _canToggleBold(_editor: any): boolean {
    // TODO: Actual implementation - check if current selection can apply bold
    return true;
  }

  private async _toggleBoldAtPosition(editor: any, position: number, transaction: TransactionBuilder): Promise<boolean> {
    try {
      // Find text node at current position
      const textNode = this._findTextNodeAtPosition(editor, position);
      console.log('[Bold] atPosition:foundTextNode', { position, nodeId: textNode?.sid, type: textNode?.type, textPreview: textNode?.text?.slice?.(0, 20) });
      
      if (!textNode) {
        console.warn('No text node found at position:', position);
        return false;
      }
      
      // Check current bold mark state
      const hasBold = this._hasBoldMark(textNode);
      console.log('[Bold] atPosition:hasBold', { nodeId: textNode.sid, hasBold, marks: textNode.marks });
      
      if (hasBold) {
        // Remove bold mark
        transaction.updateNode(textNode.sid, {
          marks: textNode.marks?.filter((mark: any) => mark.type !== 'bold') || []
        });
        console.log('[Bold] atPosition:enqueue remove bold', { nodeId: textNode.sid });
      } else {
        // Add bold mark
        const boldMark = {
          type: 'bold',
          range: [0, textNode.text?.length || 0],
          attributes: {}
        };
        
        transaction.updateNode(textNode.sid, {
          marks: [...(textNode.marks || []), boldMark]
        });
        console.log('[Bold] atPosition:enqueue add bold', { nodeId: textNode.sid, boldMark });
      }
      
      // Execute Transaction
      console.log('[Bold] atPosition:commit:start');
      return this._executeTransaction(editor, transaction);
    } catch (error) {
      console.error('Toggle bold at position failed:', error);
      return false;
    }
  }

  private async _toggleBoldInRange(editor: any, from: number, to: number, transaction: TransactionBuilder): Promise<boolean> {
    try {
      // Find all text nodes within range
      const textNodes = this._findTextNodesInRange(editor, from, to);
      console.log('[Bold] inRange:foundTextNodes', { from, to, count: textNodes.length, ids: textNodes.map((n: any) => n.sid) });
      
      if (textNodes.length === 0) {
        console.warn('No text nodes found in range:', from, to);
        return false;
      }
      
      // Toggle bold mark on all text nodes
      for (const textNode of textNodes) {
        const hasBold = this._hasBoldMark(textNode);
        console.log('[Bold] inRange:node', { nodeId: textNode.sid, hasBold, marks: textNode.marks });
        
        if (hasBold) {
          // Remove bold mark
          transaction.updateNode(textNode.sid, {
            marks: textNode.marks?.filter((mark: any) => mark.type !== 'bold') || []
          });
          console.log('[Bold] inRange:enqueue remove bold', { nodeId: textNode.sid });
        } else {
          // Add bold mark
          const boldMark = {
            type: 'bold',
            range: [0, textNode.text?.length || 0],
            attributes: {}
          };
          
          transaction.updateNode(textNode.sid, {
            marks: [...(textNode.marks || []), boldMark]
          });
          console.log('[Bold] inRange:enqueue add bold', { nodeId: textNode.sid, boldMark });
        }
      }
      
      // Execute Transaction
      console.log('[Bold] inRange:commit:start');
      return this._executeTransaction(editor, transaction);
    } catch (error) {
      console.error('Toggle bold in range failed:', error);
      return false;
    }
  }

  private _registerKeyboardShortcut(_editor: any): void {
    // TODO: Keyboard shortcut registration logic
    console.log('[Bold] registerShortcut', this._options.keyboardShortcut);
  }

  // Helper methods
  private _findTextNodeAtPosition(editor: any, _position: number): any {
    // TODO: Actual implementation - find text node at position
    // Currently dummy implementation
    const document = editor.document;
    if (document.content && document.content.length > 0) {
      const found = document.content.find((node: any) => node.type === 'text');
      console.log('[Bold] findTextNodeAtPosition:dummy', { returnedId: found?.sid });
      return found;
    }
    return null;
  }

  private _findTextNodesInRange(editor: any, _from: number, _to: number): any[] {
    // TODO: Actual implementation - find all text nodes within range
    // Currently dummy implementation
    const document = editor.document;
    if (document.content && document.content.length > 0) {
      return document.content.filter((node: any) => node.type === 'text');
    }
    return [];
  }

  private _hasBoldMark(node: any): boolean {
    return node.marks?.some((mark: any) => mark.type === 'bold') || false;
  }

  private async _executeTransaction(editor: any, transaction: TransactionBuilder): Promise<boolean> {
    try {
      const ops = transaction.getOperations?.() || [];
      const meta = transaction.getMetadata?.() || {};
      console.log('[Bold] commit:before', { opCount: ops.length, meta });
      const result = await transaction.commit();
      console.log('[Bold] commit:after', { success: result?.success, errors: result?.errors });
      if (result.success) {
        // Add to history
        editor._addToHistory(editor._document);
        console.log('[Bold] history:added');
        return true;
      } else {
        console.error('Transaction failed:', result.errors);
        return false;
      }
    } catch (error) {
      console.error('Transaction execution failed:', error);
      return false;
    }
  }
}

// Convenience function
export function createBoldExtension(options?: BoldExtensionOptions): BoldExtension {
  return new BoldExtension(options);
}

