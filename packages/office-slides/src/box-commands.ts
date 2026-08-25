import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import {
  connectorFreezeSteps,
  copyForPaste,
  editableSurface,
  pastable,
  type DeckAccess,
  type DeckNode
} from './deck';
import {
  SHAPE_PAINT,
  defaultShapeBox,
  shapeNode,
  type CanvasBox
} from '@barocss/office-canvas';
import { SLIDE_16_9, boxOf, slideSize } from './geometry';
import { isSceneType, slideAt } from './selection';

/**
 * Putting something on a slide.
 *
 * The gap that stopped this being a presentation editor: a deck could hold
 * shapes, draw them, and read their properties, and there was **no way to make
 * one**. Every box on a slide came from the sample deck or from a layout.
 *
 * One command per shape rather than a general `insertShape({ kind })`, for two
 * reasons that both matter here. The conformance check asks what each `insert…`
 * command produces and a single command would answer "it depends", which is the
 * answer that check exists to refuse. And a toolbar draws one button per shape
 * anyway, so the generality would be spent immediately on a lookup table.
 *
 * ## Where a new box goes
 *
 * The middle of the slide, at a fraction of its size, which is what every
 * drawing tool does and what a reader expects to find under the pointer they
 * just clicked with. Not at the pointer: a shape button is pressed in the
 * toolbar, and the pointer is over the toolbar.
 *
 * A caller that knows better — a paste, a drag-to-draw — passes the box it
 * wants, and these compute nothing.
 */

/**
 * A quarter of the slide, in the middle of it: what a new shape starts as.
 *
 * The arithmetic is `defaultShapeBox` in the canvas layer, because "a quarter of what holds it, in
 * the middle" is as true of a page's drawing as of a slide and the same renderer draws both — two
 * answers would be one of them being wrong the first time a shape was copied between them. What
 * stays here is the deck's own half: **what holds it** is the slide, and a slide's size has a
 * default that a canvas block does not.
 */
function defaultBox(slide: DeckNode | undefined): CanvasBox {
  return defaultShapeBox(slideSize(slide?.attributes as never));
}

/**
 * What each shape needs beyond a box, so nothing is drawn invisible — the canvas layer's table.
 *
 * It was written out here and it names no product: a new rectangle is blue, a new line is dark grey
 * and thick enough to grab, a frame is a pale box you can see the edge of. Word's drawing needs the
 * same answers, and a shape that changed colour on its way from a deck into a document would be the
 * two products disagreeing about one thing (`docs/SHARED-LAYER.md`).
 */

export class SlidesBoxExtension implements Extension {
  name = 'slides-boxes';
  priority = 45;

