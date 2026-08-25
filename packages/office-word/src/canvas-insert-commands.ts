/**
 * Putting a **drawing** into a page, and shapes onto the drawing.
 *
 * ## What was missing, measured
 *
 * Word's canvas was declared, drawn, arranged and paginated and no command made one: `canvasBlock`
 * holds `scene*`, the renderers draw it as an `<svg>`, `canvas-layout` arranges a frame inside it,
 * the paginator measures it like any other block — and the only block object a reader could create
 * was a frame. A whole half of the schema that a reader could not reach, which is the failure this
 * repository keeps finding in its own code.
 *
 * ## The gesture is "insert a shape", not "insert a canvas"
 *
 * A reader who wants a rectangle in their document means *a rectangle in their document*; the
 * canvas is where it has to live, not something they asked for. So each shape command puts the
 * shape on the canvas the reader is standing on and **makes one if there is none** — one press, one
 * undo, something on the page.
 *
 * `insertDrawing` exists beside them for the reader who wants the surface first — an empty canvas
 * to arrange several things in — and because a command that makes a `canvasBlock` is what lets the
 * conformance check say which node each insert produces.
 *
 * ## Where "here" is
 *
 * Two answers, in order: the canvas the **selection** is on (`canvasAt` — a shape is selected, or
 * the canvas itself is), otherwise a new canvas after the block the caret is in. The second is the
 * same walk `insertFrame` does, and for the same reason: "insert" means *next to what I am looking
 * at* everywhere else in a document.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import {
  canvasAt,
  canvasNode,
  defaultShapeBox,
  shapeNode,
  type CanvasAccess,
  type CanvasNode,
  type PageWidth
} from '@barocss/office-canvas';

/** What a caller may say about a new shape; everything else is computed. */
export interface InsertShapeOptions {
  /** The canvas to put it on, when the caller knows better than the selection. */
  canvasId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  attributes?: Record<string, unknown>;
  selection?: unknown;
}

export class WordCanvasInsertExtension implements Extension {
  name = 'wordCanvasInsert';
  priority = 46;

  onCreate(editor: Editor): void {
    const shape = (command: string, stype: string) => {
      (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
        name: command,
        execute: async (_ed: Editor, payload?: InsertShapeOptions) =>
          await this._insertShape(editor, stype, payload),
        // A drawing can be made wherever a block can, so the only thing that can refuse is a
        // document with nowhere to put one — no caret and no selection.
        canExecute: (_ed: Editor, payload?: InsertShapeOptions) => !!this._where(editor, payload)
      });
    };

    shape('insertRectangle', 'rectangle');
    shape('insertEllipse', 'ellipse');
    shape('insertLine', 'line');
    /*
     * **No text box yet**, and the harness is what stopped it.
     *
     * `insertTextBox` was written here with the others and `every-command-can-be-seen` refused it
     * within a minute: Word draws its canvas as an `<svg>` and has no `textFrame` renderer, so the
     * command would have put a node in the document that nothing draws — a reader pressing a button,
     * seeing nothing, and having changed their file.
     *
     * Text inside an SVG canvas is `<foreignObject>`, which is a real design question with its own
     * measurement (what a caret does in there, how the paginator measures it, what a print does with
     * it) and not a fifth line in this list. It is in `docs/BACKLOG.md` with that reason.
     */

