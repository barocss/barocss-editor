import { describe, it, expect } from 'vitest';
import { canvasNode, defaultShapeBox, shapeNode, textWidthOf } from '../src/canvas-insert';
import { canvasAt, isCanvasContainer, type CanvasAccess } from '../src/canvas-access';

/**
 * Making something to place, in the layer both products share.
 *
 * The arithmetic is here because it names no product — "a new rectangle is a quarter of what holds
 * it, in the middle, painted so it can be seen" is as true of a page as of a slide, and the same
 * renderer draws both, so two answers would be one of them being wrong the first time a shape was
 * copied from a deck into a document.
 */
describe('where a new shape starts', () => {
  it('is a quarter of what holds it, in the middle', () => {
    // Not at the pointer: a shape button is pressed in a toolbar, and the pointer is over the
    // toolbar. Under the middle is where every drawing tool puts it and where a reader looks.
    expect(defaultShapeBox({ width: 8000, height: 4000 })).toEqual({
      x: 3000,
      y: 1500,
      width: 2000,
      height: 1000
    });
  });

  it('answers a canvas with no size with nothing rather than NaN', () => {
    // A document is an author's: a canvas that declares no size is one this must not fall over on.
    expect(defaultShapeBox(undefined)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('the node each shape arrives as', () => {
  const box = { x: 100, y: 200, width: 400, height: 300 };

  it('paints a rectangle, or nobody can see what they just made', () => {
    const node = shapeNode('rectangle', box);
    expect(node.attributes).toMatchObject({ ...box, fill: '#2563eb' });
  });

  it('gives a line a stroke and flattens it, because a line has no area', () => {
    const node = shapeNode('line', box);
    // Across the middle of the box: corner to corner would be a diagonal nobody asked for.
    expect(node.attributes).toMatchObject({ x: 100, y: 350, width: 400, height: 0, strokeWidth: 30 });
  });

  it('puts a paragraph *and a run* in a text box', () => {
    /*
     * Both halves matter and the second is the one that gets forgotten: `textFrame` is `block+` so
     * an empty one is not legal, and a paragraph with no run draws no caret filler — which is a box
     * a reader has just asked for, cannot see and cannot click into.
     */
    const node = shapeNode('textFrame', box) as { content?: any[] };
    expect(node.content?.[0]?.stype).toBe('paragraph');
    expect(node.content?.[0]?.content?.[0]).toEqual({ stype: 'inline-text', text: '' });
  });

  it('lets the caller overrule what it computed', () => {
    // A paste and a drag-to-draw both know better than any default here.
    expect(shapeNode('rectangle', box, { fill: '#ef4444' }).attributes?.fill).toBe('#ef4444');
  });
});

describe('how wide a drawing starts', () => {
  it('is as wide as the text is', () => {
    // Word's own defaults — 8.5in × 11in with 1in margins — leave 6.5in of text, and that is
    // exactly how wide a drawing canvas is when Word inserts one.
    expect(textWidthOf(undefined)).toBe(9360);
    expect(textWidthOf({ pageWidth: 11906, marginLeft: 1134, marginRight: 1134 })).toBe(9638);
  });

  it('turns the page over for a landscape section', () => {
    expect(textWidthOf({ orientation: 'landscape', pageWidth: 12240, pageHeight: 15840 })).toBe(12960);
  });

  it('is half as tall as it is wide, which is what a drawing canvas is', () => {
    expect(canvasNode(undefined).attributes).toEqual({ width: 9360, height: 4680 });
    // And the size is *declared*: the renderer draws an <svg> from these numbers so the paginator
    // can measure the block before anything in it is drawn.
    expect(canvasNode(undefined, { width: 4000, height: 1000 }).attributes).toEqual({
      width: 4000,
      height: 1000
    });
  });
});

/**
 * Which container places what is in it — the one question two products answer differently.
 */
describe('the canvas a node is on', () => {
  const doc = (nodes: Record<string, any>): CanvasAccess =>
    ({ rootId: 'root', getNode: (sid: string) => nodes[sid] }) as CanvasAccess;

  const page = () =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['section'] },
      // A Word section: a `surface` whose kind is `flow`, which places nothing.
      section: { sid: 'section', stype: 'surface', attributes: { kind: 'flow' }, content: ['para', 'draw'] },
      para: { sid: 'para', stype: 'paragraph', content: ['run'], parentId: 'section' },
      run: { sid: 'run', stype: 'inline-text', text: 'hello', parentId: 'para' },
      draw: { sid: 'draw', stype: 'canvasBlock', attributes: { width: 9360, height: 4680 }, content: ['rect'], parentId: 'section' },
      rect: { sid: 'rect', stype: 'rectangle', attributes: { x: 0, y: 0 }, parentId: 'draw' }
    });

  it('is the drawing for a shape in a page', () => {
    expect(canvasAt(page(), 'rect')).toBe('draw');
  });

  it('is nothing for text in the flow', () => {
    // A section is not a canvas: its children flow. Answering `section` here would put a rectangle
    // among the paragraphs, which the content model refuses and a reader would not mean.
    expect(canvasAt(page(), 'run')).toBeUndefined();
    expect(isCanvasContainer(page().getNode('section'))).toBe(false);
  });

  it('is the surface itself on a slide', () => {
    const deck = doc({
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['box'] },
      box: { sid: 'box', stype: 'rectangle', attributes: {}, parentId: 'slide' }
    });
    // The same sentence — a container whose children carry coordinates — with the other answer.
    expect(canvasAt(deck, 'box')).toBe('slide');
  });
});
