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
import {
  layoutGraph,
  rankGapFor,
  type GraphDirection,
  type GraphEdge,
  type GraphNode
} from '@barocss/office-word';
import { fitGroupToChildren } from './group-bounds';
import { fromSurface, isSceneType, slideAt, toSurface } from './selection';
import { deckSlides, type DeckAccess } from './deck';

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

    /**
     * A group's box follows what is in it.
     *
     * A group is not a shape a reader drew — it is the fact that these things
     * move together — so its rectangle has one honest value: the bounds of its
     * children. Nothing kept it there. Moving a child out of a group is
     * legitimate in the model, and it left the group's own rectangle describing
     * an area its contents had left: a child nudged 6000 twips to the right
     * stuck that far out of a group whose width never changed, and the handles,
     * the marquee, the hit test and aligning were all reading a rectangle that
     * had stopped meaning anything.
     *
     * A reaction rather than a step inside each command, because *anything* can
     * move a child: a drag, a nudge, an align, a paste, an undo. Adding the fit
     * to each of them would be the same rule written six times, and the seventh
     * command would forget it.
     *
     * It does not feed itself for the reason the frame layout does not: the
     * arithmetic answers with what *differs*, so a group that already agrees
     * produces nothing and the second pass finds no work.
     */
    editor.on('editor:content.change', () => {
      void this._fitGroups(editor);
    });

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

    /**
     * Straight to a place in the stack.
     *
     * The four above are the four buttons every Office product has, and they are
     * four answers to a question whose real answer is a **position**: moving the
     * fourth of six shapes to second means pressing 앞으로 twice and counting. A
     * list beside the canvas asks it properly — a row dragged to where it should be
     * — and this is the command that takes that.
     *
     * One shape from a list, and **several from a drag**.
     *
     * It began as one only: a drag in a list moves the row that was picked up, and
     * "move these three to position 2" had no meaning a reader could predict. A drag
     * inside a frame that *arranges* gave it one — the shapes go in at that place,
     * keeping the order they already had between them — so a payload may name several
     * and they move together, in one entry.
     */
    register(
      'moveBoxTo',
      (payload) => this._moveTo(editor, this._namedBoxes(payload), payload?.position),
      (payload) => this._canMoveTo(editor, this._namedBoxes(payload), payload?.position)
    );

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

    // ── Tidying a diagram ────────────────────────────────────────────────────
    /**
     * Put the diagram in rows.
     *
     * A reader draws a flow chart the way they think of it and after a dozen boxes the
     * picture is right and the *placement* is a mess. Every diagram tool has one button
     * for this, and the arithmetic is `layoutGraph` — ranks, an ordering that stops the
     * lines crossing, and a pull that puts a parent over the middle of its children.
     *
     * One transaction, so it is one press of undo. That is not a detail: a reader will
     * only dare press a button that moves everything they have drawn if it costs one
     * keystroke to change their mind.
     */
    register(
      'arrangeGraph',
      (payload) => this._graph(editor, payload),
      (payload) => this._graphOf(editor, payload).edges.length > 0
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

  /**
   * Which parent a box sits in, and where in it.
   *
   * Its own reading rather than `_containerOf` plus an `indexOf` at each call
   * site: both the command and its guard need the same two numbers, and a guard
   * that computed them differently from the command is a button that is enabled
   * for something that then does nothing.
   */
  private _placeOf(
    editor: Editor,
    nodeId: string | undefined
  ): { parent: string; children: string[]; at: number } | null {
    const doc = this._access(editor);
    if (!doc || !nodeId) return null;

    const parent = this._containerOf(doc, nodeId);
    const node: any = parent ? doc.getNode(parent) : undefined;
    const children: string[] = Array.isArray(node?.content) ? [...node.content] : [];
    const at = children.indexOf(nodeId);
    return parent && at >= 0 ? { parent, children, at } : null;
  }

  /** The boxes a payload names, one or several. */
  private _namedBoxes(payload: any): string[] {
    if (Array.isArray(payload?.nodeIds)) {
      return payload.nodeIds.filter((sid: unknown): sid is string => typeof sid === 'string');
    }
    return typeof payload?.nodeId === 'string' ? [payload.nodeId] : [];
  }

  private _canMoveTo(editor: Editor, nodeIds: string[], position?: number): boolean {
    if (typeof position !== 'number' || !Number.isInteger(position)) return false;
    const order = this._orderFor(editor, nodeIds, position);
    return !!order && order.steps.length > 0;
  }

  /**
   * The children in the order this move means, and the fewest moves that get there.
   *
   * ## Why the whole order and not one `moveNode`
   *
   * `moveNode` removes the node and inserts it into the **shortened** array, so a
   * position means an index in the list without the moving shape. That is fine for one.
   * For several it is a trap: moving `[a, b]` to place 2 of `[a, b, c, d]` one at a time
   * gives `[c, a, d, b]` — the second move's index was computed against a list the first
   * move had already changed. Worked through on paper, then written down here.
   *
   * So the answer is built as a *final order* and realised left to right: at each place,
   * if the child that should be there is not, move it there. Everything to the left is
   * already settled and nothing touches it, and a child that is already in place costs
   * no operation — which is what keeps a drag that changes two things from writing five.
   */
  private _orderFor(
    editor: Editor,
    nodeIds: string[],
    position: number
  ): { parent: string; steps: { type: string; payload: Record<string, unknown> }[] } | null {
    if (nodeIds.length === 0 || position < 0) return null;

    const place = this._placeOf(editor, nodeIds[0]);
    if (!place) return null;
    // One parent, because a place in an order is a place among *siblings*.
    const moving = nodeIds.filter((sid) => place.children.includes(sid));
    if (moving.length !== nodeIds.length) return null;

    const rest = place.children.filter((sid) => !moving.includes(sid));
    if (position > rest.length) return null;

    // Their own order between them is the reader's, and a drag does not reverse it.
    const block = place.children.filter((sid) => moving.includes(sid));
    const wanted = [...rest.slice(0, position), ...block, ...rest.slice(position)];

    const steps: { type: string; payload: Record<string, unknown> }[] = [];
    const now = [...place.children];
    for (const [index, sid] of wanted.entries()) {
      if (now[index] === sid) continue;
      steps.push({
        type: 'moveNode',
        payload: { nodeId: sid, newParentId: place.parent, position: index }
      });
      now.splice(now.indexOf(sid), 1);
      now.splice(index, 0, sid);
    }

    return { parent: place.parent, steps };
  }

  private async _moveTo(
    editor: Editor,
    nodeIds: string[],
    position?: number
  ): Promise<boolean> {
    if (typeof position !== 'number' || !Number.isInteger(position)) return false;
    const order = this._orderFor(editor, nodeIds, position);
    // Nothing to do is not a failure to report as success: a drag that lands where it
    // started should leave no entry in the history for a reader to undo into nothing.
    if (!order || order.steps.length === 0) return false;

    return (await transaction(editor, order.steps as never).commit()).success;
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
  /** Guards against re-entering while a fit is in flight. */
  private _fitting = false;

  /** Every group brought back into agreement with its children. */
  private async _fitGroups(editor: Editor): Promise<void> {
    if (this._fitting) return;

    const doc = this._access(editor);
    if (!doc) return;

    const steps: { type: string; payload: Record<string, unknown> }[] = [];
    const seen = new Set<string>();

    const walk = (sid: string, depth: number): void => {
      if (depth > 32 || seen.has(sid)) return;
      seen.add(sid);

      const node: any = doc.getNode(sid);
      if (!node) return;

      /**
       * Children first, so a group of groups settles in one pass: an inner
       * group's box has to be right before the outer one measures it.
       */
      for (const child of Array.isArray(node.content) ? node.content : []) {
        if (typeof child === 'string') walk(child, depth + 1);
      }

      if (node.stype !== 'group') return;

      const children = (Array.isArray(node.content) ? node.content : [])
        .filter((child: unknown): child is string => typeof child === 'string')
        .map((child: string) => ({ sid: child, placement: (doc.getNode(child) as any)?.attributes }))
        .filter((child: { placement: unknown }) => !!child.placement);

      const fit = fitGroupToChildren(node.attributes, children as never);
      if (fit.group) {
        steps.push({ type: 'setAttrs', payload: { nodeId: sid, attrs: { ...fit.group } } });
      }
      for (const [child, at] of fit.children) {
        steps.push({ type: 'setAttrs', payload: { nodeId: child, attrs: { x: at.x, y: at.y } } });
      }
    };

    walk(doc.rootId, 0);
    if (steps.length === 0) return;

    this._fitting = true;
    try {
      /**
       * Into the entry of the edit that caused it — not its own, and not nowhere.
       *
       * Both of the other answers were measured and both are wrong here. **Recorded**:
       * a reader moved one shape inside a group and three presses of undo changed
       * nothing at all, because each press undid this fit and this reaction — which runs
       * on every document change, an undo included — wrote it straight back.
       * **Unrecorded**: the child came back and the group did not, because this pass does
       * not only write derived numbers. It re-origins: the group moves right by 3000 and
       * every child moves left by 3000, which together change nothing on screen. Undo
       * restored one child's relative `x` into a coordinate space that had moved, and put
       * the shape somewhere it had never been.
       *
       * The fit is a *consequence* of the edit, so it goes in the edit's entry and one
       * undo takes back both halves exactly. `recordInHistory: false` stays right for
       * state the reader never writes — a connector's route, a laid-out frame's children
       * (canvas-model §8.11).
       */
      await transaction(editor, steps as never, { appendToPreviousEntry: true }).commit();
    } finally {
      this._fitting = false;
    }
  }

  /**
   * What there is to tidy: the shapes, and the lines between them.
   *
   * **Where** is the same question every command here asks — the selection's container
   * when there is a selection, and otherwise the slide the caller named or the first one
   * (the rule the insert commands follow, so a command with no argument is still useful
   * from a console).
   *
   * **Which shapes** has one more turn to it: two or more boxes selected means *those*,
   * so a slide with two diagrams on it can have one of them tidied. With one box or none
   * selected it is the whole container, because "tidy this" said about a single shape
   * cannot mean that shape alone.
   */
  private _graphOf(
    editor: Editor,
    payload?: { slideId?: string; direction?: GraphDirection }
  ): {
    doc: DeckAccess | null;
    container?: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    lines: { label?: string; strokeWidth?: number }[];
    boxes: { sid: string; box: Box }[];
  } {
    const doc = this._access(editor);
    const empty = {
      doc,
      nodes: [] as GraphNode[],
      edges: [] as GraphEdge[],
      lines: [] as { label?: string; strokeWidth?: number }[],
      boxes: []
    };
    if (!doc) return empty;

    const selected = selectedNodeIds((editor as any).selection);
    const container =
      selected.length > 0
        ? this._containerOf(doc, selected[0])
        : (payload?.slideId ?? deckSlides(doc)[0]?.sid);
    if (!container) return empty;

    const children: string[] = Array.isArray((doc.getNode(container) as any)?.content)
      ? ((doc.getNode(container) as any).content as string[])
      : [];

    const chosen = selected.length >= 2 ? new Set(selected) : null;
    const boxes = children
      .map((sid) => ({ sid, node: doc.getNode(sid) as any }))
      .filter((entry) => entry.node && isSceneType(entry.node.stype))
      // A connector is a scene node too, and it is an *edge* here rather than a box: it
      // has no place of its own to move to (canvas-model §8.1).
      .filter((entry) => entry.node.stype !== 'connector')
      .filter((entry) => !chosen || chosen.has(entry.sid))
      .map((entry) => ({
        sid: entry.sid,
        node: entry.node,
        box: toSurface(doc, entry.sid, boxOf(entry.node.attributes))
      }));

    const here = new Set(boxes.map((entry) => entry.sid));
    const joined = children
      .map((sid) => doc.getNode(sid) as any)
      .filter((node) => node?.stype === 'connector')
      .map((node) => ({
        from: node.attributes?.startNodeId as string | undefined,
        to: node.attributes?.endNodeId as string | undefined,
        label: node.attributes?.label,
        strokeWidth: node.attributes?.strokeWidth
      }))
      // Both ends held, and both of them shapes being tidied. A line with a free end has
      // no relationship to rank by, and one pointing at another line is not a rank
      // either — it hangs off wherever that line ends up (§8.6).
      .filter((edge) => edge.from && edge.to && here.has(edge.from) && here.has(edge.to));

    return {
      doc,
      container,
      nodes: boxes.map((entry) => ({
        sid: entry.sid,
        width: entry.box.width,
        height: entry.box.height,
        at: { x: entry.box.x, y: entry.box.y },
        /**
         * A **locked** shape is a pin, and this is where the answer to "is the tidy a
         * mode?" lands in the product.
         *
         * It is not a mode: it runs once and writes plain coordinates, so a reader
         * arranges what they like afterwards — but press it again and their arrangement
         * is gone. `locked` already means "I have decided where this goes", it already
         * has a command and a control, and a new `pinnedForLayout` beside it would be a
         * second word for the same decision.
         *
         * Anchoring rather than *excluding*: dropping a locked shape from the graph took
         * its lines out with it, so one locked box in a chain made the whole diagram
         * untidiable. Now the diagram is laid out **around** it.
         */
        pinned: entry.node.attributes?.locked === true
      })),
      edges: joined.map((edge) => ({ from: edge.from!, to: edge.to! })),
      /**
       * What each of those lines *draws*, which is what the gap between two ranks has to
       * hold. The document's answer — the label a reader typed, the weight they chose —
       * read here because reading the document is this method's job.
       */
      lines: joined.map((edge) => ({
        label: typeof edge.label === 'string' ? edge.label : undefined,
        strokeWidth: typeof edge.strokeWidth === 'number' ? edge.strokeWidth : undefined
      })),
      boxes: boxes.map((entry) => ({ sid: entry.sid, box: entry.box }))
    };
  }

  private async _graph(
    editor: Editor,
    payload?: {
      slideId?: string;
      direction?: GraphDirection;
      rankGap?: number;
      nodeGap?: number;
    }
  ): Promise<boolean> {
    const { doc, container, nodes, edges, lines, boxes } = this._graphOf(editor, payload);
    if (!doc || !container || edges.length === 0) return false;

    /**
     * Where the tidied diagram goes: the corner of where it already is.
     *
     * Not the corner of the slide. A reader who has put a diagram in the lower half of a
     * slide, under a title, means it to stay in the lower half — a tidy that also *moves*
     * the picture is two changes wearing one name.
     */
    const moving = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    const inside = boxes.filter((entry) => moving.has(entry.sid));
    if (inside.length === 0) return false;
    const origin = {
      x: Math.min(...inside.map((entry) => entry.box.x)),
      y: Math.min(...inside.map((entry) => entry.box.y))
    };

    const direction: GraphDirection = payload?.direction === 'right' ? 'right' : 'down';
    /**
     * The gaps are **measured**, not picked.
     *
     * `rankGapFor` reads this diagram's own labels and line weights: between two ranks
     * there is a line, an arrowhead and a label pill, and a gap that does not hold the
     * pill draws it over the shape below. A caller may say otherwise — a number from a
     * console, a test, a future panel — and a number that is not a positive one is not an
     * answer, so it falls back rather than being written.
     */
    const asked = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

    const placed = layoutGraph(nodes, edges, {
      direction,
      rankGap: asked(payload?.rankGap) ?? rankGapFor(lines, direction),
      nodeGap: asked(payload?.nodeGap),
      origin
    });
    if (placed.length === 0) return false;

    const steps: unknown[] = [];
    for (const one of placed) {
      const was = boxes.find((entry) => entry.sid === one.sid)?.box;
      // Only what actually moves. A tidy of a diagram that is already tidy should be a
      // no-op the reader can see, not an undo entry that changes nothing.
      if (was && was.x === one.x && was.y === one.y) continue;
      const parent = (doc.getNode(one.sid) as any)?.parentId as string | undefined;
      const at = fromSurface(doc, parent, { ...(was ?? { width: 0, height: 0 }), ...one });
      steps.push({
        type: 'setAttrs',
        payload: { nodeId: one.sid, attrs: { x: at.x, y: at.y } }
      });
    }

    /**
     * And the bends the reader placed by hand come off the lines being tidied.
     *
     * A waypoint (§8.12) and a `bend` describe a route through a picture that no longer
     * exists — a detour around a shape that has moved, an offset that used to separate
     * two lines and now pushes one through a box. They are decisions, so nothing but a
     * reader's own gesture may clear them; asking for a tidy **is** that gesture.
     *
     * In the same transaction, so one undo puts the diagram *and* its bends back.
     */
    const container_ = doc.getNode(container) as any;
    for (const sid of (container_?.content ?? []) as string[]) {
      const node = doc.getNode(sid) as any;
      if (node?.stype !== 'connector') continue;
      if (!moving.has(node.attributes?.startNodeId) && !moving.has(node.attributes?.endNodeId)) {
        continue;
      }
      const bent = node.attributes?.bend;
      const through = node.attributes?.waypoints;
      if (!bent && !(Array.isArray(through) && through.length > 0)) continue;
      steps.push({
        type: 'setAttrs',
        // `null` removes, rather than leaving a zero that reads as a decision to keep
        // the line where it is — the model's own rule for absence.
        payload: { nodeId: sid, attrs: { bend: null, waypoints: null } }
      });
    }

    if (steps.length === 0) return false;
    return (await transaction(editor, steps as never).commit()).success;
  }

}
export function createArrangeCommands(): SlidesArrangeExtension {
  return new SlidesArrangeExtension();
}
