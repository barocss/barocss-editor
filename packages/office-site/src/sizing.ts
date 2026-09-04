/**
 * What a stack's child means to do with the space along the axis.
 *
 * ## Why this had to be said, when nothing else did
 *
 * Every other question a site builder asks was already answered somewhere in this repository. This
 * one was not, and the reason is worth writing down: **silence already means two different things.**
 * A `<div>` with no width hugs its content; the same `<div>` as a flex child fills the axis if it is
 * told to grow and hugs if it is not. So "no width stated" cannot be read as an intent — it is the
 * absence of one, and the browser's default depends on where the box happens to be.
 *
 * Three answers, which is what every layout tool offers because there are three:
 *
 * - **fill** — take the space the stack has left. `flex: 1` along the axis, plus `min-width: 0` so a
 *   long word cannot push a row wider than its container, which is the single most common way a
 *   flex row breaks and the reason `minWidth` is a separate attribute rather than this.
 * - **hug** — be as wide as what is inside. `width: fit-content`, and `flex: 0 0 auto` so a stack
 *   does not stretch it back.
 * - **fixed** — the width the node states, which is what a placed box has always meant. Written as
 *   `flex: none` so the stack leaves it alone.
 *
 * Silence keeps meaning silence: a node that says nothing gets no sizing CSS at all, and the page
 * draws exactly as it did before this attribute existed.
 *
 * ## Twips, here as everywhere
 *
 * `minWidth` and `maxWidth` are lengths in the model's own unit, converted once. A site builder is
 * the first product where a reader types a *pixel* — the web's unit — and that conversion belongs in
 * the panel that reads it, not here: one unit in the document is what has kept a slide, a page and a
 * card able to hold each other's boxes.
 */

/** Pixels per twip at 96dpi — exact, which is why placement never drifts. */
const PX_PER_TWIP = 96 / 1440;

const px = (twips: number): string => `${Math.round(twips * PX_PER_TWIP * 100) / 100}px`;

/** A length already in CSS pixels — `minScreens` counts screens, not twips. */
const px2 = (pixels: number): string => `${Math.round(pixels * 100) / 100}px`;

