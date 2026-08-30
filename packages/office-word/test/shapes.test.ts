import { describe, it, expect } from 'vitest';
import {
  canvasCss,
  canvasViewBox,
  ellipseAttrs,
  frameCss,
  isVisible,
  lineAttrs,
  rectangleAttrs,
  shapePaint,
  shapeTransform
} from '../src/shapes';

/**
 * Turning shapes into SVG.
 *
 * Mostly a rename — a drawing is a canvas with shapes placed by coordinate, and
 * so is SVG. The parts worth pinning are the ones where the two disagree: where
 * a rotation turns about, and what a shape with no fill is.
 */
describe('a frame, as CSS', () => {
  /**
   * The two things a stack could not say, and one of them is on every web page ever made.
   *
   * `alignItems` is the cross axis, so a row could centre its children vertically and had no word
   * for *the mark at one end and the links at the other*. And a padding was one number, so a hero
   * with 96 above and 64 below needed a second stack to hold the difference.
   */
  it('distributes what is left along the axis', () => {
    expect(frameCss({ layoutMode: 'row', justifyContent: 'between' } as never).justifyContent).toBe('space-between');
    expect(frameCss({ layoutMode: 'column', justifyContent: 'center' } as never).justifyContent).toBe('center');
    expect(frameCss({ layoutMode: 'grid', justifyContent: 'evenly' } as never).justifyContent).toBe('space-evenly');
    // The schema's word and CSS's differ, which is why there is a table rather than a pass-through.
    expect(frameCss({ layoutMode: 'row', justifyContent: 'end' } as never).justifyContent).toBe('flex-end');
    expect(frameCss({ layoutMode: 'row' } as never).justifyContent).toBe('flex-start');
  });

  it('writes four sides, each falling back to the one number', () => {
    // 300 twips is 20px; a side that says nothing takes the shorthand rather than zero, which is
    // the whole difference between "no padding here" and "nothing said about here".
    expect(frameCss({ layoutMode: 'column', padding: 300, paddingTop: 1440 } as never).padding).toBe(
      '96px 20px 20px 20px'
    );
    expect(frameCss({ paddingLeft: 1440 } as never).padding).toBe('0px 0px 0px 96px');

    /*
     * And written short when the sides agree, because the browser writes it short: a computed style
     * says `20px`, and a test comparing what the export wrote against what the editor drew was
     * comparing a string the browser had already shortened against one this had not.
     */
    expect(frameCss({ layoutMode: 'row', padding: 300 } as never).padding).toBe('20px');
    expect(
      frameCss({ layoutMode: 'row', paddingTop: 600, paddingBottom: 600, padding: 300 } as never).padding
    ).toBe('40px 20px');
  });
});

describe('turning a shape', () => {
  it('turns it about its own middle', () => {
    // Every drawing tool rotates a shape about its centre. SVG rotates about
    // the origin unless told otherwise, and a shape that did that would swing
    // off the canvas.
    expect(shapeTransform({ x: 10, y: 20, width: 100, height: 40, rotation: 45 })).toBe(
      'rotate(45 60 40)'
    );
  });

  it('says nothing about a shape that is not turned', () => {
    // An identity transform is still a transform, and it makes every shape its
    // own layer to composite.
    expect(shapeTransform({ x: 10, y: 10, width: 10, height: 10 })).toBeUndefined();
    expect(shapeTransform({ rotation: 0 })).toBeUndefined();
    expect(shapeTransform(undefined)).toBeUndefined();
  });
});

describe('painting a shape', () => {
  it('leaves a shape with no fill unfilled', () => {
    // SVG fills with black when left alone, which would turn every outline into
    // a solid.
    expect(shapePaint({}).fill).toBe('none');
    expect(shapePaint({ fill: '#f00' }).fill).toBe('#f00');
  });

  it('only mentions a stroke when there is one', () => {
    expect(shapePaint({ fill: '#fff' }).stroke).toBeUndefined();
    expect(shapePaint({ stroke: '#000' })).toMatchObject({ stroke: '#000', 'stroke-width': '1' });
    expect(shapePaint({ stroke: '#000', strokeWidth: 3 })['stroke-width']).toBe('3');
  });

  it('only mentions opacity when it is not full', () => {
    expect(shapePaint({ opacity: 1 }).opacity).toBeUndefined();
    expect(shapePaint({ opacity: 0.5 }).opacity).toBe('0.5');
  });

  it('draws nothing a document has hidden', () => {
    expect(isVisible({ visible: false })).toBe(false);
    expect(isVisible({})).toBe(true);
    expect(isVisible(undefined)).toBe(true);
  });
});