  onCreate(editor: Editor): void {
    const shape = (command: string, stype: string) => {
      (editor as any).registerCommand({
        name: command,
        execute: async (_ed: Editor, payload?: any) => await this._insert(editor, stype, payload),
        canExecute: () => !!this._slideFor(editor, undefined)
      });
    };

    shape('insertRectangle', 'rectangle');
    shape('insertEllipse', 'ellipse');
    shape('insertLine', 'line');
    shape('insertTextBox', 'textFrame');
    /**
     * A frame, which the deck has drawn and arranged all along and never made.
     *
     * `setFrameLayout` is a command, the properties panel has controls for it,
     * `layoutChildren` computes positions for what is inside one — and the only
     * frames that existed were the two in the sample deck, because nothing put
     * one on a slide. A feature that works and cannot be reached, which is the
     * failure this repository keeps finding in its own code.
     *
     * No `layoutMode` here: a new frame is a plain box, and arranging what is in
     * it is a decision the reader makes afterwards with the controls that already
     * exist. Creating it already arranging would move whatever they drop into it
     * before they have said they want that.
     */
    shape('insertFrame', 'frame');

    /**
     * A picture, placed on the slide.
     *
     * Not `insertImage`, which is the standard schema's and puts an
     * `inline-image` in the paragraph the caret is in — that is a picture *in
     * the text*, and both are real. A reader who presses the picture button on a
     * slide means the placed kind: something to drag, resize and put behind the
     * title.
     *
     * `width` and `height` are the caller's, because only the caller has seen
     * the file: a picture dropped into a box of the wrong shape is either
     * stretched or cropped, and neither is what a reader who has just chosen a
     * photograph expects. The app measures the image and passes its proportions;
     * without them the picture takes the default box like any other shape.
     */
    (editor as any).registerCommand({
      name: 'insertPicture',
      execute: async (_ed: Editor, payload?: any) =>
        await this._insert(editor, 'picture', {
          ...payload,
          attributes: { src: payload?.src, alt: payload?.alt, ...(payload?.attributes ?? {}) }
        }),
      canExecute: (_ed: Editor, payload?: any) =>
        typeof payload?.src === 'string' &&
        payload.src.length > 0 &&
        !!this._slideFor(editor, payload?.slideId)
    });

    /**
     * A film and a sound, each with its own command.
     *
     * Written first as one `insertMedia` with a `kind`, and the conformance
     * check refused it within a minute: a command named as though it puts a node
     * in the document has to say *which* node, and "it depends" is the answer
     * that check exists to refuse. The shapes are one command each for the same
     * reason, and the standard schema's own media commands are already named
     * this way.
     *
     * The size is the caller's for the same reason a picture's is: only the
     * caller has seen the file, and a film in a box of the wrong shape is
     * letterboxed on a projector in front of an audience.
     */
    const media = (name: string, stype: string, extra: (payload: any) => Record<string, unknown>) => {
      (editor as any).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: any) =>
          await this._insert(editor, stype, {
            ...payload,
            attributes: { src: payload?.src, ...extra(payload), ...(payload?.attributes ?? {}) }
          }),
        canExecute: (_ed: Editor, payload?: any) =>
          typeof payload?.src === 'string' &&
          payload.src.length > 0 &&
          !!this._slideFor(editor, payload?.slideId)
      });
    };

    media('insertVideo', 'mediaVideo', (payload) => ({ poster: payload?.poster }));
    media('insertAudio', 'mediaAudio', () => ({}));

    const onSelection = (
      name: string,
      execute: (payload?: any) => Promise<boolean>,
      atLeast = 1
    ) => {
      (editor as any).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: any) => await execute(payload),
        canExecute: () => this._selected(editor).length >= atLeast
      });
    };

    /**
     * Throw away what is selected.
     *
     * Named for boxes rather than reusing `deleteNode`, because what a reader
     * means by Delete depends entirely on what kind of selection they have: a
     * caret in text deletes a character, and this only ever runs when whole
     * boxes are selected.
     */
    onSelection('deleteBoxes', () => this._deleteBoxes(editor));

    /**
     * A copy, offset so it is visibly a second thing.
     *
     * Directly on top would look like nothing happened, and a reader would
     * press it again. The offset is what every drawing tool does and the amount
     * hardly matters, so it is a tenth of an inch.
     */
    onSelection('duplicateBoxes', () => this._duplicateBoxes(editor));

    /**
     * Move the selection by a fixed amount — the arrow keys.
     *
     * The one edit here that a reader repeats quickly, so it takes a step
     * rather than a destination and each press is its own entry in the history.
     * Coarser with a modifier, which is the convention everywhere.
     */
    onSelection('nudgeBoxes', (payload) =>
      this._nudge(editor, Number(payload?.dx) || 0, Number(payload?.dy) || 0)
    );
  }

  /** The selected boxes, in document order, skipping any that are locked. */
  /**
   * The container the selection is in, which is the slide unless the reader has
   * gone inside a frame or a group.
   *
   * The same correction the arrange commands needed, for the same reason: these
   * read a container's children and match the selection against them, which was
   * true while a box could only sit on the slide. A rectangle inside a frame is
   * not among the slide's children, so duplicate, delete and nudge were all
   * refused for it with nothing said.
   */
  private _containerOf(doc: DeckAccess, sid: string): string | undefined {
    const parent = (doc.getNode(sid) as any)?.parentId as string | undefined;
    if (parent && isSceneType((doc.getNode(parent) as any)?.stype)) return parent;
    return slideAt(doc, sid);
  }

  private _selected(editor: Editor): { sid: string; node: any }[] {
    const doc = this._access(editor);
    if (!doc) return [];

    const ids = new Set(selectedNodeIds((editor as any).selection));
    if (ids.size === 0) return [];

    const slide = this._containerOf(doc, [...ids][0]);
    const surface: any = slide ? doc.getNode(slide) : undefined;
    const children: string[] = Array.isArray(surface?.content) ? surface.content : [];

    return children
      .filter((sid) => ids.has(sid))
      .map((sid) => ({ sid, node: doc.getNode(sid) as any }))
      .filter((entry) => entry.node && isSceneType(entry.node.stype))
      .filter((entry) => entry.node.attributes?.locked !== true);
  }

  private async _deleteBoxes(editor: Editor): Promise<boolean> {
    const doc = this._access(editor);
    const chosen = this._selected(editor);
    if (!doc || chosen.length === 0) return false;

    // The container it is actually in — removing a child names its real parent,
    // and naming the slide for a box inside a frame removes nothing.
    const slide = this._containerOf(doc, chosen[0].sid);
    if (!slide) return false;

    /**
     * The lines that hold these shapes are told first.
     *
     * A connector keeps the *place* of each end so that deleting a shape leaves the line
     * where it was drawn rather than making it vanish — and this is the only moment that
     * place can still be read. Afterwards the shape is gone.
     *
     * In the same transaction, so it is one undo: a line frozen without the deletion it
     * was frozen for would be a line pinned to nothing.
     */
    const steps = [
      ...connectorFreezeSteps(doc, chosen.map((entry) => entry.sid)),
      ...chosen.map((entry) => ({
        type: 'removeChild',
        payload: { parentId: slide, childId: entry.sid }
      }))
    ];

    const result = await transaction(editor, steps as never).commit();
    if (!result.success) return false;

    // Nothing is selected once it is gone. Leaving the ids selected would leave
    // the panel and the handles pointing at nodes the document no longer has.
    (editor as any).setNode?.(null);
    return true;
  }

  private async _duplicateBoxes(editor: Editor): Promise<boolean> {
    const doc = this._access(editor);
    const chosen = this._selected(editor);
    if (!doc || chosen.length === 0) return false;

    // Into the container it came from: duplicating a shape inside a frame puts
    // the copy in that frame, beside it.
    const slide = this._containerOf(doc, chosen[0].sid);
    if (!slide) return false;

    const OFFSET = 144; // a tenth of an inch

    /**
     * The same fault the clipboard had: a duplicated line pointed at the **originals**,
     * so duplicating a diagram gave two sets of shapes with both lines attached to the
     * first. `copyForPaste` makes the references inside the copy local to it and
     * `pastable` resolves them to sids this names itself — one transaction, one undo.
     */
    const store = (editor as any).dataStore;
    const copies = pastable(
      copyForPaste(doc, chosen.map((entry) => entry.sid)),
      () => store.generateId()
    );
    const steps = copies.map((copy) => {
      const box = boxOf(copy.attributes as never);
      copy.attributes = { ...copy.attributes, x: box.x + OFFSET, y: box.y + OFFSET };
      return { type: 'addChild', payload: { parentId: slide, child: copy } };
    });

    const result = await transaction(editor, steps as never).commit();
    if (!result.success) return false;

    /**
     * The copies are selected, not the originals.
     *
     * A reader duplicates in order to move the copy, and they are the last N
     * children because that is where `addChild` put them.
     */
    const surface: any = doc.getNode(slide);
    const children: string[] = Array.isArray(surface?.content) ? surface.content : [];
    const made = children.slice(-steps.length);
    if (made.length > 0) (editor as any).setNode?.({ nodeIds: made });

    return true;
  }

  private async _nudge(editor: Editor, dx: number, dy: number): Promise<boolean> {
    const chosen = this._selected(editor);
    if (chosen.length === 0 || (dx === 0 && dy === 0)) return false;

    const steps = chosen.map((entry) => {
      const box = boxOf(entry.node.attributes);
      return {
        type: 'setAttrs',
        payload: { nodeId: entry.sid, attrs: { x: box.x + dx, y: box.y + dy } }
      };
    });

    return (await transaction(editor, steps as never).commit()).success;
  }

  private _access(editor: Editor): DeckAccess | null {
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) };
  }

  /**
   * Which slide the box goes on.
   *
   * The one asked for, or the first — the same rule the slide commands follow,
   * so a command with no argument is useful from a console and a test rather
   * than being a no-op.
   */
  private _slideFor(editor: Editor, slideId: string | undefined): string | undefined {
    const doc = this._access(editor);
    if (!doc) return undefined;

    /**
     * Any surface a reader can edit, not only a slide.
     *
     * Asked of the deck (`editableSurface`) because the answer changed when a component's
     * definition became a surface of its own: validating against `deckSlides` refused the
     * definition's own sid, and defaulting to the first slide put a reader's new shape on
     * slide 1 while they were looking at a component.
     */
    return editableSurface(doc, slideId);
  }

  private async _insert(
    editor: Editor,
    stype: string,
    payload?: {
      slideId?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      attributes?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    const doc = this._access(editor);
    const slideId = this._slideFor(editor, payload?.slideId);
    if (!doc || !slideId) return false;

    const box = defaultBox(doc.getNode(slideId));
    const geometry = {
      x: typeof payload?.x === 'number' ? payload.x : box.x,
      y: typeof payload?.y === 'number' ? payload.y : box.y,
      width: typeof payload?.width === 'number' ? payload.width : box.width,
      height: typeof payload?.height === 'number' ? payload.height : box.height
    };

    /*
     * The node itself is the canvas layer's (`shapeNode`): the paint that makes it visible, the
     * line's flattening across the middle of its box, and the paragraph *and run* a text box needs
     * — that last one having been the fault twice, because a paragraph with no run draws no caret
     * filler and a new text box was 0 pixels high.
     *
     * A caller that passed its own height means it, so the line keeps that rather than being
     * flattened: a paste and a drag-to-draw have both already decided.
     */
    const child = (
      stype === 'line' && payload?.height !== undefined
        ? {
            stype,
            attributes: { ...geometry, ...SHAPE_PAINT[stype], ...(payload?.attributes ?? {}) }
          }
        : shapeNode(stype, geometry, payload?.attributes ?? {})
    ) as DeckNode;

    const result = await transaction(editor, [
      { type: 'addChild', payload: { parentId: slideId, child } }
    ] as never).commit();

    if (!result.success) return false;

    /**
     * Select what was just made.
     *
     * A shape a reader has to hunt for before they can move it is a shape the
     * tool made them work for. The new node is the slide's last child, which is
     * where `addChild` put it — and which is also the top of the paint order,
     * because document order *is* z-order here.
     */
    const slide = doc.getNode(slideId);
    const children = Array.isArray(slide?.content) ? (slide!.content as string[]) : [];
    const made = children[children.length - 1];
    if (made && isSceneType(doc.getNode(made)?.stype)) {
      (editor as any).setNode?.({ nodeIds: [made] });
    }

    return true;
  }
}

export function createBoxCommands(): SlidesBoxExtension {
  return new SlidesBoxExtension();
}

/** The default a new box gets, exported so a test can state it once. */
export { defaultBox, SLIDE_16_9 };
