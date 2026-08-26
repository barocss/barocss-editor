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
import { twipToPx, type CssStyle } from '@barocss/office-text';

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

/**
 * Four sides, written the way a person writes them.
 *
 * `0px 0px 0px 0px` and `0px` are the same padding, and the browser says so: it normalises the long
 * form back to the short one in a computed style. Two places compare this — the export writes a
 * media rule and a test asks whether the rule says what the editor drew — and they were comparing a
 * string the browser had already shortened against one this had not.
 */
function shorthand(top: number, right: number, bottom: number, left: number): string {
  if (top === right && right === bottom && bottom === left) return `${top}px`;
  if (top === bottom && right === left) return `${top}px ${right}px`;
  return `${top}px ${right}px ${bottom}px ${left}px`;
}

/**
 * The schema's word for where the children sit along the axis, in CSS's.
 *
 * A table rather than a chain of ternaries because there are six of them now, and because the two
 * vocabularies genuinely differ: `between` is CSS's `space-between`, and a reader of the schema
 * should not have to know that.
 */
const JUSTIFY: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly'
};

/**
 * How a frame draws itself, and how it arranges blocks.
 *
 * A frame is a layout box rather than a drawing, so this is CSS: `flex` for a
 * row or a column, `grid` for a grid, with the gap and the padding the frame
 * declares. Scene children are unaffected — an absolutely positioned child
 * ignores a flex container's placement — which is what lets one node arrange a
 * document's blocks *and* a canvas's shapes without knowing which it holds.
 *
 * Placed like any other scene node when it carries a position, and left to the
 * flow when it does not: a frame in a document is a block among blocks, and a
 * frame on a slide is a box at a coordinate. The same attributes answer both —
 * `width` and `height` are the box's, and `x`/`y` are absent in the flow.
 */
export function frameCss(
  attrs:
    | (ShapeGeometry & ShapeStyle & {
        layoutMode?: string;
        gap?: number;
        padding?: number;
        paddingTop?: number;
        paddingRight?: number;
        paddingBottom?: number;
        paddingLeft?: number;
        alignItems?: string;
        justifyContent?: string;
        columns?: number;
        clipsContent?: boolean;
        cornerRadius?: number;
      })
    | undefined
): CssStyle {
  const css: CssStyle = {
    // Its children's coordinates are measured from it, whichever kind they are.
    position: typeof attrs?.x === 'number' || typeof attrs?.y === 'number' ? 'absolute' : 'relative',
    boxSizing: 'border-box'
  };

  if (typeof attrs?.x === 'number') css.left = `${twipToPx(attrs.x)}px`;
  if (typeof attrs?.y === 'number') css.top = `${twipToPx(attrs.y)}px`;
  if (typeof attrs?.width === 'number') css.width = `${twipToPx(attrs.width)}px`;
  if (typeof attrs?.height === 'number') css.height = `${twipToPx(attrs.height)}px`;

  if (attrs?.clipsContent === false) css.overflow = 'visible';
  else css.overflow = 'hidden';

  // The same number a rectangle states as `rx`, as the CSS corner — see the schema.
  const corner = number(attrs?.cornerRadius, 0);
  if (corner > 0) css.borderRadius = `${twipToPx(corner)}px`;

  /*
   * `backgroundColor`, not the `background` shorthand. A shorthand **resets the image**, and a page
   * paints a gradient and a picture into the same box with longhands (`office-site`'s `paint.ts`) —
   * so whichever of the two was written second silently deleted the other, and which one that was
   * depended on the order of a spread.
   */
  if (typeof attrs?.fill === 'string' && attrs.fill.length > 0) css.backgroundColor = attrs.fill;
  if (typeof attrs?.stroke === 'string' && attrs.stroke.length > 0) {
    css.border = `${twipToPx(number(attrs.strokeWidth, 15))}px solid ${attrs.stroke}`;
  }

  const gap = `${twipToPx(number(attrs?.gap, 0))}px`;

  /**
   * The four sides, each falling back to the one number.
   *
   * Written out rather than as the CSS shorthand with `undefined` holes in it: a frame that states
   * only `paddingTop` means "that at the top, and `padding` everywhere else", and a shorthand built
   * from a missing value is `0` — which reads as a deliberate zero and is not one.
   */
  const side = (own: number | undefined) => twipToPx(number(own ?? attrs?.padding, 0));
  const padding = shorthand(
    side(attrs?.paddingTop),
    side(attrs?.paddingRight),
    side(attrs?.paddingBottom),
    side(attrs?.paddingLeft)
  );

  const align =
    attrs?.alignItems === 'center'
      ? 'center'
      : attrs?.alignItems === 'end'
        ? 'flex-end'
        : // Said out loud, because a page's sections mean it and mapping it to `flex-start` would
          // quietly turn a full-width band into a band as wide as its longest line.
          attrs?.alignItems === 'stretch'
          ? 'stretch'
          : 'flex-start';
  const justify = JUSTIFY[String(attrs?.justifyContent)] ?? 'flex-start';

  switch (attrs?.layoutMode) {
    case 'row':
      return { ...css, display: 'flex', flexDirection: 'row', gap, padding, alignItems: align, justifyContent: justify };
    case 'column':
      return { ...css, display: 'flex', flexDirection: 'column', gap, padding, alignItems: align, justifyContent: justify };
    case 'grid':
      return {
        ...css,
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(1, Math.round(number(attrs?.columns, 2)))}, minmax(0, 1fr))`,
        gap,
        padding,
        alignItems:
          attrs?.alignItems === 'center'
            ? 'center'
            : attrs?.alignItems === 'end'
              ? 'end'
              : attrs?.alignItems === 'stretch'
                ? 'stretch'
                : 'start',
        // A grid distributes its **tracks**, which is what `justify-content` means on one.
        justifyContent: justify
      };
    default:
      return { ...css, padding };
  }
}
