/**
 * Moving what is on a drawing.
 *
 * ## Why this is a command and not a write in the app
 *
 * The same reason every model change here is one: a drag is not the only thing that will ever move
 * a shape — a nudge with the arrow keys, an alignment, a paste that offsets what it puts down — and
 * a product with four writers of one attribute has four places to get the undo entry, the guard and
 * the validation slightly different.
 *
 * ## Why Word has its own, for now
 *
 * The deck's `setBoxGeometry` does more than this: it refuses a locked box, it refuses a size a
 * **variable** owns, and it goes through the deck's own container walk. None of that exists in a
 * page yet — a document has no variables and its canvas has no lock — so this is the honest small
 * version rather than a shared command with half its guards switched off. Unifying them is a real
 * question and it is in `docs/BACKLOG.md`, to be answered when Word has the second half.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { boxOf } from './canvas-box';
import { canvasAt, type CanvasAccess, type CanvasNode } from './canvas-access';

/** What a caller says: which shapes, and how far in the model's own units. */
export interface MoveShapesOptions {
  nodeIds?: unknown;
  dx?: unknown;
  dy?: unknown;
}

const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export class WordCanvasShapeExtension implements Extension {
  name = 'wordCanvasShapes';
  priority = 46;

  onCreate(editor: Editor): void {
    (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
      name: 'moveShapes',
      execute: async (_ed: Editor, payload?: MoveShapesOptions) => await this._move(editor, payload),
      canExecute: (_ed: Editor, payload?: MoveShapesOptions) => this._movable(editor, payload).length > 0
    });
  }

  private _access(editor: Editor): CanvasAccess | null {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => unknown } }).dataStore;
    const rootId = (editor as never as { getRootId?: () => string }).getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) as CanvasNode } as CanvasAccess;
  }

  /**
   * The shapes this may move: the ones named, that exist, and that are **on a canvas**.
   *
   * The last is the guard that matters. A caller passing a paragraph's sid is asking to give a
   * block an `x`, which the schema would take and nothing would draw — a write that reports success
   * and does nothing, which is the failure this repository keeps finding.
   */
  private _movable(editor: Editor, payload?: MoveShapesOptions): string[] {
    const doc = this._access(editor);
    if (!doc) return [];
    const asked = Array.isArray(payload?.nodeIds)
      ? (payload!.nodeIds as unknown[]).filter((one): one is string => typeof one === 'string')
      : [];
    if (asked.length === 0) return [];
    if (number(payload?.dx) === 0 && number(payload?.dy) === 0) return [];
    return asked.filter((sid) => !!doc.getNode(sid) && !!canvasAt(doc, sid));
  }

  private async _move(editor: Editor, payload?: MoveShapesOptions): Promise<boolean> {
    const doc = this._access(editor);
    const moving = this._movable(editor, payload);
    if (!doc || moving.length === 0) return false;

    const dx = Math.round(number(payload?.dx));
    const dy = Math.round(number(payload?.dy));

    /*
     * One transaction for the whole set, because one drag is one gesture: three shapes moved
     * together have to come back together, and a reader who presses undo three times to undo one
     * drag has been given the editor's bookkeeping to do.
     */
    const steps = moving.map((sid) => {
      const box = boxOf(doc.getNode(sid)?.attributes as never);
      return { type: 'setAttrs', payload: { nodeId: sid, attrs: { x: box.x + dx, y: box.y + dy } } };
    });

    return (await transaction(editor, steps as never).commit()).success === true;
  }
}

/** Moving what is on a drawing, as an extension a kit can install. */
export function createWordCanvasShapes(): WordCanvasShapeExtension {
  return new WordCanvasShapeExtension();
}
