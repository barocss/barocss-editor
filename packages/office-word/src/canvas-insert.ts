/**
 * Making something to place: a drawing, and the shapes that go on it.
 *
 * ## Why this is in the canvas layer rather than in a product
 *
 * "A new rectangle is blue, a quarter of what holds it, in the middle" names no product — and two
 * products disagreeing about it is not a design choice they each get to make, because the *same
 * renderer* draws both and a shape copied from a deck into a document would change colour on the
 * way. `docs/SHARED-LAYER.md`'s test, answered the same way `canvas-layout` was.
 *
 * The deck had all of this and a page had none of it, which is the state this file was written to
 * end: Word's schema declares a canvas (`canvasBlock` holds `scene*`), the renderers draw it,
 * `canvas-layout` arranges it and the paginator measures it — and no command made one.
 *
 * ## What is *not* here
 *
 * Where the new thing goes in the document. A deck puts a shape on the surface the reader is
 * looking at; a page puts a drawing after the block the caret is in, and the shape inside *that*.
 * Those are two answers to "where am I", which is the one question a product must answer for
 * itself — so each product's command does that walk and calls these for the rest.
 */
import type { CanvasNode } from './canvas-access';

/** A box on a canvas, in the model's own units. */
export interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What each shape needs beyond a box, so nothing is drawn invisible.
 *
 * Word's renderers are right to treat silence as "no fill" — a document that says nothing about a
 * shape's paint has not asked for one. A *new* shape is a different question, and the answer a
 * reader expects after pressing a button is "there it is".
 */
export const SHAPE_PAINT: Record<string, Record<string, unknown>> = {
  rectangle: { fill: '#2563eb' },
  ellipse: { fill: '#2563eb' },
  // A line has no area, so it needs a stroke instead — and a width, because a hairline at a
  // fraction of a twip is a line nobody can grab.
  line: { stroke: '#1f2937', strokeWidth: 30 },
  // A text box is transparent on purpose: it is put over something most of the time, and a white
  // rectangle behind the words would hide it.
  textFrame: { verticalAlign: 'top' },
  /**
   * A frame arrives empty, so it has to be visible as itself: it is a *container*, what a reader
   * does with it is drag things into it, and a container with no fill and no outline is a box
   * nobody can find, select or drop anything onto. A real fill and not only an outline, or a click
   * in the middle would fall straight through it.
   */
  frame: { fill: '#f1f5f9', stroke: '#94a3b8', strokeWidth: 15 }
};

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * A quarter of what holds it, in the middle: what a new shape starts as.
 *
 * What every drawing tool does, and what a reader expects to find under the pointer they just
 * clicked with — **not** at the pointer, because a shape button is pressed in a toolbar and the
 * pointer is over the toolbar. A caller that knows better (a paste, a drag-to-draw) passes its own
 * box and this computes nothing.
 */
export function defaultShapeBox(canvas: { width?: unknown; height?: unknown } | undefined): CanvasBox {
  const across = number(canvas?.width, 0);
  const down = number(canvas?.height, 0);
  const width = Math.round(across / 4);
  const height = Math.round(down / 4);
  return {
    x: Math.round((across - width) / 2),
    y: Math.round((down - height) / 2),
    width,
    height
  };
}

/**
 * A shape as a document holds it: a box, the paint that makes it visible, and — for the two that
 * need it — something inside.
 */
export function shapeNode(
  stype: string,
  box: CanvasBox,
  extra: Record<string, unknown> = {}
): CanvasNode {
  /*
   * A line is the one shape whose box is two points rather than an area.
   *
   * Left to right across the middle of the box, because a line drawn corner to corner of a
   * quarter-sized square reads as a diagonal the reader did not ask for.
   */
  const placed: CanvasBox =
    stype === 'line' ? { ...box, y: box.y + Math.round(box.height / 2), height: 0 } : box;

  const node: CanvasNode & { content?: unknown } = {
    stype,
    attributes: { ...placed, ...(SHAPE_PAINT[stype] ?? {}), ...extra }
  };

  /**
   * A text box needs a paragraph in it, and the paragraph needs a **run**.
   *
   * `textFrame` is `block+`, so an empty one is not even legal — and a legal one with no paragraph
   * would still be a box with nowhere to put a caret. The empty run is the second half and is the
   * half that gets forgotten: the caret filler is what gives an empty line its height and it is
   * drawn for an empty `inline-text`, so a paragraph with no run at all is a box a reader has just
   * asked for, cannot see and cannot click into.
   */
  if (stype === 'textFrame') {
    node.content = [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '' }] }];
  }

  return node;
}

/** The page setup a drawing takes its width from. */
export interface PageWidth {
  pageWidth?: unknown;
  marginLeft?: unknown;
  marginRight?: unknown;
  orientation?: unknown;
  pageHeight?: unknown;
}

/**
 * How wide the text is, which is how wide a drawing starts.
 *
 * Word's own defaults — 8.5in × 11in with 1in margins — leave 6.5in of text, and a drawing canvas
 * inserted into a document is exactly that wide there. Taken from the section rather than assumed,
 * because a reader working on A4 in landscape has a different answer and a drawing that overhung
 * the margin would be the first thing they noticed.
 *
 * Columns are deliberately not divided out: a drawing in a two-column section is a question about
 * what a canvas *is* in a column, and taking a guess here would answer it silently.
 */
export function textWidthOf(page: PageWidth | undefined): number {
  const landscape = page?.orientation === 'landscape';
  const across = landscape ? number(page?.pageHeight, 15840) : number(page?.pageWidth, 12240);
  const left = number(page?.marginLeft, 1440);
  const right = number(page?.marginRight, 1440);
  return Math.max(720, Math.round(across - left - right));
}

/**
 * A drawing as a document holds it: an empty canvas of a declared size.
 *
 * **Declared**, and that is not a detail: the renderer draws an `<svg>` sized from these numbers so
 * the paginator can measure the block before anything inside it is drawn. A canvas that grew to fit
 * its contents could not be laid out until it had been.
 *
 * Half as tall as it is wide, which is what Word's own drawing canvas is at default margins
 * (6.5in × 3.25in) — a shape of room to draw in rather than a square hole in the page.
 */
export function canvasNode(page: PageWidth | undefined, size?: { width?: number; height?: number }): CanvasNode {
  const width = number(size?.width, textWidthOf(page));
  const height = number(size?.height, Math.round(width / 2));
  return { stype: 'canvasBlock', attributes: { width, height }, content: [] } as CanvasNode;
}
