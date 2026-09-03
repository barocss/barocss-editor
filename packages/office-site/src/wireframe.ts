/**
 * **와이어프레임 보기** — the same page, read at a lower fidelity.
 *
 * ## Why this is a view and not a second document
 *
 * Asked as a choice between two things, and it is neither of them: *와이어프레임처럼 보이도록 필터를
 * 입히는 게 좋을까, 아니면 와이어프레임 에디터를 따로 만드는 게 좋을까?*
 *
 * **A separate editor is a second document**, and the two would have to be kept in step — which is
 * precisely the work that makes a plan and a design drift apart. This suite's premise is one schema
 * and one renderer across three products; a wireframe is not a different document, it is the same
 * page with the finish taken off.
 *
 * **A filter alone cannot say what a thing is.** `grayscale()` produces a page with the colour taken
 * out, which is not a wireframe: a wireframe's job is to show structure and intent, so the grey box
 * where a video was has to be able to say 영상. Measured in the board's own DOM before deciding — it
 * carries `data-name`, `data-kind`, `data-layout` and `data-sizing` and **not the node's type**, so a
 * blanket stylesheet has nothing to write in the box.
 *
 * ## So it is generated from the document, the way two other sheets here already are
 *
 * `editorStateCss` writes what a page promises a visitor as rules the boards obey, and `revealRules`
 * writes its arrivals. Both key their selectors on `data-bc-sid`, and so does the half of this that
 * has to: the document knows every node's type, so the name in the box comes from the model rather
 * than from an attribute the renderer would have to start writing.
 *
 * ## What a browser had to settle first
 *
 * Three facts, measured rather than assumed, and the shape of this file is all three:
 *
 * - **A replaced element paints no `::before`.** Probed with a label on an `img`, a `video`, an
 *   `iframe` and a `div`: only the `div` drew it. So a photograph cannot be labelled that way,
 *   however natural it looks.
 * - **`content: url(<a 1×1 svg>)` empties one — and moves it.** It works, and it was the first
 *   version of this file: hatch, label, the lot. Then the browser check compared the picture boxes
 *   before and after and they were **not the same page**: 266×199 became 225×225 and four 61×20
 *   logos became 2×2, because replacing the content replaces the intrinsic size every `width: auto`
 *   image is laid out from. A wireframe whose boxes are the wrong size is worse than one with no
 *   captions on its photographs — it is a layout the reader does not have.
 * - So the media is **washed, not emptied**: `contrast(0)` makes a photograph one flat grey and
 *   `brightness` chooses which grey, with the element untouched in every way a layout can see. The
 *   box is exactly the box.
 *
 * The cost is stated rather than hidden: a photograph gets no word on it. It does not need one — a
 * grey rectangle where a picture was is the oldest notation there is — and the words that *are*
 * load-bearing (폼, 데이터 목록, 표, 코드) sit on boxes a browser will happily draw a `::before` on.
 *
 * The words stay the words. A wireframe with the real copy in it is the one that produces real
 * decisions; lorem ipsum is how a layout gets approved for a paragraph nobody has written yet.
 *
 * ## It is the editor's, not the visitor's
 *
 * Nothing here reaches a published page — `export-html.ts` does not call it, and a page a reader
 * publishes has no wireframe in it. That is the difference between this and a state: a state is
 * something the *page* does, and this is something the *tool* does to help somebody look at it. It
 * is also why `!important` is right here and refused there: the boards are drawn with inline styles
 * by design, and nothing else beats an inline style.
 */

import { BREAKPOINTS, type SiteWidth } from './breakpoints';
import { attrsAt } from './responsive';

/** What this needs of a node: its type, its attributes and its children. */
type Node = Record<string, any>;

/** How deep a page may nest before this stops walking — `walk`'s own ceiling in `export-html.ts`. */
const DEEPEST = 64;

