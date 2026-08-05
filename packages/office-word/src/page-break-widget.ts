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
 * Not yet switched on. Measured in a browser, the geometry is right: a paragraph
 * splits where the layout says, no line falls outside a page, the breaks settle
 * rather than drifting, and none of it is copied. What is not right is typing.
 * A character typed into a paragraph carrying a break *is* inserted — the model
 * grows — but the caret is put back where it stood before the keystroke, so the
 * next character lands in front of the last and a word comes out backwards.
 *
 * The cause is in selection preservation across a re-render, not here: the same
 * paragraph types correctly with splitting off, and the model text and the DOM
 * text agree exactly with it on. Ruled out: the widget contributing text (it
 * holds none), the offset index losing the text inside it (lengths match), and
 * repagination running mid-keystroke (deferring it changed nothing).
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
