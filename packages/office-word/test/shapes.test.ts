import { describe, it, expect } from 'vitest';
import {
  canvasCss,
  canvasViewBox,
  ellipseAttrs,
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
  it('is the size it says, and its coordinates mean what they say', () => {
    expect(canvasCss({ width: 300, height: 200 })).toMatchObject({
      width: '300px',
      height: '200px'
    });
    expect(canvasViewBox({ width: 300, height: 200 })).toBe('0 0 300 200');
  });

  it('takes no room when it declares none', () => {
    // A canvas with no size is not one the paginator should guess at.
    expect(canvasCss(undefined).width).toBe('0px');
    expect(canvasViewBox(undefined)).toBe('0 0 0 0');
  });
});
