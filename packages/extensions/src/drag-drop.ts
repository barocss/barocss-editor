import { Editor, Extension } from '@barocss/editor-core';
import { transaction, reorderChildren } from '@barocss/model';

/**
 * Moving a block to another place among its siblings — **the model half of a drag.**
 *
 * ## What this was, and why three products installed it and none used it
 *
 * 230 lines, of which 180 drew and listened: a handle and a placeholder built with
 * `document.createElement`, `mousedown` on a container, `mousemove`, `mouseup` and `keydown` bound
 * to `document`, an auto-scroll, and `document.querySelector('[data-bc-layer="content"]')` to find
 * the editor — **one** of them, in a product that draws three boards of the same page at once.
 *
 * The classes it made, `bc-drag-handle` and `bc-drag-placeholder`, were styled by `styles.ts`, whose
 * `injectEditorStyles` was called by the slash menu and by nothing else — so once that stopped
 * drawing its own DOM, the handle appeared unstyled. **No product references either class.** All
 * three install this and all three do their own dragging: the site through its overlay and
 * `moveBlockInto`, the deck through `reorderIndexAt`, Word through its drawing overlay.
 *
 * So three products carried four global pointer listeners for a feature that drew an unstyled box
 * nobody could see. The same layer fault as `FindReplaceExtension` and the slash menu, with one
 * difference that made it harder to notice: **this one was installed.**
 *
 * ## Where a drag actually belongs, measured
 *
 * Three layers, and the hard one is already shared:
 *
 * | | | |
 * | --- | --- | --- |
 * | **where a drop lands** | `reorderIndexAt` in `office-canvas` | the deck **and** the site use it |
 * | **what moves** | `moveBlockToPosition`, `moveBlockInto`, `moveShapes`, `movePage` | by *kind of surface* |
 * | **the pointer and the drawing** | each app's overlay | the app's, and rightly |
 *
 * And the middle row does not divide by product. A **flow** — Word's paragraphs, the site's blocks —
 * is a parent and a place in it. A **canvas** — the deck's boxes, Word's shapes — is coordinates. A
 * **list** — the deck's slides, the site's pages — is an index. Word and the site share the first;
 * the deck and Word's shapes share the second. Three surfaces, not three products.
 *
 * This is the flow's, and it is all that is left here.
 */
export interface DragDropExtensionOptions {
  enabled?: boolean;
}

export class DragDropExtension implements Extension {
  name = 'dragDrop';
  priority = 60;

  private _options: DragDropExtensionOptions;

  constructor(options: DragDropExtensionOptions = {}) {
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
    if (targetIndex == null) return false;
    const held = this._where(editor, blockId);
    return !!held && held.at !== targetIndex;
  }

  private async _moveBlock(editor: Editor, blockId: string, targetIndex: number): Promise<boolean> {
    const held = this._where(editor, blockId);
    if (!held || held.at === targetIndex) return false;

    const order = [...held.order];
    order.splice(held.at, 1);
    order.splice(Math.min(targetIndex, order.length), 0, blockId);

    const result = await transaction(editor, [reorderChildren(held.parentId, order) as never]).commit();
    return result.success;
  }
}

export function createDragDropExtension(options?: DragDropExtensionOptions): DragDropExtension {
  return new DragDropExtension(options);
}
