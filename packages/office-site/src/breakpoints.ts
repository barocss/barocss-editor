/**
 * The widths a site is drawn at, and how a view says which one it is.
 *
 * ## Several sizes at once, which is what a site builder *is*
 *
 * A page is not one drawing. A reader designing a site is answering "what does this look like on a
 * phone" while they are still deciding what it says, so the product draws the same page at several
 * widths **side by side** and lets them edit any of them.
 *
 * That is not a new mechanism here. The deck's notes pane is a second `EditorViewDOM` over *the same
 * editor and the same store*, with an env of its own — one history, one selection, no second copy of
 * the text — and this is that, N times. What each view knows that the others do not is which width
 * it is drawing, and it knows it through the env, because **the env is the only per-view channel
 * there is**.
 *
 * ## Why an override cannot live in the content resolver
 *
 * The resolver a placement is drawn through (`setContentResolver`) belongs to the **store**, and the
 * store has one. Every view asks it and every view gets the same answer — which is right for
 * "what does this placement draw" and wrong for "how wide is this card on a phone", because those
 * two views want different answers to the same question at the same instant.
 *
 * So a breakpoint's overrides are resolved where the per-view channel reaches: in the renderers,
 * from the env. This is the same seam Word uses to tell one view it is drawing a header being
 * edited, and the deck uses to tell one view it is the notes pane.
 */

/** The key a site's per-view environment lives under, beside the text environment's own. */
export const SITE_ENV_KEY = 'site';

/**
 * The three a reader actually designs for.
 *
 * Named rather than numbered, because a name is what a reader says — "on mobile" — and the number is
 * a detail that a product may want to change without changing what anybody means. The widths are the
 * common ones and are **CSS pixels**, which is the unit a breakpoint is written in everywhere on the
 * web; the document is still in twips, and the conversion happens where a length is drawn.
 *
 * Each carries the **picture** it is drawn with as well, declared here because which glyph means
 * *tablet* is a fact about the breakpoint rather than about any one control. The panel used to say
 * which width it was writing to with the first syllable of the name — 데 / 태 / 모 — which is not an
 * abbreviation but an unreadable label.
 */
export const BREAKPOINTS = [
  { id: 'desktop', label: '데스크톱', width: 1280, viewport: 800, icon: 'screen-desktop' },
  { id: 'tablet', label: '태블릿', width: 834, viewport: 1112, icon: 'screen-tablet' },
  { id: 'mobile', label: '모바일', width: 390, viewport: 844, icon: 'screen-mobile' }
] as const;

export type BreakpointId = (typeof BREAKPOINTS)[number]['id'];

export interface SiteEnv {
  /** Which width this view is drawing. */
  breakpoint: BreakpointId;
  /** How wide it is, in CSS pixels — what the reader sees along the top of the frame. */
  width: number;
  /**
   * Whether this drawing is **the page a visitor gets** rather than a board a designer is on.
   *
   * One flag, and it exists for exactly one kind of thing: a control that *does* something. A form
   * in the editor has no `action` and its fields are read-only, because a designer pressing Enter in
   * a field they are arranging should not send a stranger a message, and a click on a text box
   * should select the block they meant rather than put a caret in it.
   *
   * Not a general "am I exporting" switch. Every other difference between a board and a published
   * page is a *removal* the export makes afterwards (`clean`), and that is the rule this deliberately
   * does not break: the two drawings agree about everything a reader designed.
   */
  published?: boolean;
}

/**
 * How **tall** a window onto a page of this width is, in CSS pixels.
 *
 * Unused while a reader is building: a board draws the page at whatever height it turns out to be,
 * because the whole point of laying three of them side by side is to compare the *pages*.
 *
 * It is the number preview mode needs, and it is not a made-up one. A page has no height of its own
 * — it is as tall as its content — so what a visitor actually sees is decided by the window they
 * open it in, and the only honest thing a builder can show is a *typical* one: a laptop, a tablet on
 * its side, a phone. These are the three, and a reader who wants a different one is asking for a
 * device list, which is a slice of its own.
 */
export function viewportOf(breakpoint: BreakpointId): number {
  return (BREAKPOINTS.find((one) => one.id === breakpoint) ?? BREAKPOINTS[0]).viewport;
}

/** The environment for a view drawing at one width. */
export function createSiteEnv(breakpoint: BreakpointId, published = false): SiteEnv {
  const found = BREAKPOINTS.find((one) => one.id === breakpoint) ?? BREAKPOINTS[0];
  return { breakpoint: found.id, width: found.width, published };
}

/** Whether the drawing being made is the page a visitor gets — see `SiteEnv.published`. */
export function published(env: Record<string, unknown> | undefined): boolean {
  return (env?.[SITE_ENV_KEY] as SiteEnv | undefined)?.published === true;
}

/** Which width the view being drawn is, or the widest when a host has not said. */
export function breakpointOf(env: Record<string, unknown> | undefined): BreakpointId {
  const site = env?.[SITE_ENV_KEY] as SiteEnv | undefined;
  return site?.breakpoint ?? 'desktop';
}

/**
 * The order narrowest-first, for a resolution that has to ask "and what does the next one up say".
 *
 * A breakpoint override is **not** a separate document: the widest is the page, and a narrower one
 * says only what differs — the same rule a page's own variable follows against the document's
 * (§10h-3). So resolving at 390 asks mobile, then tablet, then the page itself, and the first answer
 * wins. Nothing is copied, and a page edited at one width is edited at all of them except where a
 * reader has deliberately said otherwise.
 */
export function scopesFor(breakpoint: BreakpointId): BreakpointId[] {
  const order: BreakpointId[] = ['mobile', 'tablet', 'desktop'];
  const at = order.indexOf(breakpoint);
  return at < 0 ? ['desktop'] : order.slice(at);
}
