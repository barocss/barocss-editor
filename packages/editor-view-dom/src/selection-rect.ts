/**
 * **Where the selection is on screen** — the rectangle a floating surface is placed against.
 *
 * ## What could not be built without it
 *
 * A selection toolbar and a `/` menu are the two surfaces every editor of this kind has and this one
 * had neither. Not because they are hard: the parts have been here all along, in four layers, three
 * of which were finished —
 *
 * - **what a menu offers** is a declaration, the shape `toolbar-model.ts` and `keymap.ts` have;
 * - **when it is open and where the reader is in it** is a command and a piece of state;
 * - **what it looks like** is `office-ui`, which three products already theme by;
 * - **where it goes** is this, and nothing published it.
 *
 * `DOMQuery.calculateTextPosition` has answered it since the decorator system was written and is
 * reachable only from inside that system. So the fourth layer was the one nobody could reach, and a
 * surface needing all four could not be built by a product at all — which is why the two that
 * existed were built **inside a model package**, drawing their own DOM, installed by nobody.
 *
 * ## Which editor's selection
 *
 * A window has one selection and a page may hold several editors. `EditorViewDOM.selectionRect()`
 * passes its own content layer, so a view answers only for words inside it.
 *
 * A product drawing the **same document at several widths** passes something that holds them all —
 * the site builder makes one view per board and draws three at once, and the reader is typing in
 * exactly one of them. Asking each view in turn would work and would be three answers to a question
 * with one; the root that contains all three is the honest argument.
 *
 * ## Viewport coordinates, and why not the content layer's
 *
 * A floating surface is drawn by the **app**, in its own overlay, over boards it may have scaled and
 * panned. Coordinates relative to a content layer would make every caller undo a transform this
 * knows nothing about. `getBoundingClientRect`'s frame is the one both ends already share.
 *
 * ## A range, not a caret
 *
 * `getClientRects()` rather than the range's bounding box, because a selection that wraps across
 * lines has a box covering the whole paragraph — and a toolbar centred on *that* sits in the middle
 * of the text rather than above the words. The **first** rectangle is the line the selection starts
 * on, which is where every tool of this kind puts it.
 */
export function selectionRectIn(root: Element | Document | null): DOMRect | null {
  const dom = typeof window === 'undefined' ? null : window.getSelection();
  if (!dom || dom.rangeCount === 0) return null;

  const range = dom.getRangeAt(0);
  if (root && !root.contains(range.commonAncestorContainer)) return null;

  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0];

  /*
   * A collapsed caret has no rectangles of its own between two characters, so the range is asked for
   * its own box — which for a caret is a zero-width rectangle in the right place.
   */
  const box = range.getBoundingClientRect();
  return box.width === 0 && box.height === 0 ? null : box;
}
