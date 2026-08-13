/**
 * Where a picture sits, and what the text does about it.
 *
 * Word calls this wrapping, and it is the difference between a picture that is a
 * very large character and one the paragraph flows around. The distinction is
 * not decoration: an inline picture moves with the words either side of it and
 * a floating one does not, so which of the two it is decides what happens to
 * every line near it.
 *
 * Most of it maps onto CSS, because CSS grew a float for exactly this — and
 * `tight` maps too, more exactly than it first appears. Word stores tight
 * wrapping as a polygon around the picture, and `shape-outside: polygon()` is
 * the same idea in the same shape; only the units differ. A document that gives
 * one gets a float the text follows the outline of, and one that gives none
 * gets `square`, which is the best answer available from a rectangle.
 */
import { twipToPx } from './css';
import type { CssStyle } from './css';

export type WrapMode = 'inline' | 'square' | 'tight' | 'topAndBottom' | 'behind' | 'front';
export type WrapSide = 'left' | 'right';

export interface ImageAttributes {
  /** Width and height as the document stores them: twips. */
  width?: number;
  height?: number;
  wrap?: WrapMode;
  /** Which side of the picture the text runs down. */
  side?: WrapSide;
  /** How far the text keeps away, in twips. */
  distanceTop?: number;
  distanceBottom?: number;
  distanceLeft?: number;
  distanceRight?: number;
  /** For a picture that is not in the flow, from the top left of its block. */
  offsetX?: number;
  offsetY?: number;
  /**
   * The outline the text follows, for `tight`.
   *
   * Word's own coordinates: a square from 0 to 21600 on each side, whatever the
   * picture's real size, so the outline survives the picture being resized.
   */
  wrapPolygon?: { x: number; y: number }[];
  /** How far the text keeps off the outline, in twips. */
  shapeMargin?: number;
}

/**
 * Word's wrap polygon as a CSS one.
 *
 * The coordinates are a square from 0 to 21600 on each side regardless of the
 * picture's real size — which is exactly what a percentage is, so the conversion
 * is a division and nothing else. Fewer than three points is not an outline, and
 * a float given a degenerate shape wraps nothing at all, so it is left alone to
 * be a rectangle.
 */
const WORD_SHAPE_EXTENT = 21600;

export function polygonCss(points: { x: number; y: number }[] | undefined): string | undefined {
  if (!points || points.length < 3) return undefined;

  const at = (value: number) => `${Math.round((value / WORD_SHAPE_EXTENT) * 10000) / 100}%`;
  return `polygon(${points.map((point) => `${at(point.x)} ${at(point.y)}`).join(', ')})`;
}

const px = (twips: unknown): string | undefined =>
  typeof twips === 'number' && Number.isFinite(twips) ? `${twipToPx(twips)}px` : undefined;

/** The gaps a picture keeps from the text, defaulting to none. */
function distances(attrs: ImageAttributes): CssStyle {
  const gap = (value: number | undefined) => `${twipToPx(typeof value === 'number' ? value : 0)}px`;
  return {
    marginTop: gap(attrs.distanceTop),
    marginBottom: gap(attrs.distanceBottom),
    marginLeft: gap(attrs.distanceLeft),
    marginRight: gap(attrs.distanceRight)
  };
}

/**
 * How a picture is drawn.
 *
 * The size comes first and applies to every mode: a picture with no size is one
 * the browser guesses at, which changes the layout the moment it loads and
 * makes every measurement before that a lie.
 */
export function imageCss(attrs: ImageAttributes | undefined): CssStyle {
  const a = attrs ?? {};
  const size: CssStyle = {};
  const width = px(a.width);
  const height = px(a.height);
  if (width) size.width = width;
  if (height) size.height = height;

  switch (a.wrap) {
    case 'square':
    case 'tight': {
      // A float, which is what makes the lines beside it shorter.
      const shape = a.wrap === 'tight' ? polygonCss(a.wrapPolygon) : undefined;
      return {
        ...size,
        ...distances(a),
        float: a.side === 'left' ? 'left' : 'right',
        // Given an outline, the text follows it rather than the box — which is
        // what separates tight from square, and is the whole of the difference.
        ...(shape
          ? {
              shapeOutside: shape,
              shapeMargin: `${twipToPx(typeof a.shapeMargin === 'number' ? a.shapeMargin : 0)}px`
            }
          : {})
      };
    }

    case 'topAndBottom':
      // No text beside it at all: the paragraph stops above and starts again
      // below, which is what `clear` means.
      return {
        ...size,
        ...distances(a),
        display: 'block',
        clear: 'both'
      };

    case 'behind':
    case 'front':
      // Out of the flow entirely, so no line knows it is there. Positioned from
      // the top left of the block it belongs to, because that is the only
      // origin the document names that the renderer can find without measuring.
      return {
        ...size,
        position: 'absolute',
        left: px(a.offsetX) ?? '0px',
        top: px(a.offsetY) ?? '0px',
        zIndex: a.wrap === 'behind' ? '-1' : '1',
        // A picture nobody is meant to interact with must not eat the clicks
        // meant for the text underneath it.
        ...(a.wrap === 'behind' ? { pointerEvents: 'none' } : {})
      };

    default:
      // In line with the text: a very large character, which is what an image
      // with no wrapping is.
      return { ...size, display: 'inline-block', verticalAlign: 'baseline' };
  }
}

/**
 * Whether a picture is in the flow.
 *
 * The paginator needs to know: a picture in the flow adds height to its block
 * and can push the text onto the next page, and one that is not adds nothing
 * and cannot.
 */
export function isInFlow(attrs: ImageAttributes | undefined): boolean {
  const wrap = attrs?.wrap;
  return wrap !== 'behind' && wrap !== 'front';
}

/**
 * Whether a picture makes the text flow around it.
 *
 * The difference that matters to the paginator is not how it looks but what it
 * does to the lines: a picture the text runs around makes the lines beside it
 * shorter and the ones past it full width again, so how many lines the paragraph
 * has depends on where the picture sits in it. Nothing else in a paragraph does
 * that.
 */
export function wrapsText(attrs: ImageAttributes | undefined): boolean {
  return attrs?.wrap === 'square' || attrs?.wrap === 'tight';
}
