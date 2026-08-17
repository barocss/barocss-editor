import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { deckSlides, type DeckAccess, type DeckNode } from './deck';
import { SLIDE_16_9, slideSize } from './geometry';
import { isSceneType } from './selection';

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
