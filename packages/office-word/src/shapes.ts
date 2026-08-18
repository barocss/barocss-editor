/**
 * Drawings: the shapes a document can hold that are not pictures.
 *
 * A drawing is a canvas with shapes placed on it by coordinate, which is what
 * SVG is, so the mapping is mostly a rename. What is worth being careful about
 * is the order the transforms apply in and where a rotation turns about: Word
 * and every other drawing tool rotate a shape about its own centre, and SVG
 * rotates about the origin unless told otherwise. A shape that rotated about
 * the corner of the canvas would fly off it.
 *
 * Coordinates are **twips**, like every other length this engine measures, and
 * the canvas is still a box of its own: the view box is the model's own numbers,
 * so a shape at x=1500 is 1500 units from that box's left edge whatever the page
 * is doing. Only the element's CSS size converts.
 *
 * This used to say pixels, and meant it — the argument was that a canvas is a
 * local coordinate system and owes the page nothing, which is true and is not
 * the whole question. The second product settled it: Slides places the same four
 * shape types directly on a surface measured in twips, so the same node type
 * meant two different lengths depending on which parent it had, fifteen apart,
 * with the schema declaring both as plain numbers and neither product
 * disobeying it. See `docs/specs/canvas-model.md`.
 *
 * Word stores these in EMU and an importer converts, the same way it converts
 * everything else.
 */
import { twipToPx, type CssStyle } from './css';

export interface ShapeGeometry {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
}

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export type ShapeAttributes = ShapeGeometry & ShapeStyle & { cornerRadius?: number; d?: string };

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * How a shape is turned, about its own middle.
 *
 * Nothing at all when it is not turned: an identity transform is still a
 * transform, and it makes every shape its own layer to composite.
 */
export function shapeTransform(attrs: ShapeAttributes | undefined): string | undefined {
  const rotation = number(attrs?.rotation, 0);
  if (rotation === 0) return undefined;

  const cx = number(attrs?.x, 0) + number(attrs?.width, 0) / 2;
  const cy = number(attrs?.y, 0) + number(attrs?.height, 0) / 2;
  return `rotate(${rotation} ${cx} ${cy})`;
}

/**
 * Fill and stroke, as SVG wants them.
 *
 * A shape with no fill is not a shape filled with black, which is what SVG
 * would do if left alone — so silence means none, and a document that wants
 * black says black.
 */
export function shapePaint(attrs: ShapeAttributes | undefined): Record<string, string> {
  const paint: Record<string, string> = {
    fill: typeof attrs?.fill === 'string' && attrs.fill ? attrs.fill : 'none'
  };

  if (typeof attrs?.stroke === 'string' && attrs.stroke) {
    paint.stroke = attrs.stroke;
    paint['stroke-width'] = String(number(attrs.strokeWidth, 1));
  }

  const opacity = number(attrs?.opacity, 1);
  if (opacity !== 1) paint.opacity = String(opacity);

  return paint;
}

/** Whether a shape is drawn at all. */
export function isVisible(attrs: ShapeAttributes | undefined): boolean {
  return attrs?.visible !== false;
}

/** A rectangle's own attributes, corner radius included. */
export function rectangleAttrs(attrs: ShapeAttributes | undefined): Record<string, string> {
  const radius = number(attrs?.cornerRadius, 0);
  return {
    x: String(number(attrs?.x, 0)),
    y: String(number(attrs?.y, 0)),
    width: String(number(attrs?.width, 0)),
    height: String(number(attrs?.height, 0)),
    ...(radius > 0 ? { rx: String(radius), ry: String(radius) } : {})
  };
}

/**
 * An ellipse's, which SVG states as a centre and two radii where the document
 * states a box.
 */
export function ellipseAttrs(attrs: ShapeAttributes | undefined): Record<string, string> {
  const width = number(attrs?.width, 0);
  const height = number(attrs?.height, 0);
  return {
    cx: String(number(attrs?.x, 0) + width / 2),
    cy: String(number(attrs?.y, 0) + height / 2),
    rx: String(width / 2),
    ry: String(height / 2)
  };
}

/**
 * A line's, which the document states as a box and SVG as two points.
 *
 * The diagonal of the box, which is what a line drawn by dragging is: the drag
 * starts at one corner and ends at the other.
 */
export function lineAttrs(attrs: ShapeAttributes | undefined): Record<string, string> {
  const x = number(attrs?.x, 0);
  const y = number(attrs?.y, 0);
  return {
    x1: String(x),
    y1: String(y),
    x2: String(x + number(attrs?.width, 0)),
    y2: String(y + number(attrs?.height, 0))
  };
}

/**
 * The canvas the shapes are placed on.
 *
 * A view box of the canvas's own numbers, so the coordinates inside it mean what
 * they say, and a width and height in pixels so the page knows how much room it
 * takes. The paginator measures this like any other block.
 *
 * The conversion is here and nowhere else. The shapes inside keep their raw
 * numbers, because the view box maps them onto whatever size this gives the
 * element — which is why one unit change is one function.
 */
export function canvasCss(attrs: { width?: number; height?: number } | undefined): CssStyle {
  return {
    display: 'block',
    width: `${twipToPx(number(attrs?.width, 0))}px`,
    height: `${twipToPx(number(attrs?.height, 0))}px`,
    overflow: 'hidden'
  };
}

/** The view box for a canvas of that size, in the model's own units. */
export function canvasViewBox(attrs: { width?: number; height?: number } | undefined): string {
  return `0 0 ${number(attrs?.width, 0)} ${number(attrs?.height, 0)}`;
}
