import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, transformNode } from '@barocss/model';

export interface HeadingExtensionOptions {
  enabled?: boolean;
  levels?: number[];
  keyboardShortcuts?: Record<number, string>;
}

export class HeadingExtension implements Extension {
  name = 'heading';
  priority = 100;
  
  private _options: HeadingExtensionOptions;

  constructor(options: HeadingExtensionOptions = {}) {
    this._options = {
      enabled: true,
      levels: [1, 2, 3, 4, 5, 6],
      keyboardShortcuts: {
        1: 'Mod+Alt+1',
        2: 'Mod+Alt+2',
        3: 'Mod+Alt+3'
      },
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // Register commands for each heading level
    this._options.levels?.forEach(level => {
      (editor as any).registerCommand({
        name: `setHeading${level}`,
        execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
          return await this._executeSetHeading(ed, level, payload?.selection);
        },
        canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
          return !!payload?.selection && this._canSetHeading(_ed, level);
        }
      });
    });

    // General heading setting command
    (editor as any).registerCommand({
      name: 'setHeading',
      execute: async (ed: Editor, payload?: { level?: number; selection?: ModelSelection }) => {
        const level = payload?.level;
        if (typeof level !== 'number') {
          return false;
        }
        return await this._executeSetHeading(ed, level, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { level?: number; selection?: ModelSelection }) => {
        const level = payload?.level;
        return typeof level === 'number' && !!payload?.selection && this._canSetHeading(_ed, level);
      }
    });

    // Remove heading command
    (editor as any).registerCommand({
      name: 'removeHeading',
      execute: (ed: Editor) => {
        return this._removeHeading(ed);
      },
      canExecute: (_ed: Editor) => {
        return this._canRemoveHeading(_ed);
      }
    });

    // Register keyboard shortcuts
    if (this._options.keyboardShortcuts) {
      this._registerKeyboardShortcuts(editor);
    }
  }

  onDestroy(_editor: any): void {
    // Cleanup work
  }

  private async _executeSetHeading(
    editor: Editor,
    level: number,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[HeadingExtension] dataStore not found');
      return false;
    }

    // Find current block node (parent block node of startNodeId)
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      console.warn('[HeadingExtension] No target block node found');
      return false;
    }

    const targetNode = dataStore.getNode(targetNodeId);
    if (!targetNode) {
      return false;
    }

    // No-op if already same type
    if (targetNode.stype === 'heading' && targetNode.attributes?.level === level) {
      return true;
    }

    // Use transformNode operation
    const ops = [
      ...control(targetNodeId, [
        transformNode('heading', { level })
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  private _canSetHeading(_editor: Editor, level: number): boolean {
    return this._options.levels?.includes(level) || false;
  }

  private _canRemoveHeading(_editor: any): boolean {
    // TODO: Actual implementation - check if heading can be removed from current selection
    return true;
  }

  /**
   * Finds target block node ID from selection
   * - Range Selection: parent block node of startNodeId
   */
  private _getTargetBlockNodeId(dataStore: any, selection: ModelSelection): string | null {
    if (selection.type !== 'range') {
      return null;
    }

    const startNode = dataStore.getNode(selection.startNodeId);
    if (!startNode) return null;

    const schema = dataStore.getActiveSchema();
    if (schema) {
      const nodeType = schema.getNodeType(startNode.stype);
      // Use startNode as is if it's a block
      if (nodeType?.group === 'block') {
        return startNode.sid!;
      }
    }

    // Find parent block node of startNode
    let current = startNode;
    while (current && current.parentId) {
      const parent = dataStore.getNode(current.parentId);
      if (!parent) break;

      const parentType = schema?.getNodeType(parent.stype);
      if (parentType?.group === 'block') {
        return parent.sid!;
      }

      current = parent;
    }

    return null;
  }

  private _removeHeading(editor: any): boolean {
    try {
      const selection = editor.selection;
      
      if (selection.empty) {
        return this._removeHeadingAtPosition(editor, selection.anchor);
      } else {
        return this._removeHeadingInRange(editor, selection.from, selection.to);
      }
    } catch (error) {
      console.error('Remove heading failed:', error);
      return false;
    }
  }

  private _removeHeadingAtPosition(_editor: any, position: number): boolean {
    // TODO: Actual implementation - remove heading at specific position
    console.log('Remove heading at position:', position);
    return true;
  }

  private _removeHeadingInRange(_editor: any, from: number, to: number): boolean {
    // TODO: Actual implementation - remove heading in range
    console.log('Remove heading in range:', from, to);
    return true;
  }

  private _registerKeyboardShortcuts(editor: Editor): void {
    // Keyboard shortcuts are handled by default keybindings, so do nothing here
    // Mod+Alt+1/2/3 are already registered in default keybindings
  }
}

// Convenience function
export function createHeadingExtension(options?: HeadingExtensionOptions): HeadingExtension {
  return new HeadingExtension(options);
}

