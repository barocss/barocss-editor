import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, moveBlockUp, moveBlockDown } from '@barocss/model';

export interface MoveBlockExtensionOptions {
  enabled?: boolean;
}

/**
 * MoveBlockExtension
 *
 * - Provides `moveBlockUp`, `moveBlockDown` commands.
 * - Moves currently selected block node up/down within the same parent.
 */
export class MoveBlockExtension implements Extension {
  name = 'moveBlock';
  priority = 100;

  private _options: MoveBlockExtensionOptions;

  constructor(options: MoveBlockExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // moveBlockUp command
    (editor as any).registerCommand({
      name: 'moveBlockUp',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeMoveBlockUp(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection;
      }
    });

    // moveBlockDown command
    (editor as any).registerCommand({
      name: 'moveBlockDown',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeMoveBlockDown(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection;
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // Add cleanup work here if needed
  }

  private async _executeMoveBlockUp(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[MoveBlockExtension] dataStore not found');
      return false;
    }

    // Find current block node
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      console.warn('[MoveBlockExtension] No target block node found');
      return false;
    }

    // Use moveBlockUp operation
    const ops = [
      ...control(targetNodeId, [
        moveBlockUp()
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  private async _executeMoveBlockDown(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[MoveBlockExtension] dataStore not found');
      return false;
    }

    // Find current block node
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      console.warn('[MoveBlockExtension] No target block node found');
      return false;
    }

    // Use moveBlockDown operation
    const ops = [
      ...control(targetNodeId, [
        moveBlockDown()
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
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
}

// Convenience function
export function createMoveBlockExtension(options?: MoveBlockExtensionOptions): MoveBlockExtension {
  return new MoveBlockExtension(options);
}