/**
 * **한 잉크, 한 선, 한 회색** — and the measurement that took the other two greys away.
 *
 * Asked as three options: *그냥 회색톤이 좋은가, 순수하게 검은 선만 쓰는 게 좋은가, 아니면 테마처럼 고를
 * 수 있게 하는 게 좋은가?* Measured before answering, and the measurement says the first two were not
 * the choice they looked like.
 *
 * The sheet used four values, and against the white page they came out:
 *
 * | | contrast |
 * |---|---|
 * | the band grey against the photo grey | **1.04:1** |
 * | the band grey against the page | **1.14:1** |
 * | the photo grey against the page | 1.19:1 |
 * | the line against the page | 1.68:1 |
 *
 * Two things follow, and neither was visible without the numbers:
 *
 * - **Two greys meant two different things and were the same grey.** *A reader put a background
 *   here* and *there is a photograph here* are different facts, and 1.04:1 apart.
 * - **The argument for keeping the band grey was already false.** It was kept so the page's rhythm
 *   would survive — and at 1.14:1 there was no rhythm to survive. The sample has 25 boxes that carry
 *   a fill and no corner and no border, and every one of them was invisible.
 *
 * So *회색이냐 선이냐* was never the question: what the sheet drew was a **white page pretending to be
 * grey**. The answer is the third thing — the one the numbers point at rather than either option:
 *
 * - **the line carries the structure**, dark enough to be a notation (3.27:1, which is the bar a
 *   non-text mark has to clear to be readable at all);
 * - **a fill becomes a box.** *There is a background here* is translated into the line's vocabulary —
 *   white, with a hairline — which is what makes those 25 boxes appear for the first time;
 * - **grey is left with exactly one meaning: 사진.** One grey, one fact, and visibly a shaded box.
 *
 * ## And not a theme picker
 *
 * A wireframe is made to be **handed to somebody else**. A notation that each reader configures is a
 * notation where *그 회색 박스* means one thing to the person who drew it and another to the person
 * reading it, which is the one job it has, failed. `WIREFRAME_NAMES` is a fixed vocabulary for
 * exactly this reason.
 *
 * The one condition that would justify a second mode is named rather than left implied: **print**. A
 * grey wash on a mono laser is mush, and a line-only sheet is what a printed handout wants. Nobody
 * has asked for one, and building it before they do is building the theme picker with extra steps.
 */
export const WIREFRAME_PALETTE = {
  /** The words and the labels. 9.53:1 on the page — this is text and has to read as text. */
  ink: '#3f4650',
  /**
   * Every edge, and the whole load of the notation. **3.27:1** on the page, which is the bar a mark
   * that is not text has to clear to be readable at all — and the number the old line missed by half.
   */
  line: '#868f9c',
  /** The one grey, and it means 사진. 1.54:1: visibly a shaded box, and not competing with the ink. */
  media: '#d0d0d0',
  /** What everything sits on, whatever the page's own ground was. */
  page: '#ffffff'
} as const;

const INK = WIREFRAME_PALETTE.ink;
const LINE = WIREFRAME_PALETTE.line;
const MEDIA = WIREFRAME_PALETTE.media;

/**
 * A photograph, washed to one flat grey — and **nothing else touched**.
 *
 * `contrast(0)` collapses every pixel to the same value and `brightness` says which; the pair leaves
 * an element that lays out exactly as it did, which is the whole requirement. `grayscale` first so a
 * saturated photograph does not wash to a tinted grey.
 *
 * An edge, because a flat grey box on a white page is still a box a reader has to find the edges of
 * — and because the line is what every other box on this page is drawn with now, so a photograph
 * without one would be the one thing here that is a shape rather than a box.
 */
const WASHED = [
  /*
   * `contrast(0)` puts every pixel on the same mid grey and `brightness` says which. **1.63**, not
   * 1.78, so a washed photograph lands on `MEDIA` rather than two shades above it: the one grey has
   * one meaning and a picture that has loaded has to be the same grey as a picture that has not.
   */
  'filter: grayscale(1) contrast(0) brightness(1.63) !important',
  /*
   * **An outline rather than a border**, and the browser check found the difference: a border made
   * every picture one pixel wider and one taller, which is the same fault as emptying them, just
   * smaller. An outline is painted outside the layout and changes nothing.
   */
  `outline: 1px solid ${LINE} !important`,
  'outline-offset: -1px !important',
  /* The same paint underneath, for a picture that has not loaded or has no file yet. */
  `background-color: ${MEDIA} !important`
].join('; ');

/**
 * What a box is called once its content is a grey rectangle.
 *
 * A page's own vocabulary rather than the schema's: a reader reads 영상, not `mediaVideo`. Plain
 * terms, which is this product's rule about every word it shows.
 *
 * A type that is **not** in here gets no name, and that is a decision rather than an omission: a
 * heading is still a heading with its colour taken away, and a label on it would be a word competing
 * with the words it names. What is in here is exactly the set whose content is unreadable once it is
 * a grey box.
 */
export const WIREFRAME_NAMES: Record<string, string> = {
  form: '폼',
  collection: '데이터 목록',
  codeBlock: '코드',
  bTable: '표'
};

