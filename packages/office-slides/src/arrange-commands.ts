import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { boxOf, slideSize, type Box } from './geometry';
import { alignBoxes, distributeBoxes, type Align } from './manipulate';
import { isSceneType, slideAt } from './selection';
import type { DeckAccess } from './deck';

/**
 * Arranging what is on a slide: what is in front, and what lines up with what.
 *
 * The commands a presentation editor has that a document has no use for,
 * because a document's blocks are in one order and at one place by definition.
 *
 * ## Z-order is `moveNode`
 *
 * Document order *is* paint order — the last child is drawn on top — so
 * bringing a shape to the front is moving it to the end of its parent, and
 * `moveNode` already does that and already declares an inverse. A `zOrder`
 * attribute would be a second ordering to keep agreeing with the first, and the
 * two would disagree the first time anything was inserted.
 *
 * ## Everything acts on the selection
 *
 * Unlike the box commands, which take a `nodeId`: aligning is a thing done to
 * *several* boxes, and asking a caller to list them would mean the toolbar and
 * the keyboard each rebuilding what the selection already knows. The selection
 * is the argument, and `selectedNodeIds` is how it is read.
 */
export class SlidesArrangeExtension implements Extension {
  name = 'slides-arrange';
  priority = 45;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: any) => Promise<boolean>,
      canExecute: (payload?: any) => boolean
    ) => {
      (editor as any).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: any) => await execute(payload),
        canExecute: (_ed: Editor, payload?: any) => canExecute(payload)
      });
    };

    // ── In front, behind ─────────────────────────────────────────────────────
    const order = (name: string, where: 'front' | 'back' | 'forward' | 'backward') =>
      register(
        name,
        () => this._reorder(editor, where),
        () => this._boxes(editor).length > 0
      );

    order('bringToFront', 'front');
    order('sendToBack', 'back');
    order('bringForward', 'forward');
    order('sendBackward', 'backward');

    // ── Lining up ────────────────────────────────────────────────────────────
    const align = (name: string, how: Align) =>
      register(
        name,
        (payload) => this._align(editor, how, payload?.toSlide === true),
        (payload) =>
          // Against the slide, one box is enough; against each other, it takes two.
          this._boxes(editor).length >= (payload?.toSlide === true ? 1 : 2)
      );

    align('alignBoxesLeft', 'left');
    align('alignBoxesCentre', 'centre');
    align('alignBoxesRight', 'right');
    align('alignBoxesTop', 'top');
    align('alignBoxesMiddle', 'middle');
    align('alignBoxesBottom', 'bottom');

    register(
      'distributeBoxesHorizontally',
      () => this._distribute(editor, 'x'),
      () => this._boxes(editor).length >= 3
    );
    register(
      'distributeBoxesVertically',
      () => this._distribute(editor, 'y'),
      () => this._boxes(editor).length >= 3
    );
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  private _access(editor: Editor): DeckAccess | null {
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) };
  }

  /**
   * The selected boxes, in document order.
   *
   * Document order rather than selection order, because everything here is
   * about where things are relative to each other and a reader who
   * shift-clicked backwards did not mean to reverse the deck.
   */
  private _boxes(editor: Editor): { sid: string; box: Box }[] {
    const doc = this._access(editor);
    if (!doc) return [];

    const ids = new Set(selectedNodeIds((editor as any).selection));
    if (ids.size === 0) return [];

    const slide = slideAt(doc, [...ids][0]);
    const surface: any = slide ? doc.getNode(slide) : undefined;
    const children: string[] = Array.isArray(surface?.content) ? surface.content : [];

    return children
      .filter((sid) => ids.has(sid))
      .map((sid) => ({ sid, node: doc.getNode(sid) as any }))
      .filter((entry) => entry.node && isSceneType(entry.node.stype))
      .filter((entry) => entry.node.attributes?.locked !== true)
      .map((entry) => ({ sid: entry.sid, box: boxOf(entry.node.attributes) }));
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  /**
   * Move the selection through its siblings.
   *
   * `front`/`back` go all the way; `forward`/`backward` go one step, which is
   * what a reader uses when two shapes overlap and only one of them is in the
   * way. Front and back move the boxes in document order so a set of three
   * arrives at the front in the order it was already in.
   */
  private async _reorder(
    editor: Editor,
    where: 'front' | 'back' | 'forward' | 'backward'
  ): Promise<boolean> {
    const doc = this._access(editor);
    const boxes = this._boxes(editor);
    if (!doc || boxes.length === 0) return false;

    const slide = slideAt(doc, boxes[0].sid);
    const surface: any = slide ? doc.getNode(slide) : undefined;
    const children: string[] = Array.isArray(surface?.content) ? [...surface.content] : [];
    if (!slide || children.length === 0) return false;

    const chosen = boxes.map((entry) => entry.sid);
    const steps: { type: string; payload: Record<string, unknown> }[] = [];

    if (where === 'front' || where === 'back') {
      // Backwards for `back`, so the first of them ends up first rather than last.
      const order = where === 'front' ? chosen : [...chosen].reverse();
      for (const sid of order) {
        steps.push({
          type: 'moveNode',
          payload: {
            nodeId: sid,
            newParentId: slide,
            position: where === 'front' ? children.length - 1 : 0
          }
        });
      }
    } else {
      const step = where === 'forward' ? 1 : -1;
      // The one nearest the edge it is moving towards goes first, so two
      // adjacent shapes do not swap through each other.
      const order = where === 'forward' ? [...chosen].reverse() : chosen;
      for (const sid of order) {
        const at = children.indexOf(sid);
        const to = at + step;
        if (at < 0 || to < 0 || to >= children.length) continue;
        steps.push({
          type: 'moveNode',
          payload: { nodeId: sid, newParentId: slide, position: to }
        });
      }
    }

    if (steps.length === 0) return false;
    return (await transaction(editor, steps as never).commit()).success;
  }

  private async _align(editor: Editor, how: Align, toSlide: boolean): Promise<boolean> {
    const doc = this._access(editor);
    const boxes = this._boxes(editor);
    if (!doc || boxes.length === 0) return false;

    let frame: Box | undefined;
    if (toSlide) {
      const slide = slideAt(doc, boxes[0].sid);
      const size = slideSize((slide ? (doc.getNode(slide) as any)?.attributes : undefined));
      frame = { x: 0, y: 0, width: size.width, height: size.height };
    }

    return await this._apply(
      editor,
      boxes,
      alignBoxes(
        boxes.map((entry) => entry.box),
        how,
        frame
      )
    );
  }

  private async _distribute(editor: Editor, axis: 'x' | 'y'): Promise<boolean> {
    const boxes = this._boxes(editor);
    return await this._apply(
      editor,
      boxes,
      distributeBoxes(
        boxes.map((entry) => entry.box),
        axis
      )
    );
  }

  /**
   * One transaction for the whole arrangement.
   *
   * Aligning six shapes is one thing the reader did, so it is one thing to
   * undo. And an arrangement that moved nothing commits nothing — every
   * calculation here returns only what changed, exactly so that this can be
   * true.
   */
  private async _apply(
    editor: Editor,
    boxes: { sid: string; box: Box }[],
    moved: Map<number, Box>
  ): Promise<boolean> {
    if (moved.size === 0) return false;

    const steps = [...moved].map(([index, box]) => ({
      type: 'setAttrs',
      payload: { nodeId: boxes[index].sid, attrs: { x: box.x, y: box.y } }
    }));

    return (await transaction(editor, steps as never).commit()).success;
  }
}

export function createArrangeCommands(): SlidesArrangeExtension {
  return new SlidesArrangeExtension();
}