describe('the shapes themselves', () => {
  const box = { x: 10, y: 20, width: 100, height: 40 };

  it('places a rectangle where the document puts it', () => {
    expect(rectangleAttrs(box)).toEqual({ x: '10', y: '20', width: '100', height: '40' });
  });

  it('rounds the corners of a rectangle only when asked', () => {
    expect(rectangleAttrs({ ...box, cornerRadius: 8 })).toMatchObject({ rx: '8', ry: '8' });
    expect(rectangleAttrs(box).rx).toBeUndefined();
  });

  it('states an ellipse as a centre and two radii, from a box', () => {
    // The document draws a box round it; SVG wants the middle and the reach.
    expect(ellipseAttrs(box)).toEqual({ cx: '60', cy: '40', rx: '50', ry: '20' });
  });

  it('draws a line along the diagonal of its box', () => {
    // Which is what a line drawn by dragging is: it starts at one corner of the
    // drag and ends at the other.
    expect(lineAttrs(box)).toEqual({ x1: '10', y1: '20', x2: '110', y2: '60' });
  });
});

describe('the canvas', () => {
  /**
   * Twips, like every other length. A canvas used to read its numbers as pixels
   * — see the header of `shapes.ts` for the argument that was, and what settled
   * it — so 4500 by 3000 now draws where 300 by 200 used to.
   */
  it('is the size it says, converted once', () => {
    expect(canvasCss({ width: 4500, height: 3000 })).toMatchObject({
      width: '300px',
      height: '200px'
    });
  });

  it('keeps the model’s own numbers in the view box', () => {
    // Which is what lets the shapes inside carry theirs untouched: the view box
    // maps them onto whatever size the CSS gives the element.
    expect(canvasViewBox({ width: 4500, height: 3000 })).toBe('0 0 4500 3000');
  });

  it('takes no room when it declares none', () => {
    // A canvas with no size is not one the paginator should guess at.
    expect(canvasCss(undefined).width).toBe('0px');
    expect(canvasViewBox(undefined)).toBe('0 0 0 0');
  });
});

/**
 * **Hidden, faded and turned** — the three every shape beside a frame drew, and a frame did not.
 *
 * They are on the shared geometry, so a `rectangle`, an `ellipse`, a `line`, a `path` and a
 * `picture` all honour them: `isVisible` and `shapeTransform` are applied to each by name in
 * `renderers/shapes.ts`. A frame took neither, because it is a `<div>` and those two answer in SVG —
 * `display: none` happens to be the same, and a `rotate(deg cx cy)` about a point in the canvas's
 * coordinates is not a CSS `transform` at all.
 *
 * So a reader could hide, fade or turn any box on the canvas **except a frame**, which is the one
 * they are most likely to want to turn: a frame is the box that holds the card.
 */
describe('a frame that is hidden, faded or turned', () => {
  /**
   * **Wearing a layout mode**, which is what the first version of this test did not.
   *
   * It asked `frameCss({ visible: false })` and passed, while a hidden frame in a browser stayed on
   * screen: every layout branch writes its own `display`, so setting it before the switch was setting
   * it and then throwing it away. A frame nobody arranges is not the frame a reader hides.
   */
  it('goes away when the box says it is not visible, whatever it is arranging', () => {
    for (const layoutMode of [undefined, 'none', 'row', 'column', 'grid']) {
      expect(frameCss({ layoutMode, visible: false } as never).display, String(layoutMode)).toBe('none');
    }

    // Absent means visible, which is what every other shape reads too.
    expect(frameCss({ layoutMode: 'row' } as never).display).toBe('flex');
    expect(frameCss({ layoutMode: 'row', visible: true } as never).display).toBe('flex');
    expect(frameCss({} as never).display).toBeUndefined();
  });

  it('fades to the opacity the box asks for', () => {
    expect(frameCss({ opacity: 0.4 } as never).opacity).toBe('0.4');
    // Fully opaque is the default, and writing it out would beat a stylesheet that said otherwise.
    expect(frameCss({ opacity: 1 } as never).opacity).toBeUndefined();
    expect(frameCss({} as never).opacity).toBeUndefined();
  });

  /*
   * About its middle, which is what the SVG version rotates about — `shapeTransform` turns a shape
   * around the centre of its box, and `transform-origin: center` is the same point said in CSS.
   */
  it('turns about its middle', () => {
    const turned = frameCss({ rotation: 45 } as never);

    expect(turned.transform).toBe('rotate(45deg)');
    expect(turned.transformOrigin).toBe('center');
    expect(frameCss({ rotation: 0 } as never).transform).toBeUndefined();
  });
});