/*
 * **`instance` was in this list and came straight back out**, on the first look at a real page.
 *
 * A placed component is the most common block on the sample — the nav bar, both buttons in the hero,
 * every card — so labelling it put 컴포넌트 on top of a dozen things at once, including *over the
 * words on a button*. And it was the wrong claim anyway: a placement draws its own content, so a
 * reader can see what it is. The list is for boxes that are unreadable once they are grey, and a
 * placement is not one of them.
 */

/**
 * And the two embeds worth naming more exactly, because *넣은 것* says nothing.
 *
 * A map and a video are different shapes on a page — one is looked at, one is played — and the
 * document already knows which, in `provider`. Read rather than guessed.
 */
const EMBED_NAMES: Record<string, string> = {
  youtube: '영상',
  vimeo: '영상',
  map: '지도'
};

/**
 * The media the wash applies to, named by the **element** rather than by the node — `img`, `video`
 * and `iframe` say what they are in the DOM already, so this needs no walk of the document.
 */
const MEDIA_TAGS = ['img', 'video', 'iframe'];

/**
 * What a node is called in a wireframe, or nothing.
 *
 * Exported because *which* boxes get a name is a claim worth checking, and a function is how it gets
 * checked in milliseconds rather than by looking at a screen.
 */
export function wireframeName(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  const stype = String(node.stype ?? '');
  if (stype === 'mediaEmbed') {
    const provider = String((node.attributes as Record<string, unknown> | undefined)?.provider ?? '');
    return EMBED_NAMES[provider];
  }
  return WIREFRAME_NAMES[stype];
}

/**
 * The blanket — the half that needs no document at all.
 *
 * Scoped to `[data-wireframe='true']` so it is a **board's** state rather than the application's: a
 * reader looking at three widths at once sees all three in it, and turning it off restores the page
 * without redrawing anything.
 */
