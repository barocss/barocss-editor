import { findAncestorNode } from '@barocss/datastore';
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
      /**
       * A **range**, which is what `execute` has always required and this did not say.
       *
       * Measured in the site builder by pressing every menu entry: with a block selected the entry
       * lit up, ran, and did nothing — `_executeMoveBlockUp` returns false for anything that is not
       * a range and says so only to a console nobody is watching. A `canExecute` looser than its
       * `execute` is worse than one that is wrong, because the product looks like it works.
       *
       * The harness cannot see this class of fault: it asks whether a command is *reachable*, never
       * whether it is telling the truth about when it can run.
       */
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return payload?.selection?.type === 'range';
      }
    });

    // moveBlockDown command
    (editor as any).registerCommand({
      name: 'moveBlockDown',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeMoveBlockDown(ed, payload?.selection);
      },
      /**
       * A **range**, which is what `execute` has always required and this did not say.
       *
       * Measured in the site builder by pressing every menu entry: with a block selected the entry
       * lit up, ran, and did nothing — `_executeMoveBlockUp` returns false for anything that is not
       * a range and says so only to a console nobody is watching. A `canExecute` looser than its
       * `execute` is worse than one that is wrong, because the product looks like it works.
       *
       * The harness cannot see this class of fault: it asks whether a command is *reachable*, never
       * whether it is telling the truth about when it can run.
       */
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return payload?.selection?.type === 'range';
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

    // Find parent block node of startNode (cycle-safe walk)
    const block = findAncestorNode(
      (id: string) => dataStore.getNode(id),
      startNode.sid!,
      (n: any) => schema?.getNodeType(n.stype)?.group === 'block'
    );
    return block?.sid ?? null;
  }
}

// Convenience function
export function createMoveBlockExtension(options?: MoveBlockExtensionOptions): MoveBlockExtension {
  return new MoveBlockExtension(options);
}

