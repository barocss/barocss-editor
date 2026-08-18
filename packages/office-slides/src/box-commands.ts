import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { copyOf, deckSlides, type DeckAccess, type DeckNode } from './deck';
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

/** A quarter of the slide, in the middle of it: what a new shape starts as. */
function defaultBox(slide: DeckNode | undefined): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const size = slideSize(slide?.attributes as never);
  const width = Math.round(size.width / 4);
  const height = Math.round(size.height / 4);
  return {
    x: Math.round((size.width - width) / 2),
    y: Math.round((size.height - height) / 2),
    width,
    height
  };
}

/** What each shape needs beyond a box, so nothing is drawn invisible. */
const DEFAULTS: Record<string, Record<string, unknown>> = {
  // A shape with no fill is a shape nobody can see or click. Word's renderers
  // are right to treat silence as none; a *new* shape is a different question,
  // and the answer a reader expects is "there it is".
  rectangle: { fill: '#2563eb' },
  ellipse: { fill: '#2563eb' },
  // A line has no area, so it needs a stroke instead — and a width, because a
  // hairline at a fraction of a twip is a line nobody can grab.
  line: { stroke: '#1f2937', strokeWidth: 30 },
  // A text box is transparent on purpose: it is put over something most of the
  // time, and a white rectangle behind the words would hide it.
  textFrame: { verticalAlign: 'top' }
};

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

    const steps = chosen.map((entry) => ({
      type: 'removeChild',
      payload: { parentId: slide, childId: entry.sid }
    }));

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

    const steps = chosen.map((entry) => {
      const copy = copyOf(doc, entry.sid)!;
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

    const slides = deckSlides(doc);
    if (slideId) return slides.some((slide) => slide.sid === slideId) ? slideId : undefined;
    return slides[0]?.sid;
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

    /**
     * A line is the one shape whose box is two points rather than an area.
     *
     * Left to right across the middle of the default box, because a line drawn
     * corner to corner of a quarter-slide square reads as a diagonal the reader
     * did not ask for.
     */
    const shaped =
      stype === 'line' && payload?.height === undefined
        ? { ...geometry, y: geometry.y + Math.round(geometry.height / 2), height: 0 }
        : geometry;

    const child: DeckNode = {
      stype,
      attributes: { ...shaped, ...DEFAULTS[stype], ...(payload?.attributes ?? {}) },
      /**
       * A text box needs a paragraph in it.
       *
       * `textFrame` is `block+`, so an empty one is not even legal — and a legal
       * one with no paragraph would still be a box with nowhere to put a caret,
       * which is a box a reader cannot use.
       */
      ...(stype === 'textFrame'
        ? { content: [{ stype: 'paragraph', attributes: {}, content: [] }] }
        : {})
    };

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