export const WIREFRAME_CSS = `
[data-wireframe='true'] .st-page,
[data-wireframe='true'] .st-page * {
  /*
   * One ink and one line. Nothing draws the eye by colour, so what is left drawing it is size, order
   * and space — the three things being decided.
   */
  color: ${INK} !important;
  border-color: ${LINE} !important;
  box-shadow: none !important;
  text-shadow: none !important;
  /* A gradient is a background-image, so this takes those down as well as the photographs. */
  background-image: none !important;
  text-decoration-color: ${LINE} !important;
}

/*
 * **A filled box becomes an outlined box** — the translation, rather than a second grey.
 *
 * *A reader put a background here* is a real fact about the page and it has to survive. It used to
 * survive as a grey, and the grey was 1.14:1 against the page: the sample's 25 fill-only boxes — the
 * bands that are the page's rhythm — were invisible, which is the opposite of what keeping them was
 * for. Said as a line instead, they are visible for the first time.
 *
 * Told apart by asking the **drawing** whether it has a background rather than by asking the
 * document, which is what keeps this a blanket rule and not a walk.
 */
[data-wireframe='true'] .st-page [style*='background'] {
  background-color: #ffffff !important;
  outline: 1px solid ${LINE} !important;
  outline-offset: -1px !important;
}

/* The page itself stays white, whatever it was set to: a wireframe on a dark page is unreadable. */
[data-wireframe='true'] .st-page {
  background-color: #ffffff !important;
}

/*
 * **A button still reads as a button** — measured, because at first it did not.
 *
 * A button on this page is a frame with a fill, so an earlier version of the rule above turned it
 * the same grey as the band it sat on and the page's one call to action **disappeared**. What tells
 * the two apart in the drawing is the rounded corner: a band is square and a control is not.
 *
 * It is kept now that a fill is already an outline, because the two sets are not the same one: a
 * card with a radius and no fill is a box and is drawn by this, and a control that is only an
 * outline is drawn by both, which costs nothing.
 *
 * An outline rather than a border, for the reason the media has one: a border would move everything
 * it touched by a pixel.
 *
 * A third selector, [data-kind='button'], was in this list and matched **nothing**: data-kind is a
 * form *field's* kind and a page's surface kind, and neither is ever button. A real button element —
 * which is what a form's 보내기 draws as — is already covered by the rule above, so taking it out
 * lost nothing. Written down because a selector that matches nothing is the CSS version of the fault
 * this repository's harness exists to find, and it survived a rewrite of this file by looking
 * plausible.
 */
[data-wireframe='true'] .st-page [style*='border-radius'],
[data-wireframe='true'] .st-page button {
  outline: 1px solid ${LINE} !important;
  outline-offset: -1px !important;
  color: ${INK} !important;
}

/*
 * **데이터가 있던 자리에는, 데이터가 아니라 변수 이름.**
 *
 * Asked as *와이어프레임에서는 데이터 영역이 실제 데이터 말고 데이터 변수만 보이면 더 명확하지 않을까*,
 * and it is right — and it sits directly against what this file already argues two screens up:
 * *the words stay the words; lorem ipsum is how a layout gets approved for a paragraph nobody has
 * written yet.*
 *
 * Both are true, and the line between them is sharp:
 *
 * - **Words a person wrote** are the content. A wireframe with them in it produces real decisions.
 * - **A value that came from a column** is *one of forty*, and the thing being reviewed is the shape
 *   that has to hold all forty. Real data actively hides it: every row is a different length, so
 *   every row looks different, and what a reviewer needs to see is that they are the same row.
 *
 * field:제목 says *a title goes here, whatever it is*, which is the sentence a wireframe exists to
 * say. The reference form rather than the bare name, deliberately: var:강조 is the other thing a
 * value can come from, and one word for two origins would be the notation lying.
 *
 * ## And **nothing moves**, which this file has had to learn twice
 *
 * The words are not removed — they are made **transparent**, so a title that runs to three lines
 * still runs to three lines and the layout under review is the real one. The name is painted over
 * the box it names, absolutely, taking no space. Emptying them would be the same fault as emptying a
 * picture: 266×199 became 225×225, and a layout the reader does not have is worse than no label.
 *
 * ## Only where the value became **words**
 *
 * data-from is on the row's frame too — its goes comes from a column — and a rule that reached
 * it would blank the whole row and write field:페이지 across it. So this names the elements that
 * hold text, which is exactly the set whose content *is* the value.
 */
[data-wireframe='true'] .st-page :is(p, h1, h2, h3, h4, h5, h6, span)[data-from] {
  position: relative !important;
  color: transparent !important;
}

[data-wireframe='true'] .st-page :is(p, h1, h2, h3, h4, h5, h6, span)[data-from]::after {
  content: attr(data-from);
  position: absolute;
  inset: 0;
  z-index: 1;
  color: ${INK};
  /*
   * The page's own size and weight come for free: a pseudo-element inherits every inheritable
   * property from the element it belongs to, so a title still reads as a title and a caption as a
   * caption. Saying font-size: inherit would be three declarations that change nothing — and one
   * of them would trip the check that says this sheet writes no height, which is the check that
   * keeps it from moving anything.
   */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

/*
 * And a field is a field: an outline and nothing in it, which is the notation for *the visitor types
 * here* and reads at a glance next to a button that is only an outline too.
 */
[data-wireframe='true'] .st-page input,
[data-wireframe='true'] .st-page textarea,
[data-wireframe='true'] .st-page select {
  background-color: #ffffff !important;
  border: 1px solid ${LINE} !important;
}

/*
 * **The media, washed rather than emptied** — see the header for the browser check that settled it,
 * and for what emptying did to four logos.
 */
${MEDIA_TAGS.map((tag) => `[data-wireframe='true'] .st-page ${tag} { ${WASHED}; }`).join('\n')}
`;

/**
 * **The two facts a wireframe is shown for, and could not say.**
 *
 * A wireframe is shown to somebody else, and what they are being asked is *does it read in the right
 * order* and *what happens on a phone*. Both were already in the document and neither was on the
 * drawing, so the answer to both was "look at it and count", which is what a wireframe exists to
 * stop.
 *
 * Both are `::before`/`::after` on an **absolutely positioned** box, which is the constraint the rest
 * of this file was written under: a wireframe whose layout differs from the page's is a layout the
 * reader does not have, and the two mistakes this file has already made — emptying a picture, giving
 * it a border — were both a notation that moved something by a pixel or two hundred.
 */

/**
 * **읽는 순서** — 1 · 2 · 3 down the page's own sections.
 *
 * The page's **direct children**, and only those. A number on every box is a wireframe with a
 * hundred numbers on it, which says nothing; the sections are the thing a reader is being asked
 * about the order of, and a section is exactly what a page's own children are.
 *
 * Placements are counted with everything else. The header and the footer are placements, and they
 * *are* the first and last thing on the page — leaving them out would number the middle of the page
 * as though it were the whole of it, which is the reading a reviewer would then have to correct for.
 */
