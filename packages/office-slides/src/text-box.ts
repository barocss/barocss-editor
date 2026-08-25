import { twipToPx } from '@barocss/office-text';
import type { CssStyle } from './geometry';

/**
 * Where the text sits inside the box that holds it.
 *
 * Two questions a reader asks of every text box in every tool this product is
 * measured against, and the deck could answer neither: `verticalAlign` was
 * declared on `textFrame` from the day the node existed and read by the
 * renderer, with nothing anywhere that could set it — a title centred in its
 * placeholder was a document you could write by hand and not by editing. The
 * inset did not exist at all, so text with a fill behind it touched its own
 * border.
 *
 * ## Why a module rather than two lines in the renderer
 *
 * They were two lines in the renderer, which is why nothing tested them. The
 * arithmetic is small and the failure is not: a padding without `boxSizing`
 * grows the box past the width the model gave it, so two boxes placed edge to
 * edge overlap by their insets and a slide stops being what the document says.
 * That is a unit test, not a browser round.
 */

interface TextBoxAttrs {
  verticalAlign?: unknown;
  textInset?: unknown;
}

/**
 * Where the text sits when the box is taller than the text is.
 *
 * The frame is a flex column, so this is which end of the column the flow sits
 * against. `center` and `middle` both mean the middle: the schema's word is
 * `middle` for a cell and Word's toolbar says `center`, and a document that says
 * either means the same thing to a reader.
 */
export function verticalAlignCss(attrs: TextBoxAttrs | undefined): CssStyle {
  const value = attrs?.verticalAlign;
  if (value === 'middle' || value === 'center') return { justifyContent: 'center' };
  if (value === 'bottom') return { justifyContent: 'flex-end' };
  return { justifyContent: 'flex-start' };
}

/**
 * The room between the box's edge and the text, on all four sides.
 *
 * `boxSizing` with it, always. The box's width is the model's — a placement, in
 * twips — and padding outside the border box would add to it, so a shape the
 * document says is 4800 wide would draw wider than 4800 by however much room
 * the text was given. Nothing on the slide would be where the document put it.
 *
 * Nothing at all for an inset of zero, which is the default: an empty style is
 * the renderer writing no padding rather than writing `0px`, and it keeps the
 * common case out of the DOM.
 */
export function textInsetCss(attrs: TextBoxAttrs | undefined): CssStyle {
  const value = attrs?.textInset;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return {};
  /**
   * Two decimals. PowerPoint's own 0.1in is 144 twips, which is 9.6px — and in
   * binary is 9.600000000000001, which would be written into the style
   * attribute of every text box in the deck.
   */
  const px = Math.round(twipToPx(value) * 100) / 100;
  return { padding: `${px}px`, boxSizing: 'border-box' };
}

/** Both, in one answer, which is what the renderer asks for. */
export function textBoxCss(attrs: TextBoxAttrs | undefined): CssStyle {
  return { ...verticalAlignCss(attrs), ...textInsetCss(attrs) };
}
