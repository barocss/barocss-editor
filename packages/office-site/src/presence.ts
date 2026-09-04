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
import { BREAKPOINTS, type BreakpointId, type SiteWidth } from './breakpoints';
import { attrsAt } from './responsive';
import { statesOf } from './states';


/** Whether a node says it is off the page. Silence is *shown*, which is what a document without the field means. */
export function isHidden(attrs: Record<string, unknown> | undefined): boolean {
  return attrs?.visible === false;
}

/**
 * Whether a block is hidden **everywhere** — the question the export actually meant to ask.
 *
 * `isHidden` reads what the block says at its widest, and the export used it to decide what a draft
 * is. Two designs say `visible: false` there and are not drafts at all:
 *
 * - a block shown only on a **phone** — a hamburger is `visible: false` and `{ mobile: { visible:
 *   true } }`, which is the ordinary way a page has two navigations;
 * - a block a visitor **opens** — a menu is not on the page until it is pressed for.
 *
 * Both published as nothing. The hamburger was cut from the markup and its label was left behind
 * empty, so the menu it opened was unreachable at the one width it existed for — measured in the
 * exported sample, in exactly that shape.
 *
 * So the rule is the honest one: a draft is a block hidden at **every** width and in every state.
 * Anything else is a design, and a design ships.
 */
export function neverShown(attrs: Record<string, unknown> | undefined): boolean {
  if (!isHidden(attrs)) return false;
  for (const one of BREAKPOINTS) if (attrsAt(attrs, one.id).visible !== false) return false;
  for (const scope of Object.values(statesOf(attrs))) if (scope.visible === true) return false;
  return true;
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

/**
 * **Which widths this block is on** — the fact two surfaces need and neither could ask for.
 *
 * `isHidden` reads what a node says at its **base** and nothing else, so a hamburger that is
 * `visible: false` with `{ mobile: { visible: true } }` reads as *hidden* — and that is what the
 * layer list has been drawing: a block a reader put there on purpose, marked as though it were a
 * draft, with no way to tell the two apart.
 *
 * `neverShown` asks the other extreme — *hidden everywhere*, which is what a draft is and what the
 * export drops. Between them is the ordinary case and nothing named it.
 *
 * The **list** rather than a sentence, because the two callers want different things from it: the
 * wireframe writes a label (`데스크톱·태블릿만`) and the layer list draws a mark and a count. A
 * function that returned the sentence made the second one parse Korean.
 */
export function shownAt(
  attrs: Record<string, unknown> | undefined,
  widths: SiteWidth[] = BREAKPOINTS
): BreakpointId[] {
  if (!attrs) return widths.map((one) => one.id);
  return widths.filter((one) => attrsAt(attrs, one.id).visible !== false).map((one) => one.id);
}

/**
 * Whether a block is on **some** widths and not others — the case that is a design rather than a
 * draft, and the one a reader has to be able to see.
 */
export function shownSomewhere(
  attrs: Record<string, unknown> | undefined,
  widths: SiteWidth[] = BREAKPOINTS
): boolean {
  const on = shownAt(attrs, widths);
  return on.length > 0 && on.length < widths.length;
}

/**
 * **How many blocks this width does not show** — the number a board's own label can carry.
 *
 * ## Why it walks the definitions too
 *
 * Because a page-level count would say **0 on every page** and be useless: the sample's only two
 * width-conditional blocks are a nav bar and a hamburger, and both live in the header *definition*.
 * A page holds a placement of it, and a placement's children are resolved rather than stored — so a
 * walk of the page reaches neither.
 *
 * Which is the same finding `styledNodes` made about media queries and `wireframeRules` made about
 * its labels, both for the same four blocks. Three walks have now needed it; that it is written a
 * third time here rather than shared is deliberate — each one stops somewhere different (this one
 * counts, the export writes rules, the wireframe names) and a shared walk would take a callback per
 * caller, which is the same code with an indirection.
 *
 * ## And it counts blocks, not drawings
 *
 * One hidden block inside a definition placed on six pages is **one** block. A reader looking at a
 * board wants to know how much of their design this width does not show, and *six* would be counting
 * placements — the same distinction `breaksIfGone` draws about a page's links.
 */
export function hiddenAt(
  doc: { rootId: string; getNode: (sid: string) => Record<string, any> | undefined },
  /** The page (or the definition's part) being drawn — **not** the document. See below. */
  root: string,
  width: BreakpointId,
  widths: SiteWidth[] = BREAKPOINTS
): number {
  let count = 0;
  const seen = new Set<string>();

  const look = (sid: string, depth: number) => {
    if (depth > 64 || seen.has(sid)) return;
    seen.add(sid);
    const node = doc.getNode(sid);
    if (!node) return;

    const attrs = (node.attributes ?? {}) as Record<string, unknown>;
    /*
     * Only the ones this width **misses while another shows them**. A draft — hidden everywhere — is
     * not something a width is failing to show, and counting it here would put the same number on
     * every board and mean nothing.
     */
    if (shownSomewhere(attrs, widths) && !shownAt(attrs, widths).includes(width)) count += 1;

    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') look(child, depth + 1);
    }
  };

  look(root, 0);
  /*
   * And the definitions, because a placement's children are resolved rather than stored — see above.
   * Every definition in the document rather than the ones this page places: a page holds a
   * placement of one, and finding out *which* is the resolution this walk is trying to avoid doing.
   * The cost of the wider answer is a definition nothing on this page places, which is a definition
   * the reader is about to place or has just stopped placing.
   */
  for (const child of (doc.getNode(doc.rootId)?.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const node = doc.getNode(child);
    if (node?.stype === 'component') look(child, 0);
    else if (node?.stype === 'components') {
      for (const one of (node.content ?? []) as unknown[]) {
        if (typeof one === 'string' && doc.getNode(one)?.stype === 'component') look(one, 0);
      }
    }
  }
  return count;
}
