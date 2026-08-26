/**
 * What a **page** looks like before anybody styles it — the type scale, and nothing else.
 *
 * ## What was wrong, measured
 *
 * A heading on the sample's home page was drawn at **12px**. Not a design decision: Tailwind's
 * preflight resets `h1…h6` to `font-size: inherit`, the app's `body` is `var(--ou-text)`, and a page
 * drawn inside the app inherits the *chrome's* type. Every heading on every board was the size of a
 * panel label, which is most of what "the page looks weak" was.
 *
 * The published page had the opposite fault and the same cause: it carries no scale either, so a
 * browser applied its own — `h1` at 2em with a 21px margin the model never asked for. So **the
 * editor and the visitor disagreed about typography**, which is the one thing export-as-a-render
 * exists to make impossible. Neither of them was wrong about the document; both were reading a
 * ground that came from somewhere else.
 *
 * ## Why it is a string here rather than a CSS file
 *
 * Because two places need the same bytes: the app injects it so a board draws with it, and the
 * export inlines it so a visitor gets it. A file could be imported by one and read by the other, and
 * then there would be two paths for one answer — which is the fault this package spent a week
 * removing from its export.
 *
 * ## Why the sizes shrink with a **container** query
 *
 * A board is 390px wide *inside a 1600px window*, so a media query is false there and true on a
 * phone: the editor would show a phone board with a desktop headline, which is exactly the lie the
 * three boards exist to prevent. A container query asks the page how wide **it** is, which is the
 * same question in both places and the only one that gives the same answer.
 *
 * ## What it deliberately does not do
 *
 * Set a margin on anything. Spacing between blocks is the **stack's** — `gap` — and a page whose
 * paragraphs also carried a browser margin would have two answers for one distance, one of them
 * invisible in the panel. That is the same rule the deck follows for a text box.
 */
export const PAGE_CSS = `
.st-page {
  /*
   * The page's own ground: 16px, which is what a browser means by "text", and a line height a
   * paragraph can be read at. Everything below is relative to this, so a product that wants a
   * larger site changes one number.
   */
  font-size: 16px;
  line-height: 1.65;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif;
  -webkit-font-smoothing: antialiased;
  /* So the sizes below can ask how wide the page is rather than how wide the window is. */
  container-type: inline-size;
  /**
   * The caret, in the tool's accent rather than the text's colour.
   *
   * A browser draws a caret one CSS pixel wide in the colour of the text, and a page on a canvas is
   * drawn at whatever zoom the reader is standing at — so at 70% it is a two-thirds-of-a-pixel grey
   * line in a paragraph of grey lines, which is what "I cannot see the cursor" means. The accent is
   * the one colour on the page that is never the text's, and a caret is the tool speaking rather
   * than the document.
   *
   * The text's own colour would lose it again; a published page has no caret to draw, so this costs
   * a visitor nothing.
   *
   * (Written without back-ticks: this whole stylesheet is a template literal, and one of those in a
   * comment ends it. The build stopped and the suite spent four minutes testing a page that was not
   * there.)
   */
  caret-color: #0F7A5A;
}

.st-page h1,
.st-page h2,
.st-page h3,
.st-page h4,
.st-page h5,
.st-page h6,
.st-page p,
.st-page ul,
.st-page ol,
.st-page li,
.st-page blockquote,
.st-page figure {
  margin: 0;
}

/* A display size: tight, and tracked in, which is what large type needs to stop looking loose. */
.st-page h1 {
  font-size: 2.75rem;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-wrap: balance;
}

.st-page h2 {
  font-size: 1.875rem;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.st-page h3 {
  font-size: 1.25rem;
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.st-page h4 {
  font-size: 1rem;
  line-height: 1.4;
  font-weight: 600;
  letter-spacing: -0.005em;
}

.st-page p {
  /*
   * The measure, and it is a *maximum* rather than a width: a paragraph in a 320px card is as wide
   * as the card, and one in a full-width band stops where a line becomes hard to come back from.
   */
  max-width: 68ch;
  text-wrap: pretty;
}

.st-page ul,
.st-page ol {
  padding-left: 1.25em;
}

.st-page li {
  max-width: 68ch;
}

.st-page li + li {
  margin-top: 0.35em;
}

.st-page a {
  color: inherit;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

/* A picture is as wide as it is given and keeps its shape, which is the one thing every page needs. */
.st-page img {
  display: block;
  max-width: 100%;
}

/*
 * And the same scale, one step down, on a narrow page — asked of the **page**, not of the window.
 *
 * 44px of headline on a 390px board is four words a line and a hyphen in the middle of a name. The
 * two steps are the two boards this product draws beside the widest one.
 */
@container (max-width: 900px) {
  .st-page h1 { font-size: 2.25rem; }
  .st-page h2 { font-size: 1.625rem; }
}

@container (max-width: 560px) {
  .st-page {
    font-size: 15px;
  }
  .st-page h1 { font-size: 1.875rem; letter-spacing: -0.02em; }
  .st-page h2 { font-size: 1.375rem; }
  .st-page h3 { font-size: 1.125rem; }
}
`;