function orderRules(store: { getNode: (sid: string) => Node | undefined }, pageSid: string): string[] {
  const page = store.getNode(pageSid);
  const kids = ((page?.content ?? []) as unknown[]).filter((sid): sid is string => typeof sid === 'string');
  if (kids.length < 2) return [];

  const out: string[] = [];
  kids.forEach((sid, index) => {
    const at = `[data-wireframe='true'] [data-bc-sid="${sid}"]`;
    out.push(`${at} { position: relative !important; }`);
    /*
     * **Outside the box, on the left**, where a numbered list keeps its numbers — and where nothing
     * of the page's own is, because a section runs the full width. The name labels are at the top
     * *right* for the same kind of reason, and the two never collide.
     *
     * Outside is possible because a board is `overflow: visible` while a reader is editing — the same
     * property that lets its name sit above the artwork. **In preview it is not**, and the numbers
     * are clipped there. Stated rather than worked around: preview is the board becoming a window
     * onto the real page, and a number floating beside the real page is the thing that would be wrong.
     */
    out.push(
      `${at}::after { content: '${index + 1}'; position: absolute; left: -26px; top: 0; z-index: 1; ` +
        `width: 18px; height: 18px; border-radius: 9px; background: ${INK}; color: #ffffff; ` +
        `font-size: 10px; line-height: 18px; text-align: center; pointer-events: none; }`
    );
  });
  return out;
}

/**
 * **이 폭에서만** — which widths a block is actually on, when it is not on all of them.
 *
 * A section that drops out on the tablet drew exactly like a section that does not exist, and the
 * only way to find out was to put two boards side by side and notice an absence — which is the
 * hardest thing there is to notice.
 *
 * ## Said on the block that *is* drawn, not on the one that is not
 *
 * The obvious notation is a dashed ghost where the hidden block would be, and it is wrong: a block
 * hidden at this width has no box, so drawing one **adds a box to the layout** — the reviewer would
 * be reading a page that is taller than the page. Every other choice in this file went the same way.
 *
 * So the label goes on the block wherever it *is* shown, and says where that is: a hamburger reads
 * 모바일만 on the phone board and is simply absent on the desktop one, which is the truth about it.
 *
 * ## And silence when it is everywhere
 *
 * A block on every width gets nothing. Most blocks are on every width, and a label repeating that a
 * hundred times is a label nobody reads by the third one.
 *
 * Exported for the same reason `wireframeName` is: which blocks get a note is a claim, and a claim is
 * worth checking in milliseconds rather than by looking at a screen.
 */
export function shownOnlyAt(
  attrs: Record<string, unknown> | undefined,
  widths: SiteWidth[] = BREAKPOINTS
): string | undefined {
  if (!attrs) return undefined;

  const on = widths.filter((one) => attrsAt(attrs, one.id).visible !== false);
  /*
   * Nothing to say when it is on all of them, and nothing to say when it is on none: a block hidden
   * everywhere is a **draft**, which `neverShown` already means and the export already drops. A
   * wireframe labelling it 어디에도 없음 would be labelling a box that is not drawn.
   */
  if (on.length === widths.length || on.length === 0) return undefined;
  return `${on.map((one) => one.label).join('·')}만`;
}

/**
 * The names of the boxes the **document** has to identify, as rules.
 *
 * Everything the DOM can say for itself is in the blanket above. What is left is the set a browser
 * cannot tell apart — a form, a data list, a placed component, a code block, a table are all a `div`
 * with children — so these are one rule per node, keyed on the sid, exactly as `editorStateCss` and
 * `revealRules` key theirs.
 *
 * `position: relative` comes with the label because the label is absolutely placed, and a box that
 * was `static` would hand it to whatever ancestor happened to be positioned — which is how a name
 * ends up in the corner of the page instead of in the corner of the thing it names.
 */
