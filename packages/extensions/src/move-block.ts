import { findAncestorNode } from '@barocss/datastore';
import { hasRange } from './guards';
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
        return await this._executeMoveBlockUp(ed, payload?.selection ?? (ed as { selection?: ModelSelection }).selection);
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
      /*
       * The **editor's** selection when the caller did not pass one, which is what the `execute`
       * above does. Reading only `payload.selection` answers no to every caller that asks *can this
       * run right now* before deciding what to send — which is what a toolbar does on every render,
       * and what left both of these in the conformance run's *could not be asked* column. Ten other
       * commands were in the same state; see `heading.ts` for the note.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload) && this._canMove(ed, payload, -1)
    });

    // moveBlockDown command
    (editor as any).registerCommand({
      name: 'moveBlockDown',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeMoveBlockDown(ed, payload?.selection ?? (ed as { selection?: ModelSelection }).selection);
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
      /*
       * The **editor's** selection when the caller did not pass one, which is what the `execute`
       * above does. Reading only `payload.selection` answers no to every caller that asks *can this
       * run right now* before deciding what to send — which is what a toolbar does on every render,
       * and what left both of these in the conformance run's *could not be asked* column. Ten other
       * commands were in the same state; see `heading.ts` for the note.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload) && this._canMove(ed, payload, 1)
    });
  }

  onDestroy(_editor: Editor): void {
    // Add cleanup work here if needed
  }

  /**
   * Whether there is **somewhere to go** — the half the guard did not ask.
   *
   * `hasRange` says a block is held; it does not say the block has a neighbour on that side. The
   * first block on a page pressing 위로 옮기기 ran `moveBlockUp`, moved nothing, and reported
   * success — which is the class `guards.ts` names, one step past the fix its own comment records.
   *
   * A toolbar wants this: the up arrow is grey on the first block in every tool of this kind.
   */
  private _canMove(
    editor: Editor,
    payload: { selection?: ModelSelection } | undefined,
    by: -1 | 1
  ): boolean {
    const selection = payload?.selection ?? (editor as { selection?: ModelSelection }).selection;
    const store = (editor as { dataStore?: any }).dataStore;
    if (!selection || !store) return false;

    const targetNodeId = this._getTargetBlockNodeId(store, selection);
    const parentId = targetNodeId ? store.getNode(targetNodeId)?.parentId : undefined;
    if (!targetNodeId || !parentId) return false;

    const siblings = (store.getNode(parentId)?.content ?? []) as string[];
    const at = siblings.indexOf(targetNodeId);
    return at >= 0 && at + by >= 0 && at + by < siblings.length;
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

