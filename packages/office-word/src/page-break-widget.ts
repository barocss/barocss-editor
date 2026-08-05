/**
 * The page break that falls inside a paragraph.
 *
 * Everything else the layout does moves whole blocks, which a top margin can
 * express. This one has to put space *between two lines of one block*, and a
 * margin has nowhere to go — the block is a single element and the break is in
 * the middle of it.
 *
 * So it is drawn as a widget at a text offset: an empty inline-block as wide as
 * the line and as tall as the gap. Empty is what makes it safe. It contributes
 * no text node, so nothing that reads text — the offset index the input path is
 * built on, the classifier that decides whether a DOM change came from the user
 * — sees it at all.
 *
 * Not yet switched on. The geometry is right, measured in a browser: a paragraph
 * splits where the layout says, no line falls outside a page, the breaks settle
 * rather than drifting, and none of it is copied. Typing into a paragraph that
 * carries one is not: the character is inserted but the caret stays put, so the
 * next lands in front of it and a word comes out backwards.
 *
 * It is the churn, not the widget. A break sits at a text offset, so typing
 * above it moves it, so the widget is replaced on every keystroke. Measured
 * decisively: a break added once and never replaced types perfectly.
 *
 * Ruled out along the way — the widget disturbing the offset index (it holds no
 * text, and the model and DOM lengths match exactly), several text nodes in a
 * run (a run split by a *mark* types correctly), and deferring repagination
 * while typing (no effect).
 *
 * Getting here took tracing the caret to two places that both decided where it
 * goes: the operation set it, and the insert path recomputed it from a range
 * that was one behind and overwrote the answer — so every character landed at
 * the same offset and a word arrived backwards. That is fixed in
 * editor-view-dom, where the decision now has one owner.
 *
 * Ruled out along the way, each by measurement: the widget contributing text (it
 * holds none, and the model and DOM texts are identical), several text nodes in
 * a run (a run split by a mark types correctly), the widget itself (one added
 * and never replaced typed perfectly — it was the replacing), the storm of
 * renderer mutations (a keystroke now arrives among 2 rather than 262), and
 * deferring repagination while typing.
 */
import { defineDecorator, element } from '@barocss/dsl';

/** The decorator type a page break is registered under. */
export const PAGE_BREAK_STYPE = 'wordPageBreak';

/**
 * Register the renderer for a mid-paragraph page break.
 *
 * Idempotent, so a second editor on the page does not double register.
 */
export function registerPageBreakWidget(): void {
  defineDecorator(
    PAGE_BREAK_STYPE,
    element('span', {
      className: 'w-page-break',
      // Chrome, on every count: not copied, not typed into, not selected, and
      // not in the way of a click meant for the text.
      'data-bc-chrome': 'true',
      contenteditable: 'false',
      'aria-hidden': 'true',
      // The gap comes from the decorator's own data: how far the text after the
      // break has to fall is a fact about where this break is, not about breaks.
      style: (data: Record<string, any>) => ({
        display: 'inline-block',
        // Full width so the text after it starts on a new line, and vertical-
        // align top so the line box it creates is exactly the gap and not the
        // gap plus a line of leading.
        width: '100%',
        verticalAlign: 'top',
        userSelect: 'none',
        pointerEvents: 'none',
        height: `${Number(data?.height) || 0}px`
      })
    })
  );
}