export function wireframeRules(
  store: { getNode: (sid: string) => Node | undefined },
  rootSid: string,
  widths: SiteWidth[] = BREAKPOINTS
): string {
  const out: string[] = [];
  const seen = new Set<string>();

  /**
   * How a rule names a node — and the **part** case, which is why this is a function.
   *
   * A block inside a component definition is drawn once per placement, as `placement~part`, so one
   * definition on six pages is six different drawn ids for one node. `[data-bc-sid$="~part"]` is the
   * one selector that means *every placement of this part*, which is exactly what placing a component
   * is. The part's own id matches too, for the board where a definition is being edited on its own.
   *
   * `styledNodes` in `export-html.ts` had to learn this first, and learned it the same way: the four
   * things on this sample that appear on every page — the header, the footer and both buttons — are
   * all definitions, so a walk of the page reaches none of them.
   */
  const where = (sid: string, part: boolean, pseudo = '') => {
    /**
     * **The suffix goes on every selector, not on the list.**
     *
     * `a, b::before` attaches the pseudo-element to `b` alone — so the first version of this wrote
     * the label onto the *bare* sid (a definition being edited on its own board) and onto nothing at
     * all where it was needed: every drawn placement matched the first selector and got a `content`
     * declaration on the element itself, which does nothing. The sheet was right, the rule was
     * generated, the label was invisible, and every unit test passed because they all assert on the
     * **string**. A browser had to say it.
     */
    const one = `[data-wireframe='true'] [data-bc-sid="${sid}"]${pseudo}`;
    return part ? `[data-wireframe='true'] [data-bc-sid$="~${sid}"]${pseudo}, ${one}` : one;
  };

  const look = (sid: string, depth: number, part: boolean) => {
    if (depth > DEEPEST || seen.has(sid)) return;
    seen.add(sid);
    const node = store.getNode(sid);
    if (!node) return;

    /**
     * **One label, two facts.** What the box is, and — where it is not everywhere — where it is.
     *
     * Composed rather than drawn as two, because an element has two pseudo-elements and the second is
     * spoken for by the reading order. A form that only exists on a phone reads `폼 · 모바일만`, which
     * is also how a person would say it.
     */
    const word = [wireframeName(node), shownOnlyAt(node.attributes as Record<string, unknown>, widths)]
      .filter(Boolean)
      .join(' · ');

    if (word) {
      out.push(`${where(sid, part)} { position: relative !important; }`);
      /*
       * **Top-right**, which the first look at a real page settled: content starts at the top *left*
       * of almost every box, so a label there sits on the first line of a form or the first cell of
       * a table. The top right of those same boxes is padding.
       */
      out.push(
        `${where(sid, part, '::before')} { content: '${word}'; position: absolute; right: 0; top: 0; ` +
          `z-index: 1; padding: 1px 5px; background: ${INK}; color: #ffffff; font-size: 10px; ` +
          `line-height: 1.6; white-space: nowrap; pointer-events: none; }`
      );
    }

    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') look(child, depth + 1, part);
    }
  };

  look(rootSid, 0, false);
  /*
   * And every definition in the document. A placement of one is on nearly every page, and the header
   * is where the answer to *what happens on a phone* actually lives: a bar that is 데스크톱·태블릿만
   * and a hamburger that is 모바일만 is the ordinary way a site has two navigations, and neither of
   * them is in a page.
   */
  for (const definition of definitionsIn(store, documentRoot(store, rootSid))) {
    look(definition, 0, true);
  }

  return [...out, ...orderRules(store, rootSid)].join('\n');
}

/** The document a page or a definition belongs to, walked up from it. */
function documentRoot(store: { getNode: (sid: string) => Node | undefined }, sid: string): string {
  let at = sid;
  for (let hop = 0; hop < 8; hop += 1) {
    const parent = store.getNode(at)?.parentId;
    if (typeof parent !== 'string' || !parent) return at;
    at = parent;
  }
  return at;
}

/**
 * Every definition in the document — two levels, because that is where they are.
 *
 * `export-html.ts` has this walk too, and it is deliberately not shared: that one is part of what a
 * published page is, this one is part of what the tool draws, and the two have already wanted
 * different things once (this walks a definition being **edited**, which is not a page at all).
 */
function definitionsIn(store: { getNode: (sid: string) => Node | undefined }, root: string): string[] {
  const found: string[] = [];
  for (const child of (store.getNode(root)?.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const node = store.getNode(child);
    if (node?.stype === 'component') found.push(child);
    else if (node?.stype === 'components') {
      for (const one of (node.content ?? []) as unknown[]) {
        if (typeof one === 'string' && store.getNode(one)?.stype === 'component') found.push(one);
      }
    }
  }
  return found;
}

/** The whole sheet — the blanket, the names and the reading order, for a caller that wants one string. */
export function wireframeCss(
  store: { getNode: (sid: string) => Node | undefined },
  rootSid: string,
  widths: SiteWidth[] = BREAKPOINTS
): string {
  return `${WIREFRAME_CSS}\n${wireframeRules(store, rootSid, widths)}`;
}
