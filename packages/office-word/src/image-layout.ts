/**
 * Where a picture sits, and what the text does about it.
 *
 * Word calls this wrapping, and it is the difference between a picture that is a
 * very large character and one the paragraph flows around. The distinction is
 * not decoration: an inline picture moves with the words either side of it and
 * a floating one does not, so which of the two it is decides what happens to
 * every line near it.
 *
 * Most of it maps onto CSS, because CSS grew a float for exactly this. What
 * does not map is Word's `tight`, which follows the outline of the picture
 * rather than its box — CSS can do that with `shape-outside`, but only given a
 * shape, and a document that has not supplied one is asking for `square`. That
 * is what it gets, and it is stated here rather than pretended.
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
    case 'tight':
      // A float, which is what makes the lines beside it shorter. `tight`
      // follows the picture's outline in Word and its box here, for want of a
      // shape to follow.
      return { ...size, ...distances(a), float: a.side === 'left' ? 'left' : 'right' };

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
