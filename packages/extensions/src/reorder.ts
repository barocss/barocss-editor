import { Editor, Extension } from '@barocss/editor-core';
import { gapBeforeRemoval } from '@barocss/model';
import { transferNodes } from './fragment-drag';

/** Product overlays own pointer geometry. This extension moves a block to a sibling slot. */
export interface ReorderExtensionOptions {
  enabled?: boolean;
}

/** Reordering uses the same schema policy, atomic application and undo as fragment DND. */
export class ReorderExtension implements Extension {
  name = 'reorder';
  priority = 60;

  private _options: ReorderExtensionOptions;

  constructor(options: ReorderExtensionOptions = {}) {
    this._options = { enabled: true, ...options };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
      name: 'moveBlockToPosition',
      execute: async (ed: Editor, payload?: { blockId?: string; targetIndex?: number }) => {
        if (!payload?.blockId || payload.targetIndex == null) return false;
        return await this._moveBlock(ed, payload.blockId, payload.targetIndex);
      },
      /**
       * A block that is **there**, and a place that is **not where it already is**.
       *
       * `!!payload.blockId` was the whole guard — a claim about the payload rather than about the
       * document, so an id naming nothing passed it, and so did a move to the index the block
       * already occupies. Both make the run return `false` and say so to nobody.
       *
       * The second half is the one a reader meets: an up arrow on the first block of a page.
       */
      canExecute: (ed: Editor, payload?: { blockId?: string; targetIndex?: number }) =>
        this._movable(ed, payload?.blockId, payload?.targetIndex)
    });
  }

  onDestroy(_editor: Editor): void {}

  /** Where the block is now, when it is somewhere — the one lookup the guard and the run share. */
  private _where(
    editor: Editor,
    blockId: string | undefined
  ): { parentId: string; order: string[]; at: number } | null {
    if (!blockId) return null;
    const store = editor.dataStore;
    const parentId = store?.getNode(blockId)?.parentId as string | undefined;
    if (!store || !parentId) return null;

    const order = (store.getNode(parentId)?.content ?? []) as string[];
    const at = Array.isArray(order) ? order.indexOf(blockId) : -1;
    return at >= 0 ? { parentId, order, at } : null;
  }

  private _movable(editor: Editor, blockId: string | undefined, targetIndex: number | undefined): boolean {
    if (targetIndex == null || !Number.isInteger(targetIndex) || targetIndex < 0 || !editor.isEditable) return false;
    const held = this._where(editor, blockId);
    return !!held && held.at !== targetIndex;
  }

  private async _moveBlock(editor: Editor, blockId: string, targetIndex: number): Promise<boolean> {
    const held = this._where(editor, blockId);
    if (!held || !this._movable(editor, blockId, targetIndex)) return false;
    return transferNodes(editor, { nodeIds: [blockId], target: {
      kind: 'children', parentId: held.parentId, index: gapBeforeRemoval(held.order, [blockId], Math.min(targetIndex, held.order.length - 1))
    } });
  }
}

export function createReorderExtension(options?: ReorderExtensionOptions): ReorderExtension {
  return new ReorderExtension(options);
}
