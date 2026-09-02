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
export const BREAKPOINTS: SiteWidth[] = [
  { id: 'desktop', label: '데스크톱', width: 1280, viewport: 800, icon: 'screen-desktop', device: 'laptop' },
  { id: 'tablet', label: '태블릿', width: 834, viewport: 1112, icon: 'screen-tablet', device: 'tablet' },
  { id: 'mobile', label: '모바일', width: 390, viewport: 844, icon: 'screen-mobile', device: 'phone' }
];

/**
 * One width a site is designed at.
 *
 * **A `string` id, not a union of three**, which is the whole change: a reader can add a width, and
 * a type that lists them is a type that says they cannot. What keeps it honest instead is that every
 * id in a document came from a `width` node in that document — see `widthsOf`.
 */
export interface SiteWidth {
  /** What `overrides` keys and boards name. Durable: not renameable once anything uses it. */
  id: string;
  /** What a reader reads. Theirs to change, which is the whole reason it is separate from the id. */
  label: string;
  /** How wide the board is, in CSS pixels. */
  width: number;
  /** How tall a window onto a page of this width is, in CSS pixels — what preview shows. */
  viewport: number;
  /** The picture the panel and the boards draw it with. */
  icon?: string;
  /** The device this width is a window onto, by name — see `DEVICES`. */
  device?: string;
}

export type BreakpointId = string;

/**
 * **The widths this document is designed at**, or the three every site starts with.
 *
 * The list used to be the constant above, so a site with a fourth board — or with two, or whose
 * phone is 360 rather than 390 — was unsayable. Asked for directly, three ways at once: *사이즈를 더
 * 추가할 수도 있지 않을까 / 순서도 바꿀 수 있어야할 듯 / 미리보기에 실제 장치 테두리가*.
 *
 * **The order is the document's**, and that was weighed both ways. It is a fact about how this site's
 * author works rather than about the site — but there is no per-reader store in this product, so a
 * reader-owned order would vanish on reload, and an order that will not stay put is worse than one
 * kept in a slightly wrong place. The published stylesheet does not care: its media queries sort by
 * width regardless, so this order is purely which board sits where.
 *
 * A document that declares none gets the constant, which is what makes every document written before
 * today open unchanged.
 */
export function widthsOf(
  store: { getNode: (sid: string) => Record<string, any> | undefined } | undefined,
  rootSid: string | undefined
): SiteWidth[] {
  if (!store || !rootSid) return BREAKPOINTS;
  const root = store.getNode(rootSid);
  const box = ((root?.content ?? []) as unknown[])
    .filter((sid): sid is string => typeof sid === 'string')
    .map((sid) => store.getNode(sid))
    .find((node) => node?.stype === 'widths');
  if (!box) return BREAKPOINTS;

  const found = ((box.content ?? []) as unknown[])
    .filter((sid): sid is string => typeof sid === 'string')
    .map((sid) => store.getNode(sid))
    .filter((node) => node?.stype === 'width')
    .map((node): SiteWidth | undefined => {
      const attrs = (node!.attributes ?? {}) as Record<string, unknown>;
      const id = String(attrs.name ?? '');
      const size = Number(attrs.size);
      if (!id || !Number.isFinite(size) || size <= 0) return undefined;
      return {
        id,
        label: typeof attrs.label === 'string' && attrs.label ? attrs.label : id,
        width: Math.round(size),
        /* A width that says nothing about the window it is seen in gets a square-ish one. */
        viewport: Number.isFinite(Number(attrs.viewport)) ? Math.round(Number(attrs.viewport)) : Math.round(size),
        icon: typeof attrs.icon === 'string' ? attrs.icon : undefined,
        device: typeof attrs.device === 'string' ? attrs.device : undefined
      };
    })
    .filter((one): one is SiteWidth => !!one);

  /*
   * A `widths` box with nothing usable in it is a document that has said nothing, not a document with
   * no widths: a site with no boards at all is a site nobody can edit, and a reader who deletes the
   * last width has made a mistake rather than a decision.
   */
  return found.length > 0 ? found : BREAKPOINTS;
}

/** The widest, which is the width a node's own attributes **are**. */
export function baseOf(widths: SiteWidth[] = BREAKPOINTS): BreakpointId {
  return [...widths].sort((a, b) => b.width - a.width)[0]?.id ?? 'desktop';
}

/** The widths an override may be written at: every one but the widest, which is the node itself. */
export function overridableIn(widths: SiteWidth[] = BREAKPOINTS): BreakpointId[] {
  const base = baseOf(widths);
  return widths.map((one) => one.id).filter((id) => id !== base);
}

export interface SiteEnv {
  /** Which width this view is drawing. */
  breakpoint: BreakpointId;
  /**
   * And which scopes an override resolves through, narrowest-first — see `scopesOf`.
   *
   * Here rather than computed in the renderer because the order is a fact about the **document's**
   * list of widths, and the env is the only per-view channel there is.
   */
  scopes?: BreakpointId[];
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
export function viewportOf(breakpoint: BreakpointId, widths: SiteWidth[] = BREAKPOINTS): number {
  return (widths.find((one) => one.id === breakpoint) ?? widths[0] ?? BREAKPOINTS[0]).viewport;
}

/** The environment for a view drawing at one width. */
export function createSiteEnv(
  breakpoint: BreakpointId,
  published = false,
  widths: SiteWidth[] = BREAKPOINTS
): SiteEnv {
  const found = widths.find((one) => one.id === breakpoint) ?? widths[0] ?? BREAKPOINTS[0];
  /*
   * **The scopes come with the env**, which is the one channel a per-view answer travels on. A
   * renderer resolving an override needs the order narrowest-first up to the base, and that order is
   * a fact about the *document's* list — which a renderer cannot reach. So it is computed once, here,
   * by the host that knows both.
   */
  return { breakpoint: found.id, width: found.width, published, scopes: scopesFor(found.id, widths) };
}

/** Whether the drawing being made is the page a visitor gets — see `SiteEnv.published`. */
export function published(env: Record<string, unknown> | undefined): boolean {
  return (env?.[SITE_ENV_KEY] as SiteEnv | undefined)?.published === true;
}

/** Which width the view being drawn is, or the widest when a host has not said. */
export function breakpointOf(env: Record<string, unknown> | undefined): BreakpointId {
  const site = env?.[SITE_ENV_KEY] as SiteEnv | undefined;
  return site?.breakpoint ?? baseOf();
}

/**
 * Which scopes a drawing has to ask, narrowest-first — from the env, where the host put them.
 *
 * A renderer cannot compute this: the order is a fact about the *document's* list of widths, and a
 * renderer is handed a node and an env. `createSiteEnv` works it out once per view; this is how the
 * renderer asks for it, with the constant's answer for a host that predates the list.
 */
export function scopesOf(env: Record<string, unknown> | undefined): BreakpointId[] {
  const site = env?.[SITE_ENV_KEY] as SiteEnv | undefined;
  return site?.scopes ?? scopesFor(site?.breakpoint ?? baseOf());
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
export function scopesFor(
  breakpoint: BreakpointId,
  widths: SiteWidth[] = BREAKPOINTS
): BreakpointId[] {
  /*
   * Sorted by width rather than named in an order, which is what made a fourth width possible: the
   * list was `['mobile', 'tablet', 'desktop']`, and a document that added one had nowhere to put it.
   */
  const order = [...widths].sort((a, b) => a.width - b.width).map((one) => one.id);
  const at = order.indexOf(breakpoint);
  return at < 0 ? [baseOf(widths)] : order.slice(at);
}