    (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
      name: 'insertDrawing',
      execute: async (_ed: Editor, payload?: InsertShapeOptions) =>
        await this._insertDrawing(editor, payload),
      canExecute: (_ed: Editor, payload?: InsertShapeOptions) => !!this._blockAt(editor, payload?.selection)
    });
  }

  private _access(editor: Editor): CanvasAccess | null {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => unknown } }).dataStore;
    const rootId = (editor as never as { getRootId?: () => string }).getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) as CanvasNode } as CanvasAccess;
  }

  /**
   * The block a new sibling goes next to: the same walk `insertFrame` does.
   *
   * Up from whatever the selection names — a run, an inline node — until it reaches something whose
   * parent lists it and is not a paragraph, which is a *block*.
   */
  private _blockAt(
    editor: Editor,
    given?: unknown
  ): { sid: string; parentId: string; at: number } | null {
    const store = (editor as never as { dataStore?: any }).dataStore;
    const selection: any = given ?? (editor as never as { selection?: unknown }).selection;
    if (!store || !selection?.startNodeId) return null;

    let node: any = store.getNode(selection.startNodeId);
    let depth = 0;
    while (node && depth++ < 64) {
      const parent: any = node.parentId ? store.getNode(node.parentId) : undefined;
      const at = parent?.content?.indexOf?.(node.sid) ?? -1;
      if (
        parent &&
        at >= 0 &&
        typeof node.text !== 'string' &&
        node.stype !== 'inline-text' &&
        parent.stype !== 'paragraph' &&
        parent.stype !== 'heading'
      ) {
        return { sid: node.sid, parentId: parent.sid, at };
      }
      node = parent;
    }
    return null;
  }

  /** The page setup a new drawing takes its width from — the section it lands in. */
  private _pageOf(doc: CanvasAccess, parentId: string): PageWidth | undefined {
    let at: string | undefined = parentId;
    for (let depth = 0; at && depth < 32; depth += 1) {
      const node = doc.getNode(at);
      if (!node) return undefined;
      if (node.stype === 'surface') return node.attributes as PageWidth;
      at = (node as { parentId?: string }).parentId;
    }
    return undefined;
  }

  /**
   * Where a shape goes: the canvas the reader is on, or the block a new canvas goes after.
   *
   * Answering both from one function is what keeps `canExecute` honest — the button is enabled
   * exactly when the command has somewhere to write.
   */
  private _where(
    editor: Editor,
    payload?: InsertShapeOptions
  ): { canvasId: string } | { block: { sid: string; parentId: string; at: number } } | null {
    const doc = this._access(editor);
    if (!doc) return null;

    if (typeof payload?.canvasId === 'string' && payload.canvasId.length > 0) {
      return { canvasId: payload.canvasId };
    }

    const selection: any = payload?.selection ?? (editor as never as { selection?: unknown }).selection;
    const chosen: string | undefined = Array.isArray(selection?.nodeIds)
      ? selection.nodeIds[0]
      : selection?.startNodeId;
    const canvas = canvasAt(doc, chosen);
    if (canvas) return { canvasId: canvas };

    const block = this._blockAt(editor, payload?.selection);
    return block ? { block } : null;
  }

  private async _insertShape(
    editor: Editor,
    stype: string,
    payload?: InsertShapeOptions
  ): Promise<boolean> {
    const doc = this._access(editor);
    const where = this._where(editor, payload);
    if (!doc || !where) return false;

    const asked = {
      x: payload?.x,
      y: payload?.y,
      width: payload?.width,
      height: payload?.height
    };
    const box = (canvas: CanvasNode | undefined) => {
      const fitted = defaultShapeBox(canvas?.attributes as never);
      return {
        x: typeof asked.x === 'number' ? asked.x : fitted.x,
        y: typeof asked.y === 'number' ? asked.y : fitted.y,
        width: typeof asked.width === 'number' ? asked.width : fitted.width,
        height: typeof asked.height === 'number' ? asked.height : fitted.height
      };
    };

    if ('canvasId' in where) {
      const canvas = doc.getNode(where.canvasId);
      const child = shapeNode(stype, box(canvas), payload?.attributes ?? {});
      const result = await transaction(editor, [
        { type: 'addChild', payload: { parentId: where.canvasId, child } }
      ] as never).commit();
      return result.success === true;
    }

    /*
     * No canvas here, so the drawing and the shape arrive **together**, in one transaction.
     *
     * One press, one undo. A reader who presses 사각형 and then Ctrl+Z means "take the rectangle
     * back", and leaving an empty canvas behind would be the editor keeping half of a gesture
     * nobody made.
     */
    const page = this._pageOf(doc, where.block.parentId);
    const canvas = canvasNode(page) as CanvasNode & { content: unknown[] };
    canvas.content = [shapeNode(stype, box(canvas), payload?.attributes ?? {})];

    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: { parentId: where.block.parentId, child: canvas, position: where.block.at + 1 }
      }
    ] as never).commit();
    return result.success === true;
  }

  /** An empty drawing, for the reader who wants the surface before the shapes. */
  private async _insertDrawing(editor: Editor, payload?: InsertShapeOptions): Promise<boolean> {
    const doc = this._access(editor);
    const block = this._blockAt(editor, payload?.selection);
    if (!doc || !block) return false;

    const page = this._pageOf(doc, block.parentId);
    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: block.parentId,
          child: canvasNode(page, { width: payload?.width, height: payload?.height }),
          position: block.at + 1
        }
      }
    ] as never).commit();
    return result.success === true;
  }
}

/** The drawing commands, as an extension a kit can install. */
export function createWordCanvasInsert(): WordCanvasInsertExtension {
  return new WordCanvasInsertExtension();
}
