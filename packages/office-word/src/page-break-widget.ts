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
 * Not yet switched on, and the reason is churn rather than geometry. Measured in
 * a browser: a paragraph splits where the layout says, no line falls outside a
 * page, the breaks settle rather than drifting, and none of it is copied.
 *
 * What is not right is typing into a paragraph that carries one. Replacing the
 * break decorators re-renders the paragraph, and a long paragraph re-renders as
 * hundreds of DOM mutations — 262 for a single keystroke, measured. The
 * MutationObserver reads those as user input, resolves them to the section
 * rather than to the text node, and skips the change; the character is inserted
 * but the caret never advances, so the next one lands in front of it and a word
 * comes out backwards.
 *
 * The fix is to stop replacing decorators that have not moved, and to keep the
 * observer from reading a renderer's own mutations as input. Both are about the
 * churn, not about this widget: with splitting off the same paragraph types
 * correctly, and the widget holds no text for anything to misread.
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
