import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { boxOf, slideSize, type Box } from './geometry';
import {
  alignBoxes,
  distributeBoxes,
  intoFrame,
  outOfFrame,
  unionOf,
  type Align
} from './manipulate';
import { fromSurface, isSceneType, slideAt, toSurface } from './selection';
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

    // ── Grouping ─────────────────────────────────────────────────────────────
    /**
     * Make several boxes into one thing.
     *
     * `group` has been in the schema since the canvas nodes were declared, has
     * been drawn since this product had renderers, and **nothing has ever made
     * one** — the same fault this repository keeps finding, in a node type the
     * product draws.
     *
     * A group is not a box the author drew: it has no fill and no border, and
     * its own box is exactly the union of what is in it. What it is, is the fact
     * that these things move together.
     */
    register(
      'groupBoxes',
      () => this._group(editor),
      () => this._boxes(editor).length >= 2
    );

    register(
      'ungroupBoxes',
      () => this._ungroup(editor),
      () => this._boxes(editor).some((entry) => this._isGroup(editor, entry.sid))
    );
  }

  private _isGroup(editor: Editor, sid: string): boolean {
    const doc = this._access(editor);
    return (doc?.getNode(sid) as any)?.stype === 'group';
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
  /**
   * The node the selection sits in — which is not always the slide.
   *
   * These commands read the *slide's* children and matched the selection
   * against them, which was true while a reader could only select a box sitting
   * on the slide. It stopped being true the day one could go inside a frame or a
   * group: a rectangle in a frame is not among the slide's children, so the
   * selection matched nothing, `_boxes` came back empty, and every command
   * here — in front, behind, align, distribute, group — was disabled with no
   * explanation. The buttons were simply grey.
   *
   * Reading the parent is also the better answer to what these commands mean.
   * Two boxes in a frame are aligned against each other inside that frame, and
   * one sent to the back goes behind its siblings rather than behind everything
   * on the slide. The slide is just the container a box has when it has no other.
   */
  private _containerOf(doc: DeckAccess, sid: string): string | undefined {
    const parent = (doc.getNode(sid) as any)?.parentId as string | undefined;
    if (parent && isSceneType((doc.getNode(parent) as any)?.stype)) return parent;
    return slideAt(doc, sid);
  }

  /**
   * The selected boxes, wherever they live, in the slide's coordinates.
   *
   * Aligning used to read one container's children and match the selection
   * against them, so a selection spanning a group and the slide came back with
   * only half of itself — and with fewer than two boxes every align and
   * distribute button went grey, silently, for a selection a reader had plainly
   * made. What a reader means by "align these left" is the same thing whether
   * the shapes happen to share a parent.
   *
   * So the boxes are collected in the *slide's* coordinates, which is the one
   * space they all have in common, and `_apply` converts each answer back into
   * whatever container that box actually lives in. The conversion is
   * `toSurface`/`fromSurface`, which exist for exactly this — see
   * `docs/specs/canvas-model.md`.
   *
   * Ordered by the document rather than by the selection, so "send to back"
   * moves them in the order they are drawn.
   */
  private _boxes(editor: Editor): { sid: string; box: Box }[] {
    const doc = this._access(editor);
    if (!doc) return [];

    const ids = selectedNodeIds((editor as any).selection);
    if (ids.length === 0) return [];

    const container = this._containerOf(doc, ids[0]);
    const siblings: string[] = Array.isArray((doc.getNode(container ?? '') as any)?.content)
      ? ((doc.getNode(container!) as any).content as string[])
      : [];

    // The selection's own order is the reader's; document order is what paint
    // order means. Siblings first, in the order they are drawn, then anything
    // selected from another container.
    const ordered = [
      ...siblings.filter((sid) => ids.includes(sid)),
      ...ids.filter((sid) => !siblings.includes(sid))
    ];

    return ordered
      .map((sid) => ({ sid, node: doc.getNode(sid) as any }))
      .filter((entry) => entry.node && isSceneType(entry.node.stype))
      .filter((entry) => entry.node.attributes?.locked !== true)
      .map((entry) => ({
        sid: entry.sid,
        box: toSurface(doc, entry.sid, boxOf(entry.node.attributes))
      }));
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

    const slide = this._containerOf(doc, boxes[0].sid);
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
      /**
       * Against the container, which is the slide unless the reader has gone
       * inside something. Aligning a box in a frame "to the slide" means to the
       * frame — the frame is the surface it is on — and its children's
       * coordinates are the frame's, so the box to align against starts at zero
       * either way.
       */
      const container = this._containerOf(doc, boxes[0].sid);
      const node: any = container ? doc.getNode(container) : undefined;
      const size = isSceneType(node?.stype)
        ? { width: node?.attributes?.width ?? 0, height: node?.attributes?.height ?? 0 }
        : slideSize(node?.attributes);
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
  /**
   * Wrap the selection in a group.
   *
   * One transaction, and the group has to exist before anything can be moved
   * into it — which is what `$alias` is for: the child is declared with a name,
   * and every later step in the same transaction refers to it by that name
   * instead of by a sid nobody can know yet.
   *
   * The boxes are moved rather than copied, so their sids survive: a copy would
   * be a different node, and anything pointing at the original — a selection, a
   * note, a comment — would be pointing at something no longer in the document.
   *
   * Their coordinates are then rebased, because a group's children are placed
   * against *it*. Nothing moves on screen and every number describing it
   * changes.
   */
  private async _group(editor: Editor): Promise<boolean> {
    const doc = this._access(editor);
    const boxes = this._boxes(editor);
    if (!doc || boxes.length < 2) return false;

    const slide = this._containerOf(doc, boxes[0].sid);
    const surface: any = slide ? doc.getNode(slide) : undefined;
    const children: string[] = Array.isArray(surface?.content) ? surface.content : [];
    if (!slide) return false;

    const frame = unionOf(boxes.map((entry) => entry.box));
    if (!frame) return false;

    // Where the topmost of them was, so the group keeps their place in the
    // paint order rather than jumping to the front.
    const at = Math.max(...boxes.map((entry) => children.indexOf(entry.sid)));

    const ALIAS = 'sl-new-group';
    const steps: { type: string; payload: Record<string, unknown> }[] = [
      {
        type: 'addChild',
        payload: {
          parentId: slide,
          position: at + 1,
          child: {
            stype: 'group',
            attributes: { $alias: ALIAS, x: frame.x, y: frame.y, width: frame.width, height: frame.height }
          }
        }
      }
    ];

    boxes.forEach((entry, index) => {
      steps.push({
        type: 'moveNode',
        payload: { nodeId: entry.sid, newParentId: ALIAS, position: index }
      });
      const inside = intoFrame(entry.box, frame);
      steps.push({
        type: 'setAttrs',
        payload: { nodeId: entry.sid, attrs: { x: inside.x, y: inside.y } }
      });
    });

    const result = await transaction(editor, steps as never).commit();
    if (!result.success) return false;

    // The group is what is selected now — it is the thing the reader made.
    const made = ((doc.getNode(slide) as any)?.content ?? []).find(
      (sid: string) => (doc.getNode(sid) as any)?.stype === 'group'
    );
    if (made) (editor as any).setNode?.({ nodeIds: [made] });

    return true;
  }

  /**
   * Take a group apart.
   *
   * The reverse, and the coordinates go back out the way they came in. The
   * group node itself goes: an empty group is not a group, and the schema says
   * so — its content is `scene+`.
   */
  private async _ungroup(editor: Editor): Promise<boolean> {
    const doc = this._access(editor);
    const chosen = this._boxes(editor).filter((entry) => this._isGroup(editor, entry.sid));
    if (!doc || chosen.length === 0) return false;

    // Where the group sits, which is the slide unless the group is itself inside
    // one — ungrouping a nested group frees its children into the group above.
    const slide = this._containerOf(doc, chosen[0].sid);
    if (!slide) return false;

    const steps: { type: string; payload: Record<string, unknown> }[] = [];
    const freed: string[] = [];

    for (const entry of chosen) {
      const group: any = doc.getNode(entry.sid);
      const inside: string[] = Array.isArray(group?.content) ? [...group.content] : [];
      const frame = boxOf(group?.attributes);

      const children: string[] = Array.isArray((doc.getNode(slide) as any)?.content)
        ? (doc.getNode(slide) as any).content
        : [];
      const at = children.indexOf(entry.sid);

      inside.forEach((sid, index) => {
        const out = outOfFrame(boxOf((doc.getNode(sid) as any)?.attributes), frame);
        steps.push({
          type: 'moveNode',
          payload: { nodeId: sid, newParentId: slide, position: at + index }
        });
        steps.push({
          type: 'setAttrs',
          payload: { nodeId: sid, attrs: { x: out.x, y: out.y } }
        });
        freed.push(sid);
      });

      steps.push({
        type: 'removeChild',
        payload: { parentId: slide, childId: entry.sid }
      });
    }

    if (steps.length === 0) return false;
    const result = await transaction(editor, steps as never).commit();
    if (!result.success) return false;

    // What comes out is what is selected, which is what a reader has in mind
    // when they take a group apart.
    if (freed.length > 0) (editor as any).setNode?.({ nodeIds: freed });
    return true;
  }

  private async _apply(
    editor: Editor,
    boxes: { sid: string; box: Box }[],
    moved: Map<number, Box>
  ): Promise<boolean> {
    if (moved.size === 0) return false;

    const doc = this._access(editor);
    if (!doc) return false;

    /**
     * Back into each box's own container.
     *
     * The arithmetic happened in the slide's coordinates because that is the
     * space the boxes have in common; the document holds each one relative to
     * its parent, and a box in a group is written with the group's origin taken
     * off again.
     */
    const steps = [...moved].map(([index, box]) => {
      const sid = boxes[index].sid;
      const parent = (doc.getNode(sid) as any)?.parentId as string | undefined;
      const placed = fromSurface(doc, parent, box);
      return {
        type: 'setAttrs',
        payload: { nodeId: sid, attrs: { x: placed.x, y: placed.y } }
      };
    });

    return (await transaction(editor, steps as never).commit()).success;
  }
}

export function createArrangeCommands(): SlidesArrangeExtension {
  return new SlidesArrangeExtension();
}
