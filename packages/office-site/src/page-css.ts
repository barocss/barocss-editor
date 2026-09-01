import { CODE_CSS } from './code-render';
import { REVEAL_KEYFRAMES } from './reveal';

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
export const PAGE_CSS =
  CODE_CSS +
  /*
   * The five ways a block can arrive, once for the whole page: a hundred sections choosing the same
   * one share the definition, and what differs per block is only which of these it names.
   */
  REVEAL_KEYFRAMES +
  `
.st-page {
  /*
   * The page's own ground: 16px, which is what a browser means by "text", and a line height a
   * paragraph can be read at. Everything below is relative to this, so a product that wants a
   * larger site changes one number.
   */
  /*
   * Read from the **document** now, with the old values as the fallback — so a page whose document
   * says nothing is drawn exactly as it was, and a site that says something is set in it everywhere
   * at once. type-scale.ts writes the properties; nothing here knows what they are.
   *
   * No backticks in this comment, and that is not a style choice: everything below is inside a
   * template literal, so one would end the stylesheet in the middle of a sentence. It did.
   */
  font-size: var(--st-base, 16px);
  line-height: 1.65;
  font-family: var(
    --st-body-face,
    ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    'Apple SD Gothic Neo',
    sans-serif
  );
  -webkit-font-smoothing: antialiased;
  /*
   * **Korean does not break inside a word**, and a browser's default says it does.
   *
   * Measured on this sample's own headline, which wrapped as 세 가 / 지를 - a word split across two
   * lines at the point a Latin-first default thought was fine. CSS calls the fix keep-all, and every
   * Korean site sets it; a page builder that does not is a page builder whose every headline in this
   * language is wrong and whose author cannot see why.
   *
   * Paired with overflow-wrap, so a single unbreakable string - a URL, an id - still breaks rather
   * than pushing the column wider than the page. Without the pair, keep-all trades one bad wrap for
   * a horizontal scrollbar.
   */
  word-break: keep-all;
  overflow-wrap: anywhere;
  /**
   * **Spaces are text.**
   *
   * HTML collapses a run of them to one and drops a trailing one entirely, which is right for markup
   * a person wrote by hand and wrong for every editor: typing two spaces between words showed one,
   * and a space at the end of a paragraph did not appear at all — the caret simply refused to move.
   *
   * office-text has said this since it was written, on the **word** document's own wrapper. A page
   * is a different element and inherits nothing from it, so the site builder had the browser default
   * and the two products behaved differently at the most basic keystroke there is.
   *
   * pre-wrap rather than pre: runs of spaces and trailing spaces are kept, and lines still wrap. The
   * model holds no newlines — a line break is a block — so nothing else changes.
   *
   * (No back-ticks in this comment, for the reason the caret rule below spells out.)
   */
  white-space: pre-wrap;
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
  font-size: var(--st-h1, 2.75rem);
  font-family: var(--st-head-face, inherit);
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-wrap: balance;
}

.st-page h2 {
  font-size: var(--st-h2, 1.875rem);
  font-family: var(--st-head-face, inherit);
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.st-page h3 {
  font-size: var(--st-h3, 1.25rem);
  font-family: var(--st-head-face, inherit);
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.st-page h4 {
  font-size: var(--st-h4, 1rem);
  font-family: var(--st-head-face, inherit);
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

/*
 * A list, with its markers put back.
 *
 * Tailwind's preflight sets list-style to none on every ul and ol, and the app that draws the boards
 * loads it — so a list drew as an indented column of sentences even after it became a real ul. The
 * published page has no preflight and needs the rule anyway: a browser's default indent is a margin
 * this page does not want, and the marker is the one thing a list cannot be read without.
 */
.st-page ul,
.st-page ol {
  padding-left: 1.25em;
  list-style-position: outside;
}

.st-page ul { list-style-type: disc; }
.st-page ol { list-style-type: decimal; }

.st-page li {
  max-width: 68ch;
}

.st-page li + li {
  margin-top: 0.35em;
}

/*
 * A quotation, marked by a rule rather than by quotation marks.
 *
 * The words are already the quotation; a pair of glyphs around them is the page saying it twice.
 * The rule is what every editorial page uses and it survives being narrow, which a hanging quote
 * mark does not.
 */
.st-page blockquote {
  padding-left: 1.25em;
  border-left: 2px solid currentColor;
  font-size: 1.125em;
  line-height: 1.5;
}

/* Code, kept as it was typed — and allowed to scroll rather than to widen the page. */
.st-page pre {
  overflow-x: auto;
  padding: 1em 1.15em;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 6%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.875em;
  line-height: 1.6;
  white-space: pre;
  tab-size: 2;
}

/*
 * **Body text is the band's ink, held back** - and headings are the ink itself.
 *
 * The oldest typographic move on a page and the one this stylesheet had no way to make: a heading
 * at full strength over paragraphs at three-quarters is what makes a page read as set rather than
 * typed. It was being done by hand, on the run, forty-seven times, in a hard-coded grey that a
 * change of palette could not reach.
 *
 * Against currentColor rather than a value, which is the whole reason it can live here: a band that
 * flips to the dark ink gets a soft off-white by the same rule, and a band that states nothing gets
 * the page's own. One rule, every ground.
 *
 * Not on a list item or a pull quote: those are the argument, not the aside.
 *
 * (No back-ticks in this comment. Everything here is inside a template literal and one of them ends
 * it - which is exactly what happened while this rule was being written, for the third time.)
 */
.st-page p {
  color: color-mix(in srgb, currentColor 76%, transparent);
}

/*
 * A division, drawn as a hairline in the text's own colour at a tenth of its weight.
 *
 * A browser's own horizontal rule is a bevelled two-pixel groove from 1996; anything that keeps it
 * looks like a page nobody styled. (No back-ticks in here — see the header: one in a comment ends
 * this template literal, and the app stops building.)
 */
.st-page hr {
  height: 0;
  margin: 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent);
}

.st-page a {
  color: inherit;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

/*
 * A **table**, which drew as four words in a row with nothing between them.
 *
 * Found by inserting one in a browser: the model was right, the cells took text, the eight commands
 * worked — and what was on the page had no borders, no padding, and shrank to 156px, because
 * nothing in this stylesheet had ever mentioned a table. A browser's own default is a table with no
 * rules at all, so a comparison drawn with it reads as a paragraph somebody pressed Tab in.
 *
 * Hairlines in the text's own colour at a tenth of its weight, which is the rule the divider above
 * already follows: a table on a page is structure, not a box, and a grid of grey boxes is the look
 * of a spreadsheet screenshot. The head keeps a heavier line under it, because the one thing a
 * reader has to see is where the names stop and the numbers start.
 *
 * Full width, because a table that hugs its content is a table with a ragged right edge in the
 * middle of a page of justified blocks. (No back-ticks in here — see the header.)
 */
.st-page table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.st-page th,
.st-page td {
  padding: 0.6em 0.75em;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}

.st-page th {
  font-weight: 600;
  border-bottom: 1px solid color-mix(in srgb, currentColor 35%, transparent);
}

/* The last line would draw a rule under the table with nothing below it to divide. */
.st-page tr:last-child td {
  border-bottom: 0;
}

/*
 * **A form's controls**, which had no rule at all and drew at the browser's own 1990s defaults.
 *
 * Measured on the sample's contact form: the label was 290px wide and the box under it 147, because
 * a text input's width comes from a size attribute nobody set. Every published form this product has
 * ever made looked like that, on the board and on the page, and no check could see it - a field that
 * draws is a field that draws.
 *
 * Full width is the whole fix. The rest is what a control needs to be usable rather than merely
 * present: the page's own type instead of the browser's, room to type in, and a focus ring that a
 * keyboard can find. The hairline is currentColor at a tenth, like every other line on the page, so
 * a form on a dark band gets a light one from the same rule.
 *
 * The field's own paint - its fill, its border, its radius - is on the wrapper around this, which is
 * why nothing here fights it: a reader who paints a field paints the box, and this is the control.
 *
 * (No back-ticks in this comment. See the header.)
 */
.st-page .st-input {
  width: 100%;
  font: inherit;
  color: inherit;
  padding: 0.55em 0.7em;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 3%, transparent);
}

.st-page .st-input:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

/*
 * A tick is a target before it is a control, and a 13px one is what a browser gives you. Square,
 * because it is a checkbox, and sized so a finger can find it.
 */
.st-page .st-input[type='checkbox'],
.st-page .st-input[type='radio'] {
  width: 18px;
  height: 18px;
  padding: 0;
  flex: none;
  accent-color: currentColor;
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