export interface Sized {
  sizing?: unknown;
  /** Where in its stack it is drawn, when it is not where it is in the tree — see `sizingCss`. */
  order?: unknown;
  /** How many shares of the row this one takes, when `sizing` is `share` — see the switch. */
  share?: unknown;
  minWidth?: unknown;
  maxWidth?: unknown;
  minHeight?: unknown;
  maxHeight?: unknown;
  minScreens?: unknown;
  /**
   * **How many columns of a grid this one takes** — the attribute a grid had no way to say.
   *
   * A `grid` lays its children out in equal columns, which is right and is also why every grid this
   * product has made is a page of identical tiles. A bento is one card across two columns beside two
   * across one, and without this the only way to get one is a second grid inside the first — which
   * is a different row height and a different gap, so it never lines up.
   *
   * Silence is one column, which is what every existing page already draws. Ignored outside a grid:
   * `grid-column` on a flex child means nothing, and a child that states it in a row is a reader
   * who moved a block, not an error worth refusing.
   */
  span?: unknown;
  /** Whether this block sits in the middle of what holds it — see `sizingCss`. */
  centred?: unknown;
}

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** The CSS a child's own intent becomes. Empty when it states none. */
export function sizingCss(
  attrs: Sized | undefined,
  /**
   * **Whether the stack this sits in scrolls sideways**, which changes what Fill can mean.
   *
   * Fill is *take the space the stack has left* — and a scrolling row has no space left to take: its
   * children decide how wide it is, not the other way round. A card that says Fill inside one shrinks
   * to nothing and the scroll has nothing to scroll.
   *
   * Passed in rather than read from the node, because it is the **parent's** decision and a node
   * cannot see whose child it is. The first attempt was a stylesheet rule with an important flag,
   * which the browser suite refused and was right to: a published page carries none, because a page a
   * reader cannot restyle with their own CSS is not theirs. And an ordinary rule cannot win, because
   * this is written inline.
   */
  inScrollingRow = false,
  /**
   * **How tall one screenful is here**, in CSS pixels — or nothing, meaning *let the browser say*.
   *
   * The one thing `minScreens` needs that a stylesheet cannot supply. On a published page a screen is
   * `100dvh` and the browser knows it; a board in the editor is a `div` on a plane, so `dvh` inside
   * one is the height of the **editor's window** and the same page would draw a different height on
   * three boards that differ only in width. `screenOf` reads the board's own viewport — see
   * `breakpoints.ts`, where that number has been declared since preview mode.
   */
  screenPx?: number
): Record<string, string> {
  const css: Record<string, string> = {};

  /**
   * **몇 번째로 놓일지**, and it is written before every other branch because it is true of all of
   * them: a scrolling row, a grid and an ordinary stack all lay their children out in order, and
   * `order` is the one thing that changes which order that is.
   *
   * Written **only when the node says one**, which is the whole subtlety: `order: 0` is a real CSS
   * value that puts a child before every positive one, so writing 0 for silence would make one block
   * saying `order: 1` send every other block in the page in front of it — a document saying
   * something nobody wrote.
   */
  const order = attrs?.order;
  if (typeof order === 'number' && Number.isFinite(order)) css.order = String(Math.trunc(order));

  if (inScrollingRow) {
    /*
     * Its content's width, and it does not shrink. Which is what every card in a swipeable strip
     * wants and is the only shape that leaves anything to scroll.
     */
    css.flex = '0 0 auto';
    if (attrs?.maxWidth === undefined) css.width = 'max-content';
    if (typeof attrs?.maxWidth === 'number') css.maxWidth = `${Math.round((attrs.maxWidth * 96) / 1440)}px`;
    if (typeof attrs?.minWidth === 'number') css.minWidth = `${Math.round((attrs.minWidth * 96) / 1440)}px`;
    if (typeof attrs?.minHeight === 'number') css.minHeight = `${Math.round((attrs.minHeight * 96) / 1440)}px`;
    return css;
  }

  switch (attrs?.sizing) {
    case 'fill':
      css.flex = '1 1 0%';
      /*
       * The line that makes a row of cards survive a long word. A flex item's `min-width` is `auto`,
       * which means "at least as wide as my content" — so one unbreakable string in one card pushes
       * every other card narrower and the row past its container. Every layout tool sets this and
       * none of them mentions it.
       */
      css.minWidth = '0';
      break;
    case 'share': {
      /**
       * **This many shares of what is left**, which is how a page divides a row.
       *
       * `flex: <n> 1 0%` — grow by n, shrink, and start from nothing. Starting from nothing is the
       * half that makes it a share rather than a nudge: with `flex-basis: auto` the content's own
       * width is taken out first, so two blocks at 1 and 2 come out 55/45 when one holds a long word.
       *
       * A share and not a percentage, and the arithmetic is why: 40% + 60% is the whole row and the
       * gap between them is not, so a percentage row overflows by exactly the gap. Shares divide what
       * is left **after** the gaps and the padding.
       */
      const many = number(attrs?.share);
      css.flex = `${many !== undefined && many > 0 ? many : 1} 1 0%`;
      /* The same reason `fill` says it: a flex item's `min-width` is its content unless told. */
      css.minWidth = '0';
      break;
    }
    case 'hug':
      css.flex = '0 0 auto';
      css.width = 'fit-content';
      break;
    case 'fixed':
      // The width the node already states; the stack is told not to stretch or shrink it.
      css.flex = 'none';
      break;
    default:
      break;
  }

  const span = number(attrs?.span);
  if (span !== undefined && span > 1) css.gridColumn = `span ${Math.min(12, Math.round(span))}`;

  const min = number(attrs?.minWidth);
  const max = number(attrs?.maxWidth);
  if (min !== undefined) css.minWidth = px(min);
  if (max !== undefined) css.maxWidth = px(max);

  /**
   * **Centred in whatever holds it** — the page pattern this model could not say.
   *
   * A band across the window with a column of reading measure inside it is the layout every page on
   * the web is made of, and it worked here only by accident: the band centred its child, and a flex
   * child that is centred is **as wide as its content**. So a section whose widest block was a row
   * of cards began at the page margin and one whose widest block was a paragraph began 225px
   * further in — three different left edges for seven headings of one page, which is what a reader
   * sees as *broken* without being able to name it.
   *
   * Auto side margins say it properly, at every window width including the ones wider than the cap.
   *
   * **Stated rather than inferred**, and the first attempt is why: deriving it from *has a maximum*
   * centred the reading measure inside the column too, and pushed every heading on the page into
   * the middle. A cap says how wide, and it does not say where — those are two decisions and the
   * document has to make both.
   */
  if (attrs?.centred === true) {
    css.marginInline = 'auto';
    /*
     * **And a width**, because auto side margins alone make it *narrower*.
     *
     * A flex child stretches across the cross axis until it is given a side margin, and an `auto`
     * one wins over the stretch — so the column shrank to its content and centred that, which is
     * the same wrong answer as before by a different route. Measured, twice: `margin-inline: auto`
     * put a section's column at 297 where the page margin is 72.
     *
     * The cap still applies, so this is the ordinary three-line centring every stylesheet on the
     * web writes, said as one attribute.
     */
    css.width = '100%';
  }

  /**
   * And **how tall**, which this schema could not say at all.
   *
   * ## Why the absence was not an omission, and why it stopped being defensible
   *
   * A page is a column and a column's height is its content's — that is the whole argument for
   * leaving height out, and it is a good one right up to the first block whose height *is* the
   * design. Five of them, all found the same way:
   *
   * - a **divider**, which is a box 2 pixels tall;
   * - a **spacer**, which is a box and nothing else;
   * - a **banner** of a stated height with a picture behind it;
   * - a **hit area** — a control that must be 44 tall whatever is written in it;
   * - and the one that forced it: a hamburger is three lines 2 pixels tall, and this product had to
   *   draw one as an SVG because it could not say *2*.
   *
   * ## Why min and max rather than `height`
   *
   * The same shape as the width pair, and for the same reason a reader has already learned: a stated
   * `height` is a promise a box cannot keep — put more words in it and either they spill out or they
   * are cut off, and both are the tool lying about what will happen. `minHeight` is *at least this
   * tall, and taller if it has to be*, which is what a banner and a hit area both actually mean; the
   * pair together says exactly the height, for the cases that want exactly the height.
   *
   * A stack that says `minHeight` and holds a column also wants that height to be usable by its
   * children — `alignItems: stretch` already does that, and it is this product's default.
   */
  const minTall = number(attrs?.minHeight);
  const maxTall = number(attrs?.maxHeight);
  /**
   * And **화면 높이**, the one relative length the document can say — see `site-schema.ts` for why it
   * is a number of screens rather than a unit on a length.
   *
   * `dvh` rather than `vh`: `100vh` on a phone is the window with the address bar *gone*, so a
   * section meant to fill the screen is taller than the screen and the page scrolls by the height of
   * the browser chrome, on the first screenful, which is the one nobody can miss.
   *
   * **`max()` when a block says both**, rather than one silently winning. A hero that is at least a
   * screen tall *and* at least 400 tall means both — on a laptop in a short window the second one is
   * what keeps it from collapsing. CSS takes one `min-height`, so the two are combined rather than
   * ordered, which is also the only reading under which neither row in the panel is a lie.
   */
  const screens = number(attrs?.minScreens);
  const tallest =
    screens === undefined || screens <= 0
      ? undefined
      : screenPx !== undefined
        ? px2(screens * screenPx)
        : `${screens * 100}dvh`;

  if (tallest !== undefined && minTall !== undefined) css.minHeight = `max(${px(minTall)}, ${tallest})`;
  else if (tallest !== undefined) css.minHeight = tallest;
  else if (minTall !== undefined) css.minHeight = px(minTall);
  if (maxTall !== undefined) css.maxHeight = px(maxTall);

  return css;
}
