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

/** What this needs of a node: its type, its attributes and its children. */
type Node = Record<string, any>;

/** How deep a page may nest before this stops walking — `walk`'s own ceiling in `export-html.ts`. */
const DEEPEST = 64;

/** The one ink, and the three greys. A wireframe has no palette; that is what makes it one. */
const INK = '#3f4650';
const LINE = '#c2c8d0';
const FILL = '#eef0f3';
const MEDIA = '#e9ecf0';

/**
 * A photograph, washed to one flat grey — and **nothing else touched**.
 *
 * `contrast(0)` collapses every pixel to the same value and `brightness` says which; the pair leaves
 * an element that lays out exactly as it did, which is the whole requirement. `grayscale` first so a
 * saturated photograph does not wash to a tinted grey.
 *
 * A border, because a flat grey box on a flat grey band is a box a reader cannot find the edges of.
 */
const WASHED = [
  'filter: grayscale(1) contrast(0) brightness(1.78) !important',
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
   * One ink and three greys, which is what a wireframe is: nothing draws the eye by colour, so what
   * is left drawing it is size, order and space — the three things being decided.
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
 * A **filled** box goes on being filled, one shade of grey: a band with a background is a band a
 * reader put there, and losing it would lose the page's rhythm. Told apart by asking the drawing
 * whether it has one rather than by asking the document, which is what keeps this a blanket rule.
 */
[data-wireframe='true'] .st-page [style*='background'] {
  background-color: ${FILL} !important;
}

/* The page itself stays white, whatever it was set to: a wireframe on a dark page is unreadable. */
[data-wireframe='true'] .st-page {
  background-color: #ffffff !important;
}

/*
 * **A button still reads as a button** — measured, because at first it did not.
 *
 * A button on this page is a frame with a fill, so the rule above turned it the same grey as the
 * band it sat on and the page's one call to action **disappeared**. What tells the two apart in the
 * drawing is the rounded corner: a band is square and a control is not. So anything with a radius
 * gets a hairline, which draws the buttons back and — the same thing said once — draws every card as
 * a box, which is what a wireframe is for.
 *
 * An outline rather than a border, for the reason the media has one: a border would move everything
 * it touched by a pixel.
 */
[data-wireframe='true'] .st-page [style*='border-radius'],
[data-wireframe='true'] .st-page [data-kind='button'],
[data-wireframe='true'] .st-page button {
  outline: 1px solid ${LINE} !important;
  outline-offset: -1px !important;
  color: ${INK} !important;
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
  rootSid: string
): string {
  const out: string[] = [];
  const seen = new Set<string>();

  const look = (sid: string, depth: number) => {
    if (depth > DEEPEST || seen.has(sid)) return;
    seen.add(sid);
    const node = store.getNode(sid);
    if (!node) return;

    const word = wireframeName(node);
    if (word) {
      const at = `[data-wireframe='true'] [data-bc-sid="${sid}"]`;
      out.push(`${at} { position: relative !important; }`);
      /*
       * **Top-right**, which the first look at a real page settled: content starts at the top *left*
       * of almost every box, so a label there sits on the first line of a form or the first cell of
       * a table. The top right of those same boxes is padding.
       */
      out.push(
        `${at}::before { content: '${word}'; position: absolute; right: 0; top: 0; z-index: 1; ` +
          `padding: 1px 5px; background: ${INK}; color: #ffffff; font-size: 10px; line-height: 1.6; ` +
          `white-space: nowrap; pointer-events: none; }`
      );
    }

    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') look(child, depth + 1);
    }
  };

  look(rootSid, 0);
  return out.join('\n');
}

/** The whole sheet — the blanket and the names, for a caller that wants one string. */
export function wireframeCss(
  store: { getNode: (sid: string) => Node | undefined },
  rootSid: string
): string {
  return `${WIREFRAME_CSS}\n${wireframeRules(store, rootSid)}`;
}
