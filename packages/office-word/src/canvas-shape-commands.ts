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
import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { boxOf } from './canvas-box';
import { resizeBox, type Handle } from './canvas-manipulate';
import { canvasAt, type CanvasAccess, type CanvasNode } from './canvas-access';

/** What a caller says: which shapes, and how far in the model's own units. */
export interface MoveShapesOptions {
  nodeIds?: unknown;
  dx?: unknown;
  dy?: unknown;
}

/**
 * A resize, said the way the reader did it: **which handle**, and how far it travelled.
 *
 * Not the finished box. The arithmetic — which edges a handle holds still, what the aspect lock
 * pulls, what resizing from the centre means — is `resizeBox` in the canvas layer, tested in
 * milliseconds, and a command that took the answer would put that arithmetic in whatever drew the
 * handles. Every caller then gets the modifiers right or wrong on its own.
 */
export interface ResizeShapesOptions {
  nodeIds?: unknown;
  handle?: unknown;
  dx?: unknown;
  dy?: unknown;
  /** Shift, in every drawing tool there is. */
  keepAspect?: unknown;
  /** Alt, in every drawing tool there is. */
  fromCentre?: unknown;
}

const HANDLES = new Set<Handle>(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);

const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export class WordCanvasShapeExtension implements Extension {
  name = 'wordCanvasShapes';
  priority = 46;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: Record<string, unknown>) => Promise<boolean>,
      can: (payload?: Record<string, unknown>) => boolean
    ) =>
      (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => await execute(payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      });

    register(
      'moveShapes',
      async (payload) => await this._move(editor, payload as never),
      (payload) => this._movable(editor, payload as never).length > 0
    );

    /**
     * The same handle on **every** shape that is selected, by the same amount.
     *
     * Not a proportional scale of the set: that is a different gesture and this is the one the deck
     * already has, so the two products answer a dragged handle the same way. What it looks like is
     * that each shape's own corner follows the pointer, which is what the reader is pulling.
     */
    register(
      'resizeShapes',
      async (payload) => await this._resize(editor, payload as never),
      (payload) => this._resizable(editor, payload as never).length > 0
    );

    /**
     * Taking them away — every one that is selected, in one transaction.
     *
     * The canvas **stays**. A drawing a reader has put in their document is a thing they made, and
     * clearing it because the last shape went would be the editor deciding they had changed their
     * mind. Word's own drawing canvas behaves the same way.
     */
    register(
      'deleteShapes',
      async (payload) => await this._delete(editor, payload as never),
      // `dx: 1` because the movable guard refuses a move of nothing, and a delete has no distance.
      (payload) => this._movable(editor, { nodeIds: payload?.nodeIds, dx: 1 }).length > 0
    );

    /**
     * **Enter**: keep writing after the drawing.
     *
     * Measured first, and the answer was nothing: with a shape selected, a letter went nowhere and
     * Enter did nothing at all. Safe — the engine refuses a character when the caret has nowhere to
     * go — and dead, because a reader pressing Enter means *give me a line*, which is what it means
     * everywhere else in a document.
     *
     * A page can answer that and a deck cannot, which is why this is Word's: a document is a column
     * of blocks with a line always available after any of them, and a slide has nowhere for a caret
     * to fall out to.
     *
     * Always a **new** paragraph, never "put the caret in whatever is already below". Enter that
     * sometimes made a line and sometimes moved to an existing one would be two gestures wearing one
     * key, and the reader cannot see which they are about to get.
     */
    register(
      'insertParagraphAfterDrawing',
      async () => await this._writeAfter(editor),
      () => !!this._drawingOf(editor)
    );

    /**
     * **Escape**: leave the drawing, without changing the document.
     *
     * The other half of the same need, and the half that must not write: a reader who has finished
     * with a drawing wants the caret back in their text, not an empty paragraph they now have to
     * delete. The caret lands after the drawing, or before it when the drawing is the last thing in
     * the section.
     */
    register(
      'leaveDrawing',
      async () => await this._leave(editor),
      () => !!this._drawingOf(editor)
    );

    /**
     * Whether anything on a drawing is selected, for the key map to ask.
     *
     * The same shape `tableSelected` has, and for the same reason it was needed: with a caret in a
     * paragraph, Delete is a character. Only when what is selected is *shapes* is Delete "take these
     * away", and a binding on "there is a drawing in this document" would eat the reader's text.
     */
    const track = () =>
      (editor as never as { setContext: (name: string, value: boolean) => void }).setContext(
        'shapesSelected',
        this._selected(editor).length > 0
      );
    /*
     * `editor:selection.model` and a content change, which is the pair the table's contexts already
     * use — and the immediate call, because a context nobody has set yet is `undefined` and a key
     * map asking about it before the first selection would answer for the wrong state.
     */
    editor.on('editor:selection.model', track);
    editor.on('editor:selection.change', track);
    editor.on('editor:content.change', track);
    track();
  }

  /** The drawing the selection is on, which is what "after this" is measured from. */
  private _drawingOf(editor: Editor): { canvas: string; parentId: string; at: number } | null {
    const doc = this._access(editor);
    const chosen = this._selected(editor)[0];
    const canvas = doc && chosen ? canvasAt(doc, chosen) : undefined;
    if (!doc || !canvas) return null;

    const parentId = (doc.getNode(canvas) as { parentId?: string } | undefined)?.parentId;
    const parent = parentId ? doc.getNode(parentId) : undefined;
    const at = Array.isArray(parent?.content) ? (parent!.content as unknown[]).indexOf(canvas) : -1;
    if (!parentId || at < 0) return null;
    return { canvas, parentId, at };
  }

  /** The first run inside a block, which is where a caret goes when it lands on one. */
  private _caretIn(doc: CanvasAccess, sid: string | undefined, depth = 0): string | undefined {
    const node = sid ? doc.getNode(sid) : undefined;
    if (!node || depth > 16) return undefined;
    if (node.stype === 'inline-text') return sid;
    for (const child of Array.isArray(node.content) ? (node.content as unknown[]) : []) {
      if (typeof child !== 'string') continue;
      const found = this._caretIn(doc, child, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  /** Put the caret at the start of a run, and let go of the shapes. */
  private _caretTo(editor: Editor, run: string): boolean {
    (editor as never as { updateSelection: (selection: unknown) => void }).updateSelection({
      type: 'range',
      startNodeId: run,
      startOffset: 0,
      endNodeId: run,
      endOffset: 0,
      collapsed: true
    });
    return true;
  }

  private async _writeAfter(editor: Editor): Promise<boolean> {
    const doc = this._access(editor);
    const where = this._drawingOf(editor);
    if (!doc || !where) return false;

    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: where.parentId,
          /*
           * An empty *run* inside it, not an empty paragraph.
           *
           * The caret filler is what gives an empty line its height and it is drawn for an empty
           * `inline-text`; a paragraph with no run at all is zero pixels high, which is a line a
           * reader has just asked for and cannot see or click into. The frame insert learned this
           * the same way.
           */
          child: {
            stype: 'paragraph',
            attributes: {},
            content: [{ stype: 'inline-text', text: '' }]
          },
          position: where.at + 1
        }
      }
    ] as never).commit();
    if (result.success !== true) return false;

    const parent = doc.getNode(where.parentId);
    const made = Array.isArray(parent?.content) ? (parent!.content as string[])[where.at + 1] : undefined;
    const run = this._caretIn(doc, made);
    return run ? this._caretTo(editor, run) : false;
  }

  private async _leave(editor: Editor): Promise<boolean> {
    const doc = this._access(editor);
    const where = this._drawingOf(editor);
    if (!doc || !where) return false;

    const siblings = Array.isArray(doc.getNode(where.parentId)?.content)
      ? (doc.getNode(where.parentId)!.content as string[])
      : [];
    // After it, or before it when the drawing is the last thing in the section.
    const run =
      this._caretIn(doc, siblings[where.at + 1]) ?? this._caretIn(doc, siblings[where.at - 1]);
    if (!run) return false;
    return this._caretTo(editor, run);
  }

  /** The shapes the *selection* names, which is what a key binding acts on. */
  private _selected(editor: Editor): string[] {
    const doc = this._access(editor);
    if (!doc) return [];
    return selectedNodeIds((editor as never as { selection?: never }).selection).filter(
      (sid) => !!doc.getNode(sid) && !!canvasAt(doc, sid)
    );
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
    /*
     * What the caller named, or what is selected.
     *
     * A key binding says "nudge" and nothing else — the selection *is* the payload there — while a
     * drag names exactly what it was holding. Both are the reader's answer to "which shapes", and
     * making the command ask twice would be two lists to keep in step.
     */
    const asked = Array.isArray(payload?.nodeIds)
      ? (payload!.nodeIds as unknown[]).filter((one): one is string => typeof one === 'string')
      : this._selected(editor);
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

  /** The shapes a resize may touch: named or selected, on a canvas, and pulled by a real handle. */
  private _resizable(editor: Editor, payload?: ResizeShapesOptions): string[] {
    if (!HANDLES.has(payload?.handle as Handle)) return [];
    return this._movable(editor, {
      nodeIds: payload?.nodeIds,
      // A resize that travelled nowhere is not one, the same as a move.
      dx: number(payload?.dx),
      dy: number(payload?.dy)
    });
  }

  private async _resize(editor: Editor, payload?: ResizeShapesOptions): Promise<boolean> {
    const doc = this._access(editor);
    const resizing = this._resizable(editor, payload);
    if (!doc || resizing.length === 0) return false;

    const steps = resizing.map((sid) => {
      const next = resizeBox(
        doc.getNode(sid)?.attributes as never,
        payload!.handle as Handle,
        { dx: number(payload?.dx), dy: number(payload?.dy) },
        { keepAspect: payload?.keepAspect === true, fromCentre: payload?.fromCentre === true }
      );
      return {
        type: 'setAttrs',
        payload: {
          nodeId: sid,
          attrs: {
            x: Math.round(next.x),
            y: Math.round(next.y),
            width: Math.round(next.width),
            height: Math.round(next.height)
          }
        }
      };
    });

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  private async _delete(editor: Editor, payload?: { nodeIds?: unknown }): Promise<boolean> {
    const doc = this._access(editor);
    const going = this._movable(editor, { nodeIds: payload?.nodeIds, dx: 1 });
    if (!doc || going.length === 0) return false;

    const steps = going.map((sid) => ({
      type: 'removeChild',
      payload: { parentId: canvasAt(doc, sid), childId: sid }
    }));

    if ((await transaction(editor, steps as never).commit()).success !== true) return false;

    // Nothing is selected once it is gone: leaving the ids selected would leave the outline
    // pointing at nodes the document no longer has.
    (editor as never as { setNode?: (selection: unknown) => void }).setNode?.(null);
    return true;
  }
}

/** Moving what is on a drawing, as an extension a kit can install. */
export function createWordCanvasShapes(): WordCanvasShapeExtension {
  return new WordCanvasShapeExtension();
}
