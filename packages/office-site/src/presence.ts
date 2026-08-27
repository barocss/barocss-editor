/**
 * Whether a block is **on the page**, and whether a reader can pick it up.
 *
 * ## Two words the office schema already had, for a reason a page turned out to share
 *
 * `CANVAS_PRESENCE_ATTRS` declares `visible` and `locked` for things placed on a canvas, and a page
 * places nothing. It needed both anyway — which is the same finding `sizing` produced from the other
 * direction, and the third time these two worlds have turned out to share more than the shape of a
 * coordinate.
 *
 * ## Hiding, and why the editor and the visitor are told different things
 *
 * A hidden block is drawn `display: none` in the editor and is **removed** from the exported page.
 * The difference is deliberate and it is the whole reason this is not one rule:
 *
 * - the **editor** still lists it in 구성 and still shows its properties, because a block a reader
 *   cannot get back to is a block they have lost. Figma, Sketch and Photoshop all do exactly this:
 *   gone from the canvas, present in the list.
 * - the **visitor** should not receive the words of a draft at all. `display: none` still ships
 *   them — to a crawler, to a reader who disables styles, to anyone who opens the source — and a
 *   section a reader hid is a section they did not want published.
 *
 * ## Locking, which is the cheap half
 *
 * Nothing about the drawing changes; only what the overlay hands back when a reader presses. It is
 * what makes a full-width background picture editable at all, because today the only way past one is
 * to find something on top of it and walk up.
 */

/** Whether a node says it is off the page. Silence is *shown*, which is what a document without the field means. */
export function isHidden(attrs: Record<string, unknown> | undefined): boolean {
  return attrs?.visible === false;
}

/** Whether a node says a reader may not pick it up. Silence is *free*. */
export function isLocked(attrs: Record<string, unknown> | undefined): boolean {
  return attrs?.locked === true;
}

/**
 * What a block's presence is, as CSS — which is nothing at all unless it is hidden.
 *
 * An empty object for the ordinary case rather than `display: block`, because every one of these
 * renderers has its own idea of what it is (`flex`, `grid`, whatever a paragraph is) and a presence
 * rule that stated one would be overriding a layout it knows nothing about.
 */
export function presenceCss(attrs: Record<string, unknown> | undefined): Record<string, string> {
  return isHidden(attrs) ? { display: 'none' } : {};
}
