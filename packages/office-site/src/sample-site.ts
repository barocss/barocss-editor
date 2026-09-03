/**
 * A site to open the product with — and to **measure it against**.
 *
 * ## Why this one is elaborate, and then why it was rebuilt
 *
 * The first sample was two pages and made the argument that a landing page is a column of stacks. It
 * proved the claim and taught nothing else, because a property panel can only be judged against a
 * document that uses the properties. So the second one was deliberately dense: every attribute the
 * site schema adds, used somewhere, at more than one value.
 *
 * It was dense and it was **ugly**, and that turned out to be a measurement rather than a matter of
 * taste. Asked to make it look like something a person would ship, the vocabulary ran out in four
 * specific places, all of them on the first screen: a navigation bar could not put the mark at one
 * end and the links at the other, a section could not have more air above it than below, a hero
 * could not have a picture behind its words, and a card could not have a shadow. Those four gaps are
 * `justifyContent`, the four paddings, `backgroundImage` and `shadowColor`, and every one of them
 * was found by trying to build something rather than by reading the schema.
 *
 * So this file is two things at once: the document the panel is judged against, and the argument
 * that the model can express a page somebody would put their name on.
 *
 * ## The design it is built to
 *
 * Ink and paper with one accent, which is a **deep green** rather than the blue every developer tool
 * defaults to; greys biased a few degrees toward that green so they read as chosen; one radius scale
 * (16px on a box, a pill on a button); and a single dark region at the foot of each page rather than
 * bands alternating down it. The type scale is the heading levels the document model already has,
 * because a site builder that needed a second one would be admitting the first is not a document.
 *
 * What it exercises, and where:
 *
 * | what | where |
 * | --- | --- |
 * | `layoutMode` — column, row, **grid** | the hero, the card row, the feature grid |
 * | `justifyContent` — between, center | the navigation bar, the numbers, the footer |
 * | per-side padding | every section: more air above a heading than below it |
 * | `sizing` — fill, **hug**, **fixed** with `minWidth`/`maxWidth` | the CTA, the sidebar, the trio |
 * | `overrides` at **both** narrow widths, not only mobile | the hero, the grid, the card row |
 * | `alignItems` — start, center, end | the header bar, the CTA, the enquiry row |
 * | **design tokens** (`var:강조`, `var:바탕`, `var:먹`) | every accent on the site |
 * | `gradientFrom`/`To`/`Angle` | the closing band, the post covers |
 * | `backgroundImage` with `tile` | the hero's grid |
 * | `shadowColor`/`Blur`/`Distance` | the cards, the hero's picture |
 * | `cornerRadius` and one four-cornered box | the cards; the featured plan |
 * | `component` + `instance` with **bound values** | the header, the footer, the button |
 * | `collection` with `sortBy`, `limit`, **`where`/`equals`** | the products, the posts |
 * | `picture` with `fit`, `fill`, `stroke` | the hero image, the portraits |
 * | marks — `fontColor`, `fontSize`, **`link` to a page of this site** | the hero, the navigation |
 * | five pages with **addresses** | `/`, `/제품`, `/가격`, `/소개`, `/블로그` |
 *
 * Every node in it is the office schema's. That is still the argument; this is the argument made at
 * a size where it can be disbelieved.
 */
import type { SchemaDefinition } from '@barocss/schema';
import { mark, node, textNode } from '@barocss/model';
import { pageRef } from './page-link';
import { enginePicture, gridTexture, monogram, portrait, postCover, wordmark } from './sample-art';

/**
 * A node as this fixture writes it.
 *
 * `Record<string, unknown>` rather than the store's `INode`, and the casts below hop through
 * `unknown` because the two do not overlap: `INode` has required fields a *tree being loaded* has not
 * got yet — the store fills them in. Which is the honest relationship between a document on disk and
 * a document in memory, and `loadDocument` is where it is crossed.
 */
type Node = Record<string, unknown>;

/**
 * The lengths this site is laid out on, in twips, where 15 twips is a CSS pixel.
 *
 * A scale rather than numbers at the call site, for the reason every design system has one: a page
 * whose sections are 96, 92 and 104 apart is a page that looks *almost* right and cannot be fixed by
 * looking at any one of them. Written as the pixel it becomes, because that is the number the panel
 * shows a reader.
 */
const px = (value: number): number => value * 15;

/** The rhythm: the air above a section, and the air below it, which are not the same number. */
const AIR = { top: px(112), bottom: px(96), side: px(72), tight: px(56) };
/** The gaps: between a section's parts, between a heading and its sentence, inside a card. */
const GAP = { wide: px(40), mid: px(24), tight: px(12), hair: px(6) };
/** One radius scale. A box is 16, a picture is 16, a button is a pill. */
const ROUND = { box: px(16), pill: px(40) };
/** The measure a page's text is read at, and the width the whole site is centred in. */
const WIDTH = { page: px(1200), text: px(680), aside: px(340) };

/**
 * The sample's own words for what a page is made of, built on the model's.
 *
 * `node`, `textNode` and `mark` have been in `@barocss/model` since it was written, beside the
 * operation builders nobody could import — and a fixture is exactly where a raw object literal hides
 * best, because a misspelt `stype` reads as a document decision until the schema refuses it. What is
 * left here is the *product's* vocabulary: a page is stacks, cards, placements and pictures, and
 * saying so is what makes the sample readable as an argument rather than as a tree.
 */
const text = (value: string, marks?: ReturnType<typeof mark>[]): Node =>
  (marks ? textNode('inline-text', value, marks) : textNode('inline-text', value)) as unknown as Node;

/** A run in a colour, which is how every product in this repository colours words. */
const inColour = (value: string, colour: string): Node =>
  text(value, [mark('fontColor', { color: colour, range: [0, value.length] })]);

/** A run at a size of its own — the one place this site sets type by hand rather than by level. */
const atSize = (value: string, size: string, colour?: string): Node =>
  text(value, [
    mark('fontSize', { size, range: [0, value.length] }),
    ...(colour ? [mark('fontColor', { color: colour, range: [0, value.length] })] : [])
  ]);

/** A run in italics, which is how a summary emphasises one word without shouting. */
const emphasised = (value: string): Node =>
  text(value, [mark('italic', { range: [0, value.length] })]);

/**
 * A run that goes to **a page of this site**, named by its durable id rather than its address.
 *
 * `page:제품`, not `/제품`, so that renaming the address moves the link with it — the same shape as
 * `var:강조` for a colour and `field:이름` for a value from a row, resolved where it is drawn
 * (`page-link.ts`).
 */
const toPage = (value: string, id: string, colour?: string): Node =>
  text(value, [
    mark('link', { href: pageRef(id), range: [0, value.length] }),
    ...(colour ? [mark('fontColor', { color: colour, range: [0, value.length] })] : [])
  ]);

const heading = (level: number, value: string, extra: Record<string, unknown> = {}): Node =>
  node('heading', { level, ...extra }, [text(value) as never]) as unknown as Node;

const paragraph = (value: string | Node[], extra: Record<string, unknown> = {}): Node =>
  node('paragraph', extra, (typeof value === 'string' ? [text(value)] : value) as never) as unknown as Node;

/**
 * A sentence in the quiet voice, which is most of the sentences on a marketing page.
 *
 * **It states no colour at all**, and getting there took two wrong answers worth writing down.
 *
 * It used to carry `#5C6660` on the run. That is a mark, and a mark cannot say `var:은은` — `named`
 * resolves references on a node's *attributes* and a mark is not one — so every muted sentence
 * carried a hard-coded grey, forty-seven of them in a document with ten tokens, and a palette change
 * would have left green stains in every paragraph.
 *
 * The obvious repair was a box around each one stating `ink`. It works and costs an element per
 * sentence: forty-seven boxes called 조용한 글 in the layer list, none of which a reader put there.
 *
 * So the quiet ink is not a colour at all — it is **the band's own ink at a lower weight**, said once
 * in `page-css.ts`. A light band gets grey and a dark band a soft off-white, from the same rule,
 * because the rule is written against `currentColor` rather than against a value.
 */
const quiet = (value: string, extra: Record<string, unknown> = {}): Node => paragraph(value, extra);

/** A stack: the one container this product builds everything out of. */
const stack = (
  layoutMode: 'row' | 'column' | 'grid',
  attributes: Record<string, unknown>,
  content: Node[]
): Node => node('frame', { layoutMode, sizing: 'fill', ...attributes }, content as never) as unknown as Node;

/**
 * A **section**: the band across the page, and the column of content centred inside it.
 *
 * Two stacks rather than one, and it is the shape every site on the web has: the band is as wide as
 * the window and carries the colour, and the column inside it is as wide as the reading measure and
 * carries the words. A page builder that could only do one of the two would be a page builder whose
 * sections either touch the window's edges or cannot be coloured.
 */
const section = (
  name: string,
  attributes: Record<string, unknown>,
  content: Node[],
  inner: Record<string, unknown> = {}
): Node =>
  stack(
    'column',
    {
      name,
      /*
       * **Stretch**, and the column inside centres itself — see `sizingCss`. It was `center`, which
       * centres a flex child *at its content width*, so a band's column was as wide as whatever
       * happened to be widest in it and every section began at a different place: three left edges
       * for seven headings of one page.
       */
      alignItems: 'stretch',
      paddingTop: AIR.top,
      paddingBottom: AIR.bottom,
      paddingLeft: AIR.side,
      paddingRight: AIR.side,
      overrides: {
        tablet: { paddingTop: AIR.bottom, paddingBottom: AIR.tight, paddingLeft: px(40), paddingRight: px(40) },
        mobile: { paddingTop: AIR.tight, paddingBottom: AIR.tight, paddingLeft: px(20), paddingRight: px(20) }
      },
      ...attributes
    },
    [stack('column', { name: `${name} 안`, gap: GAP.wide, maxWidth: WIDTH.page, centred: true, ...inner }, content)]
  );

/**
 * **The second ink, as a plate.**
 *
 * A short heavy bar above a heading, in the accent, and it is the whole reason the accent is not
 * spread across the words: a run cannot follow a token — a mark's colour is a CSS string and `named`
 * resolves references on a node's *attributes* — so every coloured word on the old page was a
 * hard-coded hex. Putting the accent on a **box** makes it a token, and it is also what the two-ink
 * discipline means by a second plate: something printed, not something tinted.
 */
/**
 * One rule of the hamburger: a box 20 wide and 2 tall, with nothing in it.
 *
 * The block the height pair was added for. Before it, a box with no content was a box of no height,
 * so three of them were three nothings and the mark had to be a drawing.
 */
const line = (): Node =>
  stack('row', {
    name: '줄',
    sizing: 'fixed',
    minWidth: px(20),
    maxWidth: px(20),
    minHeight: px(2),
    maxHeight: px(2),
    fill: 'var:먹',
    cornerRadius: px(2)
  }, []);

const plate = (width = 88, extra: Record<string, unknown> = {}): Node =>
  stack('row', {
    name: '판',
    sizing: 'fixed',
    minWidth: px(width),
    maxWidth: px(width),
    minHeight: px(6),
    maxHeight: px(6),
    fill: 'var:강조',
    ...extra
  }, []);

/**
 * **A comparison, as a table** — which is what a table is for and what this sample had none of.
 *
 * Four boxes is what a comparison looks like when the model cannot hold one: a reader cannot scan
 * down a column, and a screen reader gets a wall of words with no column names. A header row is the
 * whole difference — a cell is read *with* the name of its column.
 *
 * It is also the fixture wearing what it tests: eight table commands were registered, checked, and
 * unreachable by every probe here, because the one document they all run against had no table.
 */
const comparison = (head: string[], rows: string[][]): Node =>
  node('bTable', { caption: '' }, [
    node('bTableHeader', {}, head.map((words) => cell(words, true)) as never) as never,
    node(
      'bTableBody',
      {},
      rows.map((row) => node('bTableRow', {}, row.map((words) => cell(words)) as never)) as never
    ) as never
  ]) as unknown as Node;

/**
 * One cell of it. `head` decides the element, which decides what a screen reader says about it.
 *
 * A **run**, not a paragraph: a cell holds `inline*`, which the schema said and this got wrong on
 * the first try — the page would have loaded with the table silently dropped if nothing had checked.
 */
const cell = (words: string, head = false): Node =>
  node(head ? 'bTableHeaderCell' : 'bTableCell', {}, [text(words) as never]) as unknown as Node;

/**
 * **A block of code**, which this sample had none of and the product has a whole renderer for.
 *
 * `code-render.ts` highlights it with Prism and the panel offers a language, and no document held
 * one — so every probe answered *could not ask* about that row and no highlighted line had ever
 * been drawn.
 */
const code = (language: string, source: string): Node =>
  node('codeBlock', { language }, [text(source) as never]) as unknown as Node;

/**
 * **A form**, and the connection it sends through — named rather than addressed.
 *
 * `sends: '문의함'` and the address lives on the connection in `resources`. Two forms on this site
 * are two references to one place rather than two copies of an address, which is the same argument
 * `var:이름`, `componentId` and a dataset's `name` each won.
 *
 * `thanks` is **where the visitor lands** — a page of this site rather than the service's own.
 * Without it, pressing 보내기 replaces the site's design, header and footer with a stranger's page.
 */
const contactForm = (extra: Record<string, unknown> = {}): Node =>
  node(
    'form',
    {
      name: '연락 폼',
      layoutMode: 'column',
      sizing: 'fixed',
      minWidth: WIDTH.aside,
      maxWidth: WIDTH.aside,
      gap: px(14),
      padding: px(24),
      fill: 'var:면',
      stroke: 'var:선',
      strokeWidth: px(1),
      cornerRadius: ROUND.box,
      sends: '문의함',
      thanks: pageRef('home'),
      /*
       * At 390 it stops being a sidebar and becomes the column — and `null` is what says so. An
       * override could change a number and could not un-say one, so the form would have kept its cap
       * on a phone. `null` means *nothing at this width*, which is a different sentence from taking
       * the override back.
       */
      overrides: { mobile: { sizing: 'fill', minWidth: null, maxWidth: null } },
      ...extra
    },
    [
      node('field', { label: '이름', name: 'name', kind: 'text', required: true, sizing: 'fill' }, []) as never,
      node('field', { label: '이메일', name: 'email', kind: 'email', required: true, sizing: 'fill' }, []) as never,
      /*
       * **One of several** — every lead form has a 문의 유형, and without it a reader either asks for
       * it as free text and reads a hundred spellings of three answers, or does not ask.
       */
      node(
        'field',
        {
          label: '무엇에 대해',
          name: 'topic',
          kind: 'choice',
          choices: ['도입 문의', '기능 제안', '버그 제보'],
          placeholder: '고르세요',
          sizing: 'fill'
        },
        []
      ) as never,
      node(
        'field',
        { label: '하고 싶은 말', name: 'message', kind: 'paragraph', lines: 4, maxLength: 2000, required: true, sizing: 'fill' },
        []
      ) as never,
      /*
       * The policy line is an ordinary paragraph above the box: a field's `label` is a string and
       * cannot hold a link, and a form that collects personal data has to link the policy.
       */
      paragraph('보내주신 내용은 문의 처리에만 쓰고, 답변 뒤 6개월 안에 지웁니다.') as never,
      node(
        'field',
        { label: '개인정보 수집에 동의합니다', name: 'consent', kind: 'checkbox', required: true, sizing: 'fill' },
        []
      ) as never,
      node(
        'field',
        { label: '보내기', name: 'submit', kind: 'submit', sizing: 'fill', fill: 'var:강조', ink: 'var:종이', cornerRadius: ROUND.pill },
        []
      ) as never
    ]
  ) as unknown as Node;

const picture = (src: string, alt: string, extra: Record<string, unknown> = {}): Node =>
  node('picture', { src, alt, fit: 'cover', ...extra }, []) as unknown as Node;

/**
 * **고정** — the header follows the page down, which is the first thing anybody tries on a site
 * builder and the thing this product could not do at all until `position.ts`.
 *
 * On the **placement** rather than inside the definition, and that is not a workaround: a block
 * inside a definition has the placement's own box as its parent, and that box is exactly that
 * block's height, so `sticky` there has nowhere to travel and silently does nothing. It is also the
 * right place for it — whether a header follows *this* page is a decision about the page.
 *
 * `zOrder` because the hero's picture is drawn after it and would otherwise pass over the top.
 */
const HEADER = { position: 'sticky', insetTop: 0, zOrder: 10 };

/** A placement of a definition, with the answers it is given. */
const placed = (
  componentId: string,
  values: Record<string, string> = {},
  extra: Record<string, unknown> = {}
): Node =>
  node(
    'instance',
    { componentId, sizing: 'fill', ...extra },
    Object.entries(values).map(([name, value]) => node('componentValue', { name, value })) as never
  ) as unknown as Node;

/**
 * A card: a white box with a shadow, which is what a card *is* and could not be until now.
 *
 * The shadow is tinted toward the page's ink rather than pure black, and thrown down and soft — the
 * ordinary card, stated once here so that eleven of them agree.
 */
const card = (title: string, body: string, extra: Record<string, unknown> = {}): Node =>
  stack(
    'column',
    {
      gap: GAP.tight,
      padding: px(28),
      fill: 'var:면',
      sizing: 'fill',
      cornerRadius: ROUND.box,
      shadowColor: 'rgba(20, 17, 15, 0.07)',
      shadowBlur: px(24),
      shadowDistance: px(6),
      stroke: 'var:선',
      strokeWidth: px(1),
      /*
       * And what it says under the pointer. The **colour** of the border and the softness of the
       * shadow, never the border's width or the padding: those would resize the card, the card would
       * move out from under the pointer, and a visitor holding still would watch it flicker.
       */
      states: {
        hover: {
          stroke: 'var:강조',
          shadowColor: 'rgba(214, 52, 26, 0.18)',
          shadowBlur: px(32),
          shadowDistance: px(10)
        }
      },
      ...extra
    },
    [heading(3, title), quiet(body)]
  );

/**
 * One item of the navigation — a **box** with a word in it, rather than a word.
 *
 * It was a bare paragraph, and two things were wrong with that at once. A visitor on a phone had a
 * 14-pixel-tall target to hit, where every guideline asks for something near 44; and there was
 * nowhere for a hover to live, because a state is paint and a paragraph is not painted — text sizing
 * and text paint are the *stack's* question in this schema, asked one level up.
 *
 * So the hit area and the hover turn out to be the same fix, which is usually the sign that the
 * structure rather than the styling was the thing that was wrong.
 */
const navItem = (label: string, page: string): Node =>
  stack(
    'row',
    {
      partId: `nav-${page}`,
      // Named, so the layer list says 제품 rather than 가로 스택 four times in a row.
      name: label,
      alignItems: 'center',
      sizing: 'hug',
      paddingTop: px(8),
      paddingBottom: px(8),
      paddingLeft: px(12),
      paddingRight: px(12),
      cornerRadius: px(8),
      states: { hover: { fill: 'var:바탕' } }
    },
    [paragraph([toPage(label, page)], { partId: `nav-${page}-label` })]
  );

/**
 * A list of things, in the two kinds a page has.
 *
 * `type`, which is what the schema declares — the sample said `kind` and so did the insert command,
 * and neither of them was ever read: the marker came from Word's numbering, a site has none, and so
 * a list drew as an indented column of sentences whichever word was used. It is `<ul>` and `<ol>`
 * now, and the browser draws the markers.
 */
const listOf = (kind: 'bullet' | 'ordered', items: string[], extra: Record<string, unknown> = {}): Node => ({
  stype: 'list',
  attributes: { type: kind, ...extra },
  content: items.map((one) => ({
    stype: 'listItem',
    attributes: {},
    content: [paragraph(one)]
  }))
});

/**
 * A quotation, as the node for one.
 *
 * It was a bordered stack holding a big paragraph and a small one — which looked right and said
 * nothing: a published page carried two divs where a reader's browser, a screen reader and a search
 * engine all wanted a `blockquote`. The node has been in the schema since it was written; the sample
 * drew a picture of it instead, which is exactly the gap this round was looking for.
 */
const quoteOf = (said: string, who: string, extra: Record<string, unknown> = {}): Node => ({
  stype: 'blockQuote',
  /*
   * No `maxWidth` here, and it is worth the line: the sizing attributes are declared on the nodes a
   * page *arranges* — frame, collection, picture, instance, surface — and not on a text block, on
   * purpose. A heading that wants to hug its words goes in a stack that hugs, which is how every
   * auto-layout tool works: text sizing is the stack's question, asked one level up. Writing one
   * here would be an attribute nothing reads, which is the fault this round spent its morning on.
   */
  attributes: { ...extra },
  content: [paragraph([atSize(said, '20px')]), quiet(who)]
});

/** A division between two things, which is a block and not a border on one of them. */
const rule = (extra: Record<string, unknown> = {}): Node => ({
  stype: 'horizontalRule',
  attributes: extra,
  content: []
});

/** One person: a portrait with a name under it, which is a card without being one. */
const person = (name: string, role: string, art: string): Node =>
  stack('column', { name, gap: GAP.tight, sizing: 'fill' }, [
    picture(art, `${name} 사진`, { sizing: 'fill', cornerRadius: ROUND.box, fill: 'var:바탕' }),
    stack('column', { name: `${name} 이름`, gap: 0 }, [paragraph(name), quiet(role)])
  ]);

export function createSampleSite(): SchemaDefinition extends never ? never : Node {
  return {
    stype: 'document',
    /**
     * **What the whole site is set in**, which is a document's decision and not a band's.
     *
     * Loud (1.5) rather than the default 1.25, because this composition makes its impact out of
     * **scale contrast** rather than out of colour — two inks and a headline four steps above the
     * body is the whole move. 17px of body for the same reason from the other end: the quiet ink is
     * held back to three-quarters, and held-back text at 16 on a warm paper is a paragraph people
     * skip.
     *
     * `baseSize` is **twips**, like every length here — see `type-scale.ts` for what reading it as
     * pixels cost.
     */
    attributes: {
      scale: 'loud',
      baseSize: 17 * 15,
      /**
       * And **where it lives**, which four separate things in the export need and none of which the
       * sample was exercising: the canonical link, `og:url`, the sitemap, and a share image written
       * as a relative address. All four are written *only* when a site has said, which is the right
       * rule — a relative canonical says a page is canonical to itself, which is what a duplicate
       * looks like to a crawler — and it meant a fixture with no address published a head with three
       * Open Graph tags out of five and no `sitemap.xml` at all, silently and correctly.
       *
       * The same argument the connection two hundred lines down already makes for its endpoint: what
       * a reader replaces is this string, and what they never have to discover is that it was needed.
       */
      address: 'https://barocss.example'
    },
    content: [
      home(),
      products(),
      pricing(),
      about(),
      blog(),
      /* And two posts of the blog's own, both drawn through the post template — see `post`. */
      post(),
      postSchema(),
      /*
       * And the page the people who **run** the site read, drawn through a template of its own —
       * which is the point of it being here: every piece of this existed and nothing had put them
       * together on a page.
       */
      dashboard(),

      /**
       * The **data** the pages draw from.
       *
       * A resource, beside the footnote bodies and header definitions this schema already keeps
       * there: a thing referenced by name from the flow, saved and undone with the document, and not
       * laid out anywhere itself.
       */
      {
        stype: 'resources',
        attributes: {},
        content: [
          /**
           * **Two small pictures**, which is what a sticker is: an `inline-image` naming a file in
           * the document rather than carrying its bytes.
           *
           * Here because the fixture has to wear what it tests. The picker offers a document's own
           * picture files, and a sample with none offered nothing — so the whole gesture drew an
           * empty grid and looked broken, which is exactly what a reader would have seen.
           *
           * Drawn rather than photographed, and tiny, because every byte of a fixture is a byte in
           * every test that loads it.
           */
          {
            stype: 'asset',
            attributes: {
              name: '하트',
              label: '하트',
              type: 'image/svg+xml',
              data: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBkPSJNMTIgMjAuNVMzLjUgMTQuOCAzLjUgOS40QTQuOSA0LjkgMCAwIDEgMTIgNi4zYTQuOSA0LjkgMCAwIDEgOC41IDMuMWMwIDUuNC04LjUgMTEuMS04LjUgMTEuMXoiIGZpbGw9IiNENjM0MUEiLz48L3N2Zz4=',
              width: 24,
              height: 24
            },
            content: []
          },
          {
            stype: 'asset',
            attributes: {
              name: '확인 도장',
              label: '확인 도장',
              type: 'image/svg+xml',
              data: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI5LjUiIGZpbGw9IiMxNDExMEYiLz48cGF0aCBkPSJNNy42IDEyLjRsMyAzIDUuOC02LjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZDRkJGOSIgc3Ryb2tlLXdpZHRoPSIyLjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==',
              width: 24,
              height: 24
            },
            content: []
          },

          /**
           * **Where a form's answers go** — one place, named, and every form points at it.
           *
           * A resource, like a dataset: a thing referred to by name from the flow. The address is a
           * service's, because this product takes an address somebody gives you and has no opinion
           * about which service — see `docs/specs/site-builder.md`.
           */
          {
            stype: 'service',
            attributes: {
              name: '문의함',
              label: '문의 받는 곳',
              /*
               * A real address, because a sample with a blank one is a sample that reports itself as
               * faulty — and the fault list is a thing this document is *also* a fixture for. What a
               * reader replaces is this string; what they never have to build is the wiring.
               */
              endpoint: 'https://formspree.io/f/barocss-demo',
              method: 'post',
              /*
               * Two things the service has to be told, as hidden fields on the published page: where
               * to send the visitor back to, and which input a bot will fill.
               */
              returnField: '_next',
              trapField: '_gotcha'
            },
            content: []
          },
          {
            stype: 'dataset',
            attributes: {
              name: '상품',
              label: '상품 목록',
              kind: 'inline',
              /**
               * **The columns say what they hold**, which used to be the card's job.
               *
               * A bare list of names still works — a column with nothing said about it is text, and
               * every document written before this has one — but the type belongs here: a column
               * drawn by two cards declared its kind twice, nothing could check a cell, and the grid
               * drew one text box for a price, a date and a page reference alike.
               *
               * `format` stays on the card, and the split is not arbitrary: *what a value is* is the
               * data's, *how this page reads it* is the drawing's. One dataset feeding a price list
               * that says `9,900원` and a summary that says `9.9천` is the whole argument for it.
               */
              fields: [
                { name: '이름', kind: 'text' },
                { name: '설명', kind: 'text' },
                /* Already stored as a number — see the record below for what storing it as words cost. */
                { name: '가격', kind: 'number' },
                { name: '순서', kind: 'number' },
                { name: '분류', kind: 'choice', options: ['제품', '묶음'] }
              ],
              records: [
                /*
                 * **A price is a number.** Written as `'월 9,900원'` the pricing page sorted 문서 ·
                 * 사이트 · 스위트 — a string sort, alphabetical by its first digit — and looked
                 * exactly like a working sort. The words belong to how it is *shown*
                 * (`componentVar.format`), not to what it is.
                 */
                { 이름: '문서', 설명: '문단, 표, 각주까지.', 가격: 9900, 순서: 2, 분류: '제품' },
                { 이름: '덱', 설명: '슬라이드, 도형, 모션.', 가격: 12900, 순서: 3, 분류: '제품' },
                { 이름: '사이트', 설명: '쌓이는 섹션, 브라우저가 배치.', 가격: 7900, 순서: 1, 분류: '제품' },
                { 이름: '스위트', 설명: '셋 다, 한 계정으로.', 가격: 19900, 순서: 4, 분류: '묶음' }
              ]
            },
            content: []
          },
          /**
           * **서식 있는 글**, which is the one kind whose value is not in the cell.
           *
           * `{ 요약: 'text:요약-스택' }`, and the words are here as ordinary blocks — the same shape a
           * footnote has always had in this schema (`footnoteRef` in the flow, `footnoteDef` beside
           * it), and the tenth use of the reference pattern.
           *
           * Which is what the blog's index could not say before: a summary was plain characters, so a
           * post about 스택 could not put the word in italics. The card draws these nodes rather than
           * a string, so the emphasis is real emphasis and the export writes it as one.
           *
           * **And no link in one yet**, which the conformance harness said out loud the first time
           * there was: `removeLink` found the run, said it could run, and changed nothing. It is
           * right — nothing can put a caret in a `richText` until the drawer edits one, so a mark
           * inside it is a mark no command can reach. Recorded in `BACKLOG.md` rather than exempted,
           * because the answer is the editing half rather than a note.
           */
          /**
           * **지표** — the sample's first **live** dataset, and the reason it is here.
           *
           * Everything else this document holds is `inline`: rows a person typed, which is the right
           * default and the one `data-commands.ts` argues for at length — the rows end up *in the
           * document*, so a published page stays a file, a crawler reads the list, and a visitor
           * whose network failed still sees something.
           *
           * A dashboard is the case that trade gets wrong. Numbers that change hourly are the whole
           * point of one, so this is `kind: 'url'` with `live` on — and it is the first thing in the
           * sample that makes `markLiveCharts` run at all. Without it the live path was code with a
           * unit test and no fixture, which is the shape this repository keeps finding faults in.
           *
           * The rows stay anyway, and that is not a contradiction: a `url` dataset keeps a handful to
           * **design against**. A chart with no rows is a box, and a reader arranging a dashboard
           * cannot arrange one of those.
           *
           * The address is `example` on purpose — a fixture that fetched somebody's real endpoint
           * would be a test suite making network calls, and a sample that stops working when a
           * service moves.
           */
          {
            stype: 'dataset',
            attributes: {
              name: '지표',
              label: '월별 지표',
              kind: 'url',
              url: 'https://metrics.barocss.example/monthly.json',
              live: true,
              fields: [
                { name: '달', kind: 'text' },
                { name: '가입', kind: 'number' },
                { name: '해지', kind: 'number' },
                { name: '분류', kind: 'choice', options: ['직접', '추천', '검색'] }
              ],
              records: [
                { 달: '4월', 가입: 128, 해지: 14, 분류: '검색' },
                { 달: '5월', 가입: 164, 해지: 21, 분류: '검색' },
                { 달: '6월', 가입: 142, 해지: 18, 분류: '추천' },
                { 달: '7월', 가입: 203, 해지: 12, 분류: '추천' },
                { 달: '8월', 가입: 251, 해지: 26, 분류: '직접' }
              ]
            },
            content: []
          },
          {
            stype: 'richText',
            attributes: { id: '요약-스택' },
            content: [
              paragraph([
                text('자유 배치를 만들고 나서 알게 된 것: 페이지의 문법은 '),
                emphasised('쌓임'),
                text('이고, 좌표는 폭마다 손으로 놓는 약속입니다.')
              ])
            ]
          },
          {
            stype: 'richText',
            attributes: { id: '요약-모델' },
            content: [
              paragraph([
                text('스키마가 먼저 있었다는 이야기. 워드에서 시작한 노드가 '),
                emphasised('덱과 사이트'),
                text('로 흘러간 경로를 따라갑니다.')
              ])
            ]
          },
          {
            stype: 'dataset',
            attributes: {
              name: '글',
              label: '블로그 글',
              kind: 'inline',
              /**
               * **`페이지`** — which page each row is *about*, and the join that makes a list of
               * posts a list of links.
               *
               * A row's card binds its destination to this field, so each row goes somewhere
               * different. Before it, a card in a list could carry a destination only if every row
               * carried the *same* one — the drawn sid of a row is
               * `${collection}~${index}~${part}`, so the export's lookup landed on the definition's
               * part. A blog whose index could not link to its posts is what found it.
               *
               * A page's **durable id**, not its address — the same reference every link in this
               * document uses, so renaming `/블로그/스택` moves the list's link with it.
               */
              fields: [
                { name: '제목', kind: 'text' },
                /*
                 * **서식 있는 글**, and the first column in this document whose value is a reference
                 * rather than characters: `text:요약-스택` points at blocks in `resources`. A summary
                 * with a link and an emphasised word in it is a summary plain characters could not
                 * hold — see the `richText` nodes above, and `richPlain` for what a part that cannot
                 * take content gets instead.
                 */
                { name: '요약', kind: 'richText' },
                /*
                 * **A date, and the card no longer has to be told.** `post-row` declares 날짜 as a
                 * date so it can be read as *2026년 9월 3일*; that is the card's `format`. That it
                 * *is* a date is this column's fact, and a second card drawing the same column no
                 * longer has to rediscover it.
                 */
                { name: '날짜', kind: 'date' },
                /*
                 * **A boolean spelled as words, until there was somewhere to say it was one.** It
                 * held `'예'` and `'아니오'` — and nothing on the site reads it, which is the other
                 * half of the finding: a column that could not say what it was is a column nothing
                 * could do anything with. Now it is `true`/`false` and a list can filter on it.
                 */
                { name: '추천', kind: 'boolean' },
                { name: '페이지', kind: 'page' }
              ],
              records: [
                {
                  제목: '스택이 페이지의 문법이다',
                  요약: 'text:요약-스택',
                  날짜: '2026-09-03',
                  추천: true,
                  페이지: 'page:post-stack'
                },
                {
                  제목: '한 문서 모델로 세 제품',
                  요약: 'text:요약-모델',
                  날짜: '2026-08-02',
                  추천: true,
                  페이지: 'page:post-schema'
                },
                {
                  제목: '커서는 누구의 것인가',
                  요약: '입력 경로를 다시 그린 기록.',
                  날짜: '2026-07-19',
                  추천: false,
                  /* Written, but not yet a page here — see below. */
                  페이지: ''
                },
                {
                  제목: '측정하고 나서 만들기',
                  요약: '스크린샷 한 장이 찾아낸 것들.',
                  날짜: '2026-06-30',
                  추천: false,
                  /* No page yet — a row may be a note about something unwritten. An empty answer
                     writes no destination, so the card publishes as the box it is rather than as a
                     link to nowhere: `<a>` with no `href` is what a *broken* reference produces, and
                     these two are not broken. */
                  페이지: ''
                }
              ]
            },
            content: []
          }
        ]
      },

      components(),

      /**
       * The site's **design tokens**.
       *
       * `variable` is the deck's node doing on a page the job it is most obviously for: a brand
       * colour written once and referred to as `var:강조` everywhere. Changing it changes the site,
       * and a file records the reference rather than what it meant on the day it was saved.
       *
       * The palette is ink, paper and one accent. The accent is a **deep green** because the blue
       * this sample used to be is the colour every developer tool reaches for first, and the greys
       * are mixed a few degrees toward it so they read as chosen rather than inherited.
       */
      {
        stype: 'variables',
        attributes: {},
        content: [
          /**
           * **Two inks and a paper**, which is the whole palette.
           *
           * The sample was a green SaaS site: a brand green, two shades of it, a warm orange used
           * once, and four greys mixed toward the green. Six hues, no dominance, and the exact look
           * every generated marketing page has.
           *
           * So: **먹 dominates and 강조 interrupts.** The charcoal carries every word, every rule and
           * every dark band — it is the page. The red is the second plate, and a second plate is
           * spent, not spread: a bar, a badge, a pressed state, the one card that matters.
           *
           * The **names did not change**, and that is the token system doing its job: nine values
           * were rewritten here and every one of the places that follows one came out repainted
           * without being touched.
           */
          /*
           * **Darkened to 4.65:1**, which is a measurement rather than a taste. It was `#E03A1F`,
           * and 종이 on it came out at **4.24** — under AA for text at body size, on every button,
           * badge and price on the site, looking fine the whole time. The rule this records: an
           * accent that carries words has to be measured against them.
           */
          { stype: 'variable', attributes: { name: '강조', label: '두 번째 잉크', kind: 'color', value: '#D6341A' } },
          { stype: 'variable', attributes: { name: '강조밝음', label: '두 번째 잉크 밝은 쪽', kind: 'color', value: '#FF6A4D' } },
          /*
           * The pressed-in red, which exists because **three** things wanted the same darker accent
           * under a pointer — the button, the ghost button and the navigation.
           */
          { stype: 'variable', attributes: { name: '강조진함', label: '두 번째 잉크 눌린 쪽', kind: 'color', value: '#B32612' } },
          { stype: 'variable', attributes: { name: '바탕', label: '띠 바탕', kind: 'color', value: '#F2EFEA' } },
          { stype: 'variable', attributes: { name: '면', label: '카드 면', kind: 'color', value: '#FFFFFF' } },
          { stype: 'variable', attributes: { name: '종이', label: '페이지 종이', kind: 'color', value: '#FCFBF9' } },
          { stype: 'variable', attributes: { name: '먹', label: '첫 번째 잉크', kind: 'color', value: '#14110F' } },
          { stype: 'variable', attributes: { name: '선', label: '경계선', kind: 'color', value: '#E3DED6' } },
          /*
           * And **no token for the quiet tone**, deliberately. It is not a colour a document holds:
           * it is the band's own ink held back, written once in `page-css.ts` against `currentColor`
           * so a dark band gets it too. A token here would be a third hue with a name.
           */
          { stype: 'variable', attributes: { name: '회사', label: '회사 이름', kind: 'text', value: 'Barocss' } }
        ]
      }
    ]
  } as Node;
}

/** Every page wears the same paper. */
/**
 * And **the sentence each page is found by**, which this sample did not have.
 *
 * Measured by exporting it: five pages, each with a `lang`, a `<title>`, a viewport and nothing
 * else — no description, no Open Graph, nothing. Every one of the four places `description` has to
 * be alive in was alive: the schema declares it, `export-html` writes it, the panel offers a 설명
 * row, and `setPageInfo` accepts it. Nobody had ever written one.
 *
 * Which is the thing a sample is for, and the reason it is `required` here rather than optional:
 * the fixture is the only document anybody reads, so a fixture that does not wear a feature is a
 * feature nobody has ever seen work. `faults.ts` now says so for any page, and a sample that trips
 * its own fault list is a sample nobody would trust about anything else.
 *
 * Under 160 characters each, which is where a search result cuts — and written from what the page
 * actually says rather than from what a landing page usually says.
 */
const pageAttrs = (id: string, name: string, path: string, description: string) => ({
  kind: 'flow',
  id,
  name,
  path,
  description,
  fill: 'var:종이'
});

/** `/` — the one a visitor lands on. */
function home(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs(
      'home',
      '홈',
      '/',
      '문서와 프레젠테이션과 사이트를 한 스키마로 만듭니다. 브랜드 색과 글꼴을 한 번 적으면 세 제품이 그것을 씁니다. 이 페이지도 그중 하나로 만들었습니다.'
    ),
    content: [
      placed('site-header', {}, HEADER),

      /**
       * The hero: words on the left, the product on the right, and a grid faintly behind both.
       *
       * Asymmetric rather than centred, and 7 to 5 rather than half and half, because a centred hero
       * is what a page looks like when nobody decided. The picture holds a width of its own until
       * there is no room for it beside the words, and then the whole thing becomes a column.
       *
       * Two sentences under the claim rather than one — see `docs/specs/site-content.md`: the first
       * says what this is and the second says what it replaces, and a hero with only the first is
       * the shape a reader called thin.
       */
      stack(
        'column',
        {
          name: '히어로',
          /**
           * **Stretch**, and the row inside centres itself — which is the fix `section` carries a
           * comment about and this band, written by hand, never got.
           *
           * `center` in a flex column centres a child **at its content width**, and a child whose
           * content does not fit overflows *both* sides equally instead of being clamped. Measured on
           * the three boards: the row wants 804px, the tablet band's content box is 754, so 25px
           * escaped on each side and a 40px padding drew as 15. On the phone a 20 drew as 5. Desktop
           * looked perfect because 1136 of content fits inside 1136.
           *
           * So the visible symptom was *the content ignores the padding on tablet and phone*, and the
           * cause was a value that is correct at one width and wrong at the two nobody checked.
           */
          alignItems: 'stretch',
          /*
           * **Taller.** The paper showing is a decision: the composition asks for a quarter to a half
           * of the page to be ground, and a hero that fills to its edges has nothing to be loud
           * against.
           */
          paddingTop: px(136),
          paddingBottom: px(140),
          paddingLeft: AIR.side,
          paddingRight: AIR.side,
          backgroundImage: gridTexture('#14110F', 0.05),
          backgroundFit: 'tile',
          overrides: {
            tablet: { paddingTop: px(64), paddingBottom: px(72), paddingLeft: px(40), paddingRight: px(40) },
            mobile: { paddingTop: px(48), paddingBottom: px(56), paddingLeft: px(20), paddingRight: px(20) }
          }
        },
        [
          stack(
            'row',
            {
              name: '히어로 줄',
              gap: px(64),
              // Vertical, which is what `center` means on a **row**: the words beside the picture.
              alignItems: 'center',
              maxWidth: WIDTH.page,
              // And it centres itself, now that the band above stretches rather than centring it.
              centred: true,
              /**
               * **Both narrow widths become a column**, not only the phone.
               *
               * It said `mobile` alone, so a tablet kept the 7-to-5 row — and 7 to 5 of 754px is a
               * 440px column of words beside a 270px picture, which is neither. The row's content
               * wanted 804px in a box of 754, and flex let it overflow rather than shrink: the
               * symptom a reader reported was *the hero ignores its padding on tablet*, which is the
               * same fault seen from the other end.
               *
               * The rule this sample keeps forgetting is in `site-builder.md`: a layout that changes
               * at one width almost always changes at both, and the tablet is the width nobody looks
               * at because it is neither of the two a person has open.
               */
              overrides: {
                tablet: { layoutMode: 'column', gap: px(40) },
                mobile: { layoutMode: 'column', gap: px(32) }
              }
            },
            [
              stack(
                'column',
                {
                  name: '히어로 글',
                  gap: GAP.mid,
                  sizing: 'fill',
                  minWidth: px(360),
                  /*
                   * **Set tighter than the page.** The type scale grows this heading four steps, and
                   * leading that was right for a paragraph opens a gap between the lines you could
                   * park in. On the box rather than on the heading, and inherited — `paint.ts` says
                   * why, and why the unit is a percentage of the font's own size.
                   */
                  letterSpacing: -3,
                  lineHeight: 104
                },
                [
                plate(),
                heading(1, '문서 한 벌로 세 가지를 만듭니다'),
                paragraph([
                  text(
                    '워드프로세서와 프레젠테이션과 웹사이트가 같은 스키마, 같은 렌더러 위에서 움직입니다. 표를 슬라이드에서 문서로 옮겨도 표인 채로 남고, 편집기에서 본 화면이 그대로 내보내집니다.'
                  )
                ]),
                paragraph([
                  text('세 제품을 따로 사서 붙이던 자리를 대신합니다. '),
                  text('이 페이지도 그중 하나로 만들었습니다.')
                ]),
                stack('row', { name: '히어로 버튼', gap: GAP.tight, sizing: 'hug', alignItems: 'center' }, [
                  placed('cta', { 문구: '무료로 시작하기' }, { goes: pageRef('pricing'), sizing: 'hug' }),
                  placed('ghost', { 문구: '문서 읽기' }, { goes: 'https://docs.barocss.example', sizing: 'hug' })
                ])
                ]
              ),
              /*
               * **The one deliberate disruption**, and it is the picture rather than a card. A page
               * of upright rectangles reads as a template whatever is in them; two degrees is enough
               * — a reader does not notice the angle, they notice that somebody placed it.
               */
              picture(enginePicture(), '문서와 덱과 페이지가 한 화면에 놓인 그림', {
                rotate: -2,
                sizing: 'fixed',
                minWidth: px(440),
                maxWidth: px(520),
                cornerRadius: ROUND.box,
                shadowColor: 'rgba(20, 17, 15, 0.16)',
                shadowBlur: px(48),
                shadowDistance: px(18),
                overrides: {
                  tablet: { minWidth: px(320), maxWidth: px(380) },
                  mobile: { sizing: 'fill', minWidth: 0 }
                }
              })
            ]
          )
        ]
      ),

      /*
       * Who uses it, directly under the hero rather than inside it — the hero is for the claim and
       * the one thing to press. Marks and nothing else: a category label under a logo tells a reader
       * what they can already see.
       */
      section(
        '쓰는 곳',
        {
          paddingTop: 0,
          paddingBottom: px(28),
          overrides: {
            tablet: { paddingTop: 0, paddingBottom: px(20), paddingLeft: px(40), paddingRight: px(40) },
            mobile: { paddingTop: 0, paddingBottom: px(16), paddingLeft: px(20), paddingRight: px(20) }
          }
        },
        [
          stack(
            'row',
            {
              name: '로고 줄',
              justifyContent: 'between',
              alignItems: 'center',
              gap: GAP.mid,
              /**
               * **Printed into the paper**, which is what a second run through a press does and what
               * `multiply` is for: the marks take the ground's warmth instead of sitting on it as
               * four black stamps. Held back to two-thirds as well — a row of customers is evidence
               * and not a claim.
               */
              blend: 'multiply',
              opacity: 0.66,
              overrides: { mobile: { layoutMode: 'grid', columns: 2, gap: GAP.mid } }
            },
            [
              picture(monogram('한결제작소', '#14110F'), '한결제작소', { sizing: 'hug', fit: 'contain', maxWidth: px(150) }),
              picture(monogram('여름출판', '#14110F'), '여름출판', { sizing: 'hug', fit: 'contain', maxWidth: px(150) }),
              picture(monogram('삼각연구소', '#14110F'), '삼각연구소', { sizing: 'hug', fit: 'contain', maxWidth: px(150) }),
              picture(monogram('물결', '#14110F'), '물결', { sizing: 'hug', fit: 'contain', maxWidth: px(150) })
            ]
          )
        ],
        { gap: GAP.mid }
      ),

      /**
       * The turn: the sentence that makes the rest worth reading.
       *
       * One paragraph on its own measure, before any feature is named. A page that goes from the
       * claim straight to a row of cards is a page that never said why the cards matter.
       */
      section('문제', { paddingBottom: px(48) }, [
        stack('column', { name: '문제 글', gap: GAP.mid, maxWidth: WIDTH.text, letterSpacing: -1.5 }, [
          plate(56),
          heading(2, '같은 표를 세 번 만들고 계신가요'),
          quiet(
            '문서에서 만든 표를 슬라이드에 붙이면 그림이 되고, 그 슬라이드를 웹에 올리면 다시 이미지가 됩니다. 도구가 셋이면 서식도 셋이고, 고칠 곳도 셋입니다.'
          ),
          quiet(
            '한 모델 위에 올리면 그 셋이 한 번이 됩니다. 표는 어디로 가도 표이고, 브랜드 색을 바꾸면 세 제품이 함께 바뀝니다.'
          )
        ])
      ]),

      /**
       * The trio, and it is deliberately **not** three of the same width.
       *
       * Three identical cards side by side is the layout a page falls into when the content was not
       * ranked. The first one is the product this page is about and is wider; the other two are the
       * pair it is usually bought with. Each card is a noun and two sentences — the length the
       * content model says a capability takes.
       */
      section('카드 줄', {}, [
        stack('column', { name: '카드 머리', gap: GAP.hair, maxWidth: WIDTH.text, letterSpacing: -1.5 }, [
          plate(56),
          heading(2, '세 제품, 한 문서'),
          quiet('무엇을 만들든 문단은 문단이고 표는 표입니다. 제품이 다른 것은 그것을 어떻게 배치하느냐뿐입니다.')
        ]),
        /**
         * **A bento, not three of the same width** — and it took a schema attribute to say it.
         *
         * A `minWidth` on the first card is a nudge a browser ignores the moment the row is narrow,
         * so at every width anybody uses it drew three equal columns: the single most recognisable
         * layout a generated page has. A grid of three where the first takes **two** says it and
         * cannot be ignored, and that is what `span` is for.
         */
        stack(
          'grid',
          {
            name: '제품 셋',
            columns: 3,
            gap: GAP.mid,
            alignItems: 'stretch',
            overrides: {
              tablet: { gap: px(16) },
              mobile: { columns: 1, gap: px(16) }
            }
          },
          [
            card(
              '사이트',
              '섹션을 쌓으면 브라우저가 배치합니다. 폭마다 다른 것만 적어두면 한 문서가 세 화면이 됩니다. 이 페이지가 그 결과입니다.',
              { span: 2, overrides: { mobile: { span: 1 } } }
            ),
            card('문서', '문단, 표, 각주, 목차. 페이지로 나누고 머리말을 반복하는 일은 워드가 맡습니다.'),
            /*
             * Across all three, so the second row closes rather than trailing off: a gap at the end
             * of a grid reads as a card that failed to load, where a gap inside one reads as a
             * decision.
             */
            card('덱', '슬라이드 위 좌표에 도형을 놓고, 순서대로 등장시킵니다. 발표자 화면과 노트가 함께 옵니다.', {
              span: 3,
              overrides: { mobile: { span: 1 } }
            })
          ]
        )
      ]),

      /*
       * The product list: **one** placement in the document, three cards on the screen.
       *
       * `sortBy: '순서'` is why the rows are not in the order they are written — the point of data
       * rather than typing — and `where`/`equals` keeps the bundle off the front page.
       */
      section('요금 미리보기', {}, [
        stack('column', { name: '요금 머리', gap: GAP.hair, maxWidth: WIDTH.text, letterSpacing: -1.5 }, [
          plate(56),
          heading(2, '값은 쓰는 만큼'),
          quiet('제품 하나만 쓰거나, 셋을 한 계정으로 씁니다. 사람 수가 아니라 계정 수로 셉니다.')
        ]),
        {
          stype: 'collection',
          attributes: {
            name: '상품 목록',
            source: '상품',
            sortBy: '순서',
            where: '분류',
            equals: '제품',
            layoutMode: 'row',
            gap: GAP.mid,
            sizing: 'fill',
            alignItems: 'stretch',
            overrides: { mobile: { layoutMode: 'column', gap: px(16) } }
          },
          content: [placed('product-card', { 이름: 'field:이름', 설명: 'field:설명', 가격: 'field:가격' })]
        }
      ]),

      /**
       * One engine, said as a sentence and then as three numbers.
       *
       * The layout family here is used once on the site: a wide statement with the numbers spread
       * under it by `justifyContent`. Repeating a family is what makes a page read as a template.
       */
      section('한 엔진', { fill: 'var:바탕' }, [
        stack('column', { name: '한 엔진 글', gap: GAP.mid, maxWidth: WIDTH.text }, [
          heading(2, '엔진이 하나라서 생기는 일'),
          quiet(
            '스키마가 한 벌이면 덱에서 붙여 넣은 표가 문서에서도 표입니다. 렌더러가 한 벌이면 편집기가 그린 것과 내보낸 파일이 같습니다.'
          ),
          quiet('그래서 새 제품이 하나 늘어도 배워야 할 문서 모델은 그대로입니다.')
        ]),
        stack(
          'row',
          {
            name: '숫자',
            justifyContent: 'between',
            gap: GAP.wide,
            paddingTop: px(12),
            overrides: { mobile: { layoutMode: 'column', gap: px(20) } }
          },
          [
            stack('column', { name: '숫자 하나', gap: GAP.hair, sizing: 'fill' }, [
              paragraph([atSize('107', '44px', 'D6341A')]),
              paragraph('문서 모델이 아는 노드 종류'),
              quiet('문단부터 각주, 도형, 표까지 한 스키마 안에 있습니다.')
            ]),
            stack('column', { name: '숫자 둘', gap: GAP.hair, sizing: 'fill' }, [
              paragraph([atSize('24', '44px', 'D6341A')]),
              paragraph('글자에 붙는 서식'),
              quiet('굵기와 색부터 각주 표시, 언어 표시까지 같은 방식으로 붙습니다.')
            ]),
            stack('column', { name: '숫자 셋', gap: GAP.hair, sizing: 'fill' }, [
              paragraph([atSize('1', '44px', 'D6341A')]),
              paragraph('편집기와 내보내기가 함께 쓰는 렌더러'),
              quiet('화면과 파일이 다를 수 있는 자리가 아예 없습니다.')
            ])
          ]
        )
      ]),

      /**
       * How it works: three verbs.
       *
       * Not `1단계 / 2단계 / 3단계` — the step's own word is the label, and a number in front of it
       * is a number a reader has to read before the word.
       */
      section('시작하는 법', {}, [
        stack('column', { name: '순서 머리', gap: GAP.hair, maxWidth: WIDTH.text, letterSpacing: -1.5 }, [
          plate(56),
          heading(2, '오늘 안에 첫 페이지'),
          quiet('설치할 것도, 옮겨올 것도 없습니다. 계정을 만들면 빈 문서 하나가 열립니다.')
        ]),
        stack(
          'grid',
          {
            name: '순서 셋',
            columns: 3,
            gap: GAP.wide,
            overrides: { tablet: { columns: 3, gap: px(24) }, mobile: { columns: 1, gap: px(20) } }
          },
          [
            stack('column', { name: '쌓기', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '쌓기'),
              quiet('섹션을 세로로 쌓고 그 안에 글과 그림을 넣습니다. 폭은 브라우저가 정합니다.')
            ]),
            stack('column', { name: '묶기', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '묶기'),
              quiet('반복되는 카드는 컴포넌트로 묶습니다. 한 곳을 고치면 놓인 자리가 모두 바뀝니다.')
            ]),
            stack('column', { name: '내보내기', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '내보내기'),
              quiet('페이지마다 HTML 한 벌. 좁은 폭 규칙까지 함께 나옵니다.')
            ])
          ]
        )
      ]),

      /* One quote, two lines, with a name and a role under it. */
      section('한마디', { paddingTop: px(64) }, [
        stack(
          'column',
          {
            name: '인용',
            gap: GAP.mid,
            maxWidth: WIDTH.text,
            padding: px(32),
            fill: 'var:면',
            cornerRadius: ROUND.box,
            stroke: 'var:선',
            strokeWidth: px(1)
          },
          [
            quoteOf(
              '“편집기에서 본 것과 내보낸 파일이 같습니다. 검수에 쓰던 시간이 절반으로 줄었어요.”',
              '임세라 · 한결제작소 편집팀'
            )
          ]
        )
      ]),

      /**
       * The questions a reader leaves over, answered where they would leave.
       *
       * Two levels of stack rather than a list: a question and its answer are a tight pair, and the
       * pairs are far apart. One list with one gap cannot say that, which is what the content model
       * means by "a column with a small gap inside a larger one".
       */
      section('묻는 것들', { paddingTop: px(64) }, [
        stack('column', { name: '질문 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [heading(2, '자주 묻는 것')]),
        /*
         * A column and not a grid: an accordion is read down, and two columns of openers means a
         * reader's eye has to choose a side before it can choose a question.
         */
        stack(
          'column',
          {
            name: '질문 여섯',
            gap: 0,
            /*
             * **Several may be open**, deliberately. `opensOne` makes the switches radios, and a
             * reader comparing two answers should not lose the first one by opening the second — a
             * FAQ is read, not navigated. The tabs on the 제품 page are the other case and use it.
             */
            maxWidth: WIDTH.text
          },
          [
            ask('쓰던 문서를 가져올 수 있나요', '워드 파일을 열면 문단과 표와 각주가 그대로 들어옵니다. 그림은 도형으로 들어와서 계속 편집할 수 있습니다.', 'import'),
            ask('내보낸 페이지는 어디에 올리나요', '정적 파일이라 아무 데나 올라갑니다. 서버도, 이 회사의 계정도 필요 없습니다.', 'host'),
            ask('팀으로 쓰면 어떻게 되나요', '계정을 나눠 쓰고 문서는 링크로 공유합니다. 동시에 편집하는 기능은 아직 없습니다.', 'team'),
            ask('그만두면 문서는요', '전부 내려받을 수 있습니다. 문서 형식이 공개되어 있어 다른 도구에서도 읽힙니다.', 'leave'),
            ask('무료로 어디까지 되나요', '한 사람이 한 사이트를 만들어 내보내는 데까지는 값을 내지 않습니다. 두 번째 사이트부터 요금제를 고릅니다.', 'free'),
            ask('만든 사이트는 제 것인가요', '내보낸 파일이 전부입니다. 이 회사가 문을 닫아도 그 폴더는 그대로 웹에 올라가 있습니다.', 'mine')
          ]
        )
      ]),

      /**
       * The closing band, and the **one** place on the page where the theme flips.
       *
       * A page that alternates light and dark down its length reads as several pages stapled
       * together. One switch, at the end, running into the footer, is a decision a reader can see.
       */
      section(
        '마무리',
        {
          fill: 'var:먹',
          gradientFrom: '#14110F',
          gradientTo: '#2A1512',
          gradientAngle: 160,
          /*
           * The band says what is written on it, once.
           *
           * It did not, and the heading came out near-black on a near-black gradient — measured at
           * 1.06:1, in both themes, on a page this repository has screenshotted a dozen times. The
           * paragraph under it read fine only because its colour was set run by run, which is the
           * workaround this attribute replaces: one statement here, and the heading, the paragraph
           * and anything added to the band later all take it.
           */
          ink: 'var:종이',
          paddingTop: px(96),
          paddingBottom: px(96)
        },
        [
          stack('column', { name: '마무리 글', gap: GAP.mid, alignItems: 'center', maxWidth: WIDTH.text }, [
            heading(2, '문서 하나로 시작해 보세요'),
            // Quieter than the heading above it, and a colour of its own for that reason only.
            paragraph([
              text('계정을 만들면 세 제품이 함께 열립니다. 카드 정보는 나중에 물어봅니다.')
            ]),
            placed('cta', { 문구: '무료로 시작하기' }, { goes: pageRef('pricing'), sizing: 'hug' })
          ])
        ],
        { alignItems: 'center' }
      ),

      placed('site-footer')
    ]
  };
}

/** A question and its answer: a tight pair, drawn as one block. */
/**
 * One question of the FAQ, as a row that **opens**.
 *
 * It was a card in a grid, which is what a page builder with no 열림 has to do — and it is the wrong
 * drawing for the content twice over. Six answers of several sentences each is a wall a reader skims
 * rather than reads, and a question whose answer is already on screen is not a question, it is a
 * heading. An accordion asks six and shows the one somebody wanted.
 *
 * Named after the **question** rather than 항목, which is what the panel and the layer list show: a
 * column of six rows all called 항목 is a list nobody can navigate.
 */
const ask = (question: string, answer: string, part: string): Node =>
  stack(
    'column',
    { name: question, gap: 0, paddingTop: px(4), paddingBottom: px(4), stroke: 'var:선', strokeWidth: px(1) },
    [
      stack(
        'row',
        {
          name: `${question} 묻기`,
          partId: `ask-${part}`,
          alignItems: 'center',
          paddingTop: px(14),
          paddingBottom: px(14),
          /*
           * The opener names the answer, and `openSwitches` publishes a checkbox before it — so the
           * whole thing works on a page whose script failed, on a crawler, and from a keyboard.
           */
          opens: `answer-${part}`
        },
        [heading(3, question)]
      ),
      stack(
        'column',
        {
          name: `${question} 답`,
          partId: `answer-${part}`,
          gap: GAP.hair,
          paddingBottom: px(14),
          maxWidth: WIDTH.text,
          visible: false,
          states: { open: { visible: true } }
        },
        [quiet(answer)]
      )
    ]
  );

/** `/제품` — a **grid**, the third arrangement and the one nothing else on the site uses. */
function products(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs(
      'products',
      '제품',
      '/제품',
      '문서, 덱, 사이트가 같은 문서 규칙을 따릅니다. 노드 하나를 더하면 세 제품이 함께 알게 되고, 새 제품에서 다시 만드는 것은 배치뿐입니다.'
    ),
    content: [
      placed('site-header', {}, HEADER),
      section('제품 머리', { paddingBottom: px(28) }, [
        stack('column', { name: '제품 머리 글', gap: GAP.tight, maxWidth: WIDTH.text, letterSpacing: -2 }, [
          plate(),
          heading(1, '세 제품, 한 스키마'),
          quiet(
            '무엇을 만들든 문서는 같은 규칙을 따릅니다. 아래는 그 규칙이 실제로 무엇이고, 그것이 만드는 사람에게 무엇을 덜어주는지입니다.'
          )
        ])
      ]),
      /*
       * The order a reader does things in — a **numbered** list, which is the one case where the
       * marker carries information rather than decorating it: swap two of these and the sentence is
       * wrong, which is not true of the bullets on 소개.
       */
      /**
       * **A video and a map**, because a fixture that does not wear a feature is a feature nobody
       * has seen work.
       *
       * Both are the browser's own elements and neither ships a byte of script — which is the point
       * being demonstrated as much as the shape: a page that plays a video and shows a map is a page
       * every builder is asked for, and this one does it with `<video>` and `<iframe>`.
       *
       * The embed holds a **provider and an id** rather than a URL, so a company changing its address
       * shape does not break this page — `embed.ts` says why, and this is the reference shape's
       * seventh use.
       */
      section('보여주기', { paddingTop: 0, paddingBottom: px(40) }, [
        stack('column', { name: '보여주기 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [
          plate(52),
          heading(2, '움직이는 걸 보는 게 빠릅니다'),
          quiet('90초짜리 소개입니다. 소리는 없어도 됩니다.')
        ]),
        /*
         * A video of the product itself, muted and looping — which is what a hero clip is, and the
         * one combination that must never be a film: a video that plays sound at somebody who has
         * just opened a page is the reason every browser now blocks it.
         */
        {
          stype: 'mediaVideo',
          attributes: {
            name: '움직이는 화면',
            /*
             * An address rather than a file in the document, deliberately: a video is megabytes, and
             * `assetFaults` reports a document that has grown past a few. What a reader replaces is
             * this string.
             */
            src: 'https://barocss.example/움직이는-화면.mp4',
            poster: 'asset:하트',
            muted: true,
            loop: true,
            controls: false,
            aspect: '16/9',
            sizing: 'fill',
            cornerRadius: ROUND.box,
            maxWidth: WIDTH.page
          },
          content: []
        } as unknown as Node,
        {
          stype: 'mediaEmbed',
          attributes: {
            name: '소개 영상',
            provider: 'youtube',
            id: 'dQw4w9WgXcQ',
            title: '바로시스 소개 영상',
            aspect: '16/9',
            sizing: 'fill',
            cornerRadius: ROUND.box,
            maxWidth: WIDTH.page
          },
          content: []
        } as unknown as Node
      ]),

      section('시작하는 순서', { paddingTop: 0, paddingBottom: px(40) }, [
        stack('column', { name: '순서 글', gap: GAP.tight, maxWidth: WIDTH.text }, [
          heading(2, '시작하는 순서'),
          listOf('ordered', [
            '문서를 하나 만듭니다. 워드로 시작하든 사이트로 시작하든 같은 문서입니다.',
            '브랜드 색과 글꼴을 한 번 적습니다. 세 제품이 그것을 씁니다.',
            '만든 것을 내보냅니다. 편집기에서 본 것이 그대로 나옵니다.'
          ])
        ])
      ]),
      section('기능 그리드', { paddingTop: 0 }, [
        stack(
          'grid',
          {
            name: '기능 여섯',
            columns: 3,
            gap: GAP.mid,
            // Two columns on a tablet, one on a phone: the reason a grid states its columns at all.
            overrides: { tablet: { columns: 2 }, mobile: { columns: 1 } }
          },
          [
            card('스키마', '문서가 무엇으로 이루어지는지 한 곳에서 말합니다. 노드 하나를 더하면 세 제품이 함께 알게 됩니다.'),
            card('명령', '읽을 수 있는 하나의 이름, 하나의 되돌리기. 마흔 칸을 한 번에 바꿔도 Ctrl+Z 한 번입니다.'),
            card('렌더러', '노드 하나가 그림 하나가 됩니다. 편집기와 내보내기가 같은 함수를 씁니다.'),
            card('선택', '선택은 집합입니다. 카드 셋을 함께 옮기고, 함께 채우고, 함께 지웁니다.'),
            card('반응형', '좁은 폭은 다른 것만 적습니다. 넓은 폭을 고치면 좁은 폭도 따라옵니다.'),
            card('데이터', '디자인 하나에 행 마흔 개. 표를 고치면 카드 마흔 장이 함께 바뀝니다.')
          ]
        )
      ]),
      /*
       * A comparison that is not a table with a hairline under every row: three columns of two
       * sentences each, which is the same information a reader can actually read.
       */
      section('무엇이 다른가', { fill: 'var:바탕' }, [
        stack('column', { name: '비교 머리', gap: GAP.hair, maxWidth: WIDTH.text, letterSpacing: -1.5 }, [
          plate(56),
          heading(2, '무엇이 다르고, 무엇이 같은가'),
          quiet('셋은 배치만 다릅니다. 문단과 표와 도형은 세 곳에서 같은 것을 뜻합니다.')
        ]),
        stack(
          'row',
          {
            name: '비교 셋',
            gap: GAP.wide,
            alignItems: 'start',
            overrides: { mobile: { layoutMode: 'column', gap: px(20) } }
          },
          [
            stack('column', { name: '비교 문서', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '문서는 페이지로 나뉩니다'),
              quiet('A4 위에서 줄이 넘치면 다음 장으로 갑니다. 머리말과 쪽 번호가 따라 붙습니다.')
            ]),
            stack('column', { name: '비교 덱', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '덱은 좌표에 놓습니다'),
              quiet('슬라이드 위 정해진 자리에 도형이 놓이고, 등장 순서가 시간 위에 그려집니다.')
            ]),
            stack('column', { name: '비교 사이트', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '사이트는 폭이 정합니다'),
              quiet('섹션이 세로로 쌓이고, 남은 배치는 브라우저가 합니다. 좁아지면 규칙만 바뀝니다.')
            ])
          ]
        )
      ]),
      section('제품 마무리', { paddingTop: px(64) }, [
        stack(
          'row',
          {
            name: '제품 마무리 줄',
            justifyContent: 'between',
            alignItems: 'center',
            gap: GAP.wide,
            padding: px(28),
            fill: 'var:면',
            cornerRadius: ROUND.box,
            stroke: 'var:선',
            strokeWidth: px(1),
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(16) } }
          },
          [
            stack('column', { name: '제품 마무리 글', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '어느 것부터 열어도 됩니다'),
              quiet('한 계정으로 셋이 함께 열립니다. 쓰지 않는 제품은 값을 내지 않습니다.')
            ]),
            placed('cta', { 문구: '무료로 시작하기' }, { goes: pageRef('pricing'), sizing: 'hug' })
          ]
        )
      ]),
      placed('site-footer')
    ]
  };
}

/** `/가격` — a highlighted plan and a fixed sidebar, which nothing else on the site is. */
function pricing(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs(
      'pricing',
      '가격',
      '/가격',
      '제품 하나씩 월 7,900원부터, 셋을 묶으면 월 19,900원. 언제든 그만둘 수 있고 남은 기간은 돌려드립니다. 무료로 쓰는 동안 카드 정보는 묻지 않습니다.'
    ),
    content: [
      placed('site-header', {}, HEADER),
      section('가격 머리', { paddingBottom: px(28) }, [
        stack('column', { name: '가격 머리 글', gap: GAP.tight, maxWidth: WIDTH.text, letterSpacing: -2 }, [
          plate(),
          heading(1, '가격'),
          quiet('쓰는 만큼 냅니다. 언제든 그만둘 수 있고, 남은 기간은 돌려드립니다. 카드 정보는 무료로 쓰는 동안 묻지 않습니다.')
        ])
      ]),

      /**
       * The recommended plan, ahead of the list rather than taller than it.
       *
       * A pricing page is three towers with one of them stretched, in every product that has one.
       * This says the same thing with colour and position instead: the plan being recommended is
       * *out of the row*, above it, and it is the only place on the site that uses the second
       * accent — which is what "one accent" means in practice.
       */
      /**
       * **The plans as a picture**, from the same rows the cards are drawn from.
       *
       * The first chart in this document, and it is on the pricing page rather than on a dashboard of
       * its own on purpose: a chart is worth having where a reader is already comparing numbers, and
       * four prices in four cards is exactly the comparison a bar makes in one glance.
       *
       * It names **상품** — the dataset the cards beside it draw — so the two are about the same
       * thing rather than about two copies of it. And it asks the same query a list asks (`sortBy`,
       * `sortDir`), deliberately with the same attributes, which is the whole argument for a chart
       * being a node here instead of an embed pointing at a charting service.
       *
       * `가격` is a **number** column, which is what makes any of this possible — a price stored as
       * `월 9,900원` has no height. That is the same fault this dataset already carried once, from the
       * other side: the pricing page sorted 문서 · 사이트 · 스위트 by it and looked exactly like a
       * working sort.
       */
      section('가격 그림', { paddingTop: 0, paddingBottom: px(28) }, [
        stack('column', { name: '가격 그림 글', gap: GAP.mid, maxWidth: WIDTH.text }, [
          heading(2, '한눈에'),
          stack('row', { name: '가격 그림 줄', gap: GAP.wide, alignItems: 'start', sizing: 'fill', overrides: { mobile: { layoutMode: 'column', gap: px(20) } } }, [
          {
            stype: 'chart',
            attributes: {
              name: '요금 막대',
              source: '상품',
              kind: 'bar',
              labelBy: '이름',
              valueBy: '가격',
              sortBy: '순서',
              sortDir: 'asc',
              title: '제품별 월 요금',
              plotInk: 'var:강조',
              sizing: 'share',
              share: 2
            },
            content: []
          },
          /**
           * **And the same rows grouped**, which is the other question a dashboard asks and the one a
           * list cannot answer: 분류별 합계.
           *
           * Two charts side by side is what a dashboard *is* — one saying what each thing costs and
           * one saying what the kinds add up to — and it is why they are here rather than on a page
           * of their own: a chart is worth having where a reader is already comparing numbers.
           *
           * A **donut**, because a share of a whole is what a grouped sum is, and because it is the
           * one kind whose arithmetic is about the drawing rather than the data — the fixture has to
           * wear that too or nothing exercises the angles.
           */
          {
            stype: 'chart',
            attributes: {
              name: '분류 도넛',
              source: '상품',
              kind: 'donut',
              labelBy: '분류',
              valueBy: '가격',
              groupBy: '분류',
              agg: 'sum',
              title: '분류별 합계',
              plotInk: 'var:강조',
              sizing: 'share',
              share: 1
            },
            content: []
          }
          ])
        ])
      ]),
      section('추천 요금제', { paddingTop: 0, paddingBottom: px(28) }, [
        /**
         * **A heading over the plans**, which this section did not have — and the gap was structural
         * rather than decorative.
         *
         * A card's name is an `h3`, correctly: it is a thing inside something. But the something had
         * no heading, so the page went from its `h1` straight to an `h3` and a screen reader's list
         * of headings had a level missing out of it. Measured by walking the published pages and
         * reading their heading levels in order — a check no amount of looking performs.
         *
         * It reads better too: four cards under a page title with nothing saying what they are is a
         * reader working out from the prices what they are looking at.
         */
        stack('column', { name: '요금제 머리', gap: GAP.hair, maxWidth: WIDTH.text, letterSpacing: -1.5 }, [
          plate(56),
          heading(2, '요금제'),
          quiet('제품 하나씩 쓰거나, 셋을 한 계정으로 묶습니다.')
        ]),

        stack(
          'row',
          {
            name: '추천',
            gap: GAP.wide,
            alignItems: 'center',
            padding: px(28),
            fill: 'var:면',
            stroke: 'var:강조',
            strokeWidth: px(2),
            // The one four-cornered box on the site: square where it meets the row under it.
            cornerTopLeft: ROUND.box,
            cornerTopRight: ROUND.box,
            cornerBottomRight: px(4),
            cornerBottomLeft: px(4),
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(16) } }
          },
          [
            /**
             * **The badge that leaves its box** — the first thing on this site to do so, and the one
             * every pricing page has.
             *
             * Negative insets, which is the reason those four are the only lengths in this schema
             * that take one. `zOrder` so it sits over the border rather than under it: the box's own
             * stroke is drawn on the same pixels.
             *
             * An inset is measured from the **padding box**, inside the border, so a badge asked for
             * 24 sits 26 from the outer edge of a box with a 2px stroke. Worth knowing rather than
             * rounding away: it is the difference between a placement that resolved against this box
             * and one that resolved against the page.
             */
            stack(
              'row',
              {
                name: '추천 배지',
                sizing: 'hug',
                alignItems: 'center',
                paddingTop: px(5),
                paddingBottom: px(5),
                paddingLeft: px(12),
                paddingRight: px(12),
                fill: 'var:강조',
                cornerRadius: px(40),
                position: 'absolute',
                insetTop: px(-13),
                insetLeft: px(24),
                zOrder: 1
              },
              [paragraph([atSize('가장 많이 고르는', '12px', 'FFFFFF')])]
            ),
            stack('column', { name: '추천 글', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '스위트'),
              quiet('문서, 덱, 사이트를 한 계정으로. 두 제품 이상 쓰는 팀이면 이쪽이 쌉니다.')
            ]),
            paragraph([atSize('월 19,900원', '22px', '14110F')]),
            placed('cta', { 문구: '무료로 시작하기' }, { goes: pageRef('about'), sizing: 'hug' })
          ]
        )
      ]),

      section('요금제', { paddingTop: 0 }, [
        {
          stype: 'collection',
          attributes: {
            name: '요금제',
            source: '상품',
            sortBy: '가격',
            sortDir: 'desc',
            limit: 3,
            layoutMode: 'row',
            gap: GAP.mid,
            alignItems: 'stretch',
            sizing: 'fill',
            overrides: { mobile: { layoutMode: 'column', gap: px(16) } }
          },
          content: [placed('product-card', { 이름: 'field:이름', 설명: 'field:설명', 가격: 'field:가격' })]
        }
      ]),

      /* What every plan has, so a reader is not comparing absences. */
      section('모두 포함', { paddingTop: px(56) }, [
        stack('column', { name: '포함 머리', gap: GAP.hair, maxWidth: WIDTH.text, letterSpacing: -1.5 }, [
          plate(56),
          heading(2, '어느 요금제든 이건 됩니다'),
          quiet('가격에 따라 달라지는 것은 쓸 수 있는 제품 수뿐입니다.')
        ]),
        /*
         * Down the side and across the top, which is the shape the sentence above it promises. The
         * four boxes that were here said the same words and could not be read down a column.
         */
        comparison(
          ['', '사이트', '문서', '덱'],
          [
            ['파일 내보내기', 'HTML · ZIP', 'DOCX · PDF', 'PPTX · PDF'],
            ['버전 기록', '있음', '있음', '있음'],
            ['글꼴과 색', '한 번 적으면 셋이 씁니다', '같음', '같음'],
            ['평일 지원', '하루 안에', '하루 안에', '하루 안에']
          ]
        )
      ]),

      section('문의', { fill: 'var:바탕' }, [
        stack(
          'row',
          {
            name: '문의',
            gap: GAP.wide,
            alignItems: 'end',
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(20) } }
          },
          [
            stack('column', { name: '문의 글', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '더 큰 팀이신가요'),
              quiet('좌석, 청구, 배포를 함께 이야기합니다. 보통 하루 안에 답합니다.')
            ]),
            // A fixed sidebar: the one place on the site that states a width in twips.
            stack(
              'column',
              { name: '문의 상자', gap: GAP.tight, sizing: 'fixed', minWidth: WIDTH.aside, maxWidth: WIDTH.aside },
              [placed('cta', { 문구: '영업팀에 연락' }, { goes: pageRef('about'), sizing: 'fill' })]
            )
          ]
        )
      ]),
      placed('site-footer')
    ]
  };
}

/** `/소개` — portraits, a list, and words that are not in a card. */
function about(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs(
      'about',
      '소개',
      '/소개',
      '화면보다 스키마가 먼저였고, 기능보다 측정이 먼저였습니다. 워드프로세서와 프레젠테이션과 사이트 빌더를 한 저장소에서 만드는 사람들입니다.'
    ),
    content: [
      placed('site-header', {}, HEADER),
      section('소개 머리', { paddingBottom: px(40) }, [
        stack('column', { name: '소개 머리 글', gap: GAP.mid, maxWidth: WIDTH.text, letterSpacing: -2 }, [
          plate(),
          heading(1, '문서 모델을 만듭니다'),
          quiet(
            '제품 세 개를 만들면서 같은 것을 세 번 만들지 않으려고 했습니다. 그래서 화면보다 스키마가 먼저였고, 기능보다 측정이 먼저였습니다.'
          ),
          quiet(
            '지금은 워드프로세서와 프레젠테이션과 사이트 빌더가 한 저장소 안에서 같은 노드를 씁니다. 새 제품을 만들 때 다시 만드는 것은 배치뿐입니다.'
          ),
          listOf('bullet', [
            '스키마가 먼저입니다. 문서가 무엇인지 정하지 않고 화면부터 그리면 세 번 만들게 됩니다.',
            '측정하고 나서 만듭니다. 없는 기능보다 있는데 아무도 못 쓰는 기능이 더 많았습니다.',
            '놀란 것은 적어둡니다. 다음 사람이 같은 자리에서 다시 놀라지 않도록.'
          ])
        ])
      ]),
      section('사람들', { paddingTop: 0 }, [
        stack('column', { name: '사람들 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [
          heading(2, '만드는 사람들'),
          quiet('셋이서 만들고 있습니다. 각자 맡은 곳이 있지만 문서 모델은 함께 정합니다.')
        ]),
        stack(
          'row',
          {
            name: '사람 줄',
            gap: GAP.mid,
            alignItems: 'start',
            overrides: { mobile: { layoutMode: 'column', gap: px(20) } }
          },
          [
            person('박진호', '문서 모델과 스키마', portrait('#14110F', '#D6341A')),
            person('임세라', '렌더러와 내보내기', portrait('#241C18', '#FF6A4D')),
            person('구현우', '편집 경험과 입력', portrait('#332722', '#D6341A'))
          ]
        )
      ]),
      section('연락', { fill: 'var:바탕', paddingTop: px(64) }, [
        stack(
          'row',
          {
            name: '연락 줄',
            justifyContent: 'between',
            alignItems: 'center',
            gap: GAP.wide,
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(16) } }
          },
          [
            stack('column', { name: '연락 글', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '무엇이든 물어보세요'),
              quiet('문서 모델에 대한 질문이든, 안 되는 것에 대한 제보든 같은 곳으로 옵니다.'),
              placed('ghost', { 문구: 'hello@barocss.com' }, { goes: 'mailto:hello@barocss.example', sizing: 'hug' })
            ]),
            contactForm()
          ]
        )
      ]),
      placed('site-footer')
    ]
  };
}

/**
 * `/블로그/스택` — **one post, drawn through the post template.**
 *
 * The sixth page, and the one that makes the feature visible: it holds a heading and two paragraphs
 * and nothing else, and what a reader sees is the site's header, a readable column with those three
 * blocks in it, and the footer — because the template draws all of that around its slot.
 *
 * Which is the whole argument for an entry being a **page** rather than a row of data: it has an
 * address a visitor can be sent, a description a search result shows, and a body that is *formatted
 * text*. A datum has none of those.
 *
 * **Two** entries rather than one, and rather than twenty.
 *
 * One was the answer for as long as a template was the thing being shown: a sample is read, twenty
 * of anything is scrolled past, and what a second entry proved that the first did not was nothing.
 *
 * It is something now. The index links to its posts through a column of the dataset, and one row
 * going somewhere cannot tell a per-row destination apart from a fixed one — which is precisely the
 * fault that shipped: every row of a list went to the same place, and a fixture with one post would
 * have drawn it correctly. So: two posts, two addresses, and two rows that are *not* links because
 * those two are unwritten.
 */
function post(): Node {
  return {
    stype: 'surface',
    attributes: {
      ...pageAttrs(
        'post-stack',
        '스택이 페이지의 문법이다',
        '/블로그/스택',
        '자유 배치를 만들고 나서 알게 된 것: 다시 흐르는 페이지에서 좌표는 폭마다 손으로 놓는 약속이다.'
      ),
      /* The one attribute that makes this a page of a template rather than a page of its own. */
      template: 'post-page'
    },
    content: [
      heading(1, '스택이 페이지의 문법이다'),
      paragraph(
        '자유 배치를 만들어 달라는 요청을 받고 만들었고, 만든 것 자체는 후회하지 않습니다. 틀린 것은 그것을 스택과 동급으로 둔 것입니다.'
      ),
      paragraph(
        '페이지는 다시 흐릅니다. 좌표로 놓은 블록은 그 전제에서 빠져나가고, 폭이 셋이면 자리를 세 번 말해야 합니다. 그래서 이제 문서가 어느 폭에서 화면 밖에 있는지 말합니다.'
      )
    ]
  };
}

/**
 * `/블로그/한-모델` — **the second post**, and the reason there is a second one.
 *
 * Same template, different words: what a reader sees is the header, the readable column, and the
 * footer, none of which is written here. What it is *for* is the row above it — the index's second
 * row points here, and the first points at `/블로그/스택`, so a build in which every row shared one
 * destination is a build a check can see.
 */
function postSchema(): Node {
  return {
    stype: 'surface',
    attributes: {
      ...pageAttrs(
        'post-schema',
        '한 문서 모델로 세 제품',
        '/블로그/한-모델',
        '스키마가 먼저 있었다는 이야기. 워드에서 시작한 노드가 덱과 사이트로 흘러간 경로를 따라갑니다.'
      ),
      template: 'post-page'
    },
    content: [
      heading(1, '한 문서 모델로 세 제품'),
      paragraph(
        '문단은 워드에서 만들어졌습니다. 덱에서도 문단이고, 지금 읽고 계신 이 페이지에서도 문단입니다. 세 제품이 공유하는 것은 렌더러가 아니라 저장된 모양입니다.'
      ),
      paragraph(
        '그래서 제품마다 다른 것은 어휘가 아니라 어휘 중 무엇을 읽느냐입니다. 페이지는 좌표를 거의 읽지 않고, 덱은 거의 그것만 읽습니다. 스키마에 있는데 아무도 읽지 않는 속성을 세는 일이, 다음에 무엇을 만들지 정하는 방법이 되었습니다.'
      )
    ]
  };
}

/**
 * `/대시보드` — **the page the people who run the site read**, drawn through a template.
 *
 * ## Why the sample has one at all
 *
 * Because every piece of this exists and nothing had put them together: a `url` dataset that
 * refetches in the visitor's browser, charts that group and re-scale, a template that is not a blog's.
 * Each had a unit test; none had a **page**, and this repository's own rule is that a fixture has to
 * wear what it tests — a clean run usually means the fixture is thin, not the product correct.
 *
 * ## And what it is *not*
 *
 * Not marketing. It has no site header, no footer and no call to action, because a dashboard is a
 * page of the **tool** rather than of the site — see `dashboard-page` for why the template's chrome
 * is deliberately less than a public page's.
 *
 * `noIndex`, which is the first page in this sample to say it. A dashboard behind a plain address is
 * as private as the address is, and telling a crawler not to read it is the least a page can do.
 */
function dashboard(): Node {
  return {
    stype: 'surface',
    attributes: {
      ...pageAttrs(
        'dashboard',
        '지표',
        '/대시보드',
        '가입과 해지, 달마다. 이 페이지는 방문자가 아니라 이 사이트를 운영하는 사람이 읽습니다.'
      ),
      /* A page of the tool, not of the site — see the template. */
      template: 'dashboard-page',
      /*
       * **Not for a crawler.** The first page here to say so, and it turned up a real fault the
       * moment it did: `sitemapFor` listed every page, so a site would tell a crawler *do not read
       * this* in the head and *here it is* in the sitemap. See `sitemapFor`.
       */
      noIndex: true
    },
    content: [
      stack('column', { name: '지표 머리', gap: GAP.hair }, [
        heading(1, '이번 달'),
        quiet('가입과 해지, 달마다. 숫자는 매 시간 다시 가져옵니다.')
      ]),

      /*
       * **The three numbers first**, which is what a dashboard is read for: somebody opens one to
       * find out whether anything needs attention, and a chart answers that second.
       *
       * Written by hand rather than drawn from the data, and that is the honest state of it: this
       * product can group rows into a chart and cannot yet put one number on a page. It is the next
       * thing this page will ask for, and saying so here is cheaper than discovering it.
       */
      stack(
        'row',
        {
          name: '큰 수',
          gap: GAP.mid,
          sizing: 'fill',
          overrides: { mobile: { layoutMode: 'column', gap: px(12) } }
        },
        [
          figure('이번 달 가입', '251'),
          figure('이번 달 해지', '26'),
          figure('순 증가', '+225')
        ]
      ),

      /*
       * Then the two pictures, side by side — a dashboard is read **across**: two charts beside each
       * other is a comparison, and two stacked is two facts.
       */
      stack(
        'row',
        {
          name: '그림 둘',
          gap: GAP.mid,
          alignItems: 'start',
          sizing: 'fill',
          overrides: { mobile: { layoutMode: 'column', gap: px(20) } }
        },
        [
          {
            stype: 'chart',
            attributes: {
              name: '월별 가입',
              source: '지표',
              kind: 'line',
              labelBy: '달',
              valueBy: '가입',
              title: '월별 가입',
              plotInk: 'var:강조',
              sizing: 'share',
              share: 2
            },
            content: []
          },
          {
            stype: 'chart',
            attributes: {
              name: '유입 분류',
              source: '지표',
              kind: 'donut',
              labelBy: '분류',
              valueBy: '가입',
              groupBy: '분류',
              agg: 'sum',
              title: '유입 분류별',
              plotInk: 'var:강조',
              sizing: 'share',
              share: 1
            },
            content: []
          }
        ]
      ),

      /*
       * And the rows themselves under them, which is the half a chart cannot be: a picture says the
       * shape and a table says *which month, exactly*. Every dashboard worth reading has both.
       */
      stack('column', { name: '지표 표', gap: GAP.tight, sizing: 'fill' }, [
        heading(2, '달마다'),
        {
          stype: 'collection',
          attributes: {
            name: '지표 목록',
            source: '지표',
            sortBy: '달',
            layoutMode: 'column',
            gap: 0,
            sizing: 'fill'
          },
          content: [placed('metric-row', { 달: 'field:달', 가입: 'field:가입', 해지: 'field:해지' })]
        }
      ])
    ]
  };
}

/** One big number with its name under it — the shape every dashboard opens with. */
const figure = (name: string, value: string): Node =>
  stack(
    'column',
    {
      name,
      gap: GAP.hair,
      padding: px(20),
      sizing: 'fill',
      fill: 'var:면',
      cornerRadius: ROUND.box,
      stroke: 'var:선',
      strokeWidth: px(1)
    },
    /*
     * A **paragraph** around the run, which the schema said out loud the moment the page loaded:
     * `atSize` makes an inline run, and a stack holds blocks. Three faults, one per figure, and the
     * page drew perfectly — which is exactly why the check is a getter the test reads rather than
     * something anybody notices.
     */
    [quiet(name), paragraph([atSize(value, '32px')])]
  );

/** `/블로그` — a featured post, then the rest, newest first. */
function blog(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs(
      'blog',
      '블로그',
      '/블로그',
      '측정한 것과, 측정하고 나서 놀란 것을 적습니다. 대부분은 기능을 더한 이야기가 아니라 이미 있던 것을 읽은 이야기입니다.'
    ),
    content: [
      placed('site-header', {}, HEADER),
      section('블로그 머리', { paddingBottom: px(28) }, [
        stack('column', { name: '블로그 머리 글', gap: GAP.tight, maxWidth: WIDTH.text }, [
          heading(1, '무엇을 고쳤는지'),
          quiet('측정한 것과, 측정하고 나서 놀란 것을 적습니다. 대부분은 기능을 더한 이야기가 아니라 이미 있던 것을 읽은 이야기입니다.')
        ])
      ]),
      section('머리글', { paddingTop: 0, paddingBottom: px(28) }, [
        stack(
          'row',
          {
            name: '머리글 카드',
            /*
             * The **stored** destination, which is the other half of the pair: this one is written
             * on the block, the rows below are answered by the data, and both publish the same
             * `<a>`. Kept written this way deliberately — it is the shape every document already
             * uses, and the export still has to read it.
             */
            goes: pageRef('post-schema'),
            gap: GAP.wide,
            alignItems: 'center',
            padding: px(24),
            fill: 'var:면',
            cornerRadius: ROUND.box,
            stroke: 'var:선',
            strokeWidth: px(1),
            shadowColor: 'rgba(20, 17, 15, 0.07)',
            shadowBlur: px(24),
            shadowDistance: px(6),
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(16) } }
          },
          [
            picture(postCover('#D6341A', '#2A1512', 150), '한 문서 모델로 세 제품', {
              sizing: 'fixed',
              minWidth: px(260),
              maxWidth: px(300),
              cornerRadius: px(12),
              overrides: { mobile: { sizing: 'fill', minWidth: 0 } }
            }),
            stack('column', { name: '머리글 글', gap: GAP.tight, sizing: 'fill' }, [
              quiet('2026-08-02'),
              heading(2, '한 문서 모델로 세 제품'),
              quiet(
                '스키마가 먼저 있었다는 이야기. 워드에서 시작한 노드가 덱과 사이트로 흘러간 경로를 따라가고, 그 과정에서 무엇을 세 번 만들지 않아도 되었는지 셉니다.'
              )
            ])
          ]
        )
      ]),
      /*
       * The shortest way to say what a node is: show one. A post about a document model that
       * describes its shape in prose is a post that has not said it. It is also the fixture wearing
       * what it tests — Prism highlighting and a language row that no document exercised.
       */
      section('한 노드', { paddingTop: 0, paddingBottom: px(40) }, [
        stack('column', { name: '한 노드 글', gap: GAP.mid, maxWidth: WIDTH.text }, [
          heading(2, '노드 하나가 세 곳에서 같은 것을 뜻합니다'),
          quiet('워드에서 만든 문단은 덱에서도 문단이고 사이트에서도 문단입니다. 저장된 모양은 이렇습니다.'),
          code(
            'json',
            '{\n  "stype": "paragraph",\n  "attributes": { "align": "start" },\n  "content": [\n    { "stype": "inline-text", "text": "세 곳에서 같은 문단" }\n  ]\n}'
          )
        ])
      ]),
      section('글 목록', { paddingTop: 0 }, [
        /*
         * A rule between the featured post and the rest, which is the one place on this site where a
         * division is the content rather than the frame's border: the two things are the same kind of
         * thing and the line says *and then the others*.
         */
        rule(),
        stack(
          'row',
          {
            name: '목록과 옆',
            gap: GAP.wide,
            alignItems: 'start',
            sizing: 'fill',
            overrides: { mobile: { layoutMode: 'column', gap: px(28) } }
          },
          [
            /**
             * **비율**, and the first place in this document that says one.
             *
             * `fill` gives every child of a row the same width, and a list beside a sidebar is not
             * two equal things — it is two thirds and one third. Without a ratio the only ways to
             * say that were a fixed pixel width on the aside (wrong at every width but the one it
             * was measured at) or a `maxWidth` on the list, which stops it growing rather than
             * making it share.
             *
             * On the children rather than on the row, because a share is a claim on the space the
             * **parent** is handing out — which is what makes 2:1 hold at every width instead of at
             * one width.
             */
            stack('column', { name: '목록', gap: 0, sizing: 'share', share: 2 }, [
              {
                stype: 'collection',
                attributes: {
                  name: '글 목록',
                  source: '글',
                  sortBy: '날짜',
                  sortDir: 'desc',
                  layoutMode: 'column',
                  gap: 0,
                  sizing: 'fill'
                },
                content: [
                  placed('post-row', {
                    제목: 'field:제목',
                    요약: 'field:요약',
                    날짜: 'field:날짜',
                    /*
                     * The join that makes an index an index: a column of the data answers *where
                     * this row goes*, so the rows go to different places — two of them nowhere,
                     * because two of these posts are not written yet.
                     */
                    '가는 곳': 'field:페이지'
                  })
                ]
              }
            ]),
            stack(
              'column',
              {
                name: '옆',
                gap: GAP.mid,
                sizing: 'share',
                share: 1,
                padding: px(20),
                fill: 'var:면',
                cornerRadius: ROUND.box,
                stroke: 'var:선',
                strokeWidth: px(1)
              },
              [
                stack('column', { name: '옆 소개', gap: GAP.hair }, [
                  heading(3, '무엇을 적나요'),
                  quiet('고친 것과, 고치다가 알게 된 것. 대부분은 이미 있던 것을 읽은 이야기입니다.')
                ]),
                rule(),
                stack('column', { name: '옆 링크', gap: GAP.hair, alignItems: 'start' }, [
                  quiet('제품이 궁금하다면'),
                  /*
                   * A **placed** button rather than a paragraph with a destination, because `goes` is
                   * a container's attribute: it was on `heading` and `paragraph` too until the
                   * harness counted how many of those the renderer read, which was none.
                   */
                  placed('ghost', { 문구: '제품 살펴보기' }, { goes: pageRef('products'), sizing: 'hug' })
                ])
              ]
            )
          ]
        )
      ]),
      placed('site-footer')
    ]
  };
}

/** The definitions every page places. */
function components(): Node {
  return {
    stype: 'components',
    attributes: {},
    content: [
      {
        stype: 'component',
        attributes: { id: 'site-header', name: '머리말' },
        content: [
          /*
           * **One** root, with the bar and the menu inside it — because a definition has one.
           * Written as two roots the menu was in every placement and invisible in the editor: a
           * reader could not have designed the thing they had just been given.
           */
          stack('column', { partId: 'head', name: '머리말', gap: 0 }, [
          /**
           * The bar: the mark at one end, the links and the button at the other.
           *
           * The row every site on the web has, and the one this model could not say until
           * `justifyContent` existed — the workaround was a spacer stack that fills, which is a node
           * a reader has to know to make and has to keep the right way round.
           */
          stack(
            'row',
            {
              partId: 'bar',
              justifyContent: 'between',
              alignItems: 'center',
              gap: GAP.mid,
              paddingTop: px(16),
              paddingBottom: px(16),
              paddingLeft: AIR.side,
              paddingRight: AIR.side,
              /**
               * **Frosted**, and painted with **the token at a weight**, which is why `var:이름/82`
               * exists. It was a literal `rgba(...)` for exactly as long as a reference could not
               * carry one, and that is a colour which stops following the palette.
               *
               * The weight is not decoration: `backdropBlur` is only visible through something you
               * can see through, so an opaque 종이 would frost nothing at all.
               */
              fill: 'var:종이/82',
              backdropBlur: px(14),
              stroke: 'var:선',
              strokeWidth: px(1),
              overrides: { mobile: { paddingLeft: px(20), paddingRight: px(20) } }
            },
            [
              stack('row', { partId: 'mark', gap: GAP.hair, alignItems: 'center', sizing: 'hug' }, [
                picture(wordmark(), 'Barocss', {
                  sizing: 'fixed',
                  minWidth: px(24),
                  maxWidth: px(24),
                  fit: 'contain'
                }),
                heading(4, 'Barocss', { partId: 'wordmark' })
              ]),
              /*
               * The navigation, and until the link mark drew an `<a>` it was **four words that
               * looked like links** — the sample had five pages with addresses and not one anchor in
               * it. Each run names a page rather than an address, so `/제품` becoming `/products`
               * moves all four.
               */
              stack(
                'row',
                {
                  partId: 'nav',
                  name: '내비게이션',
                  gap: GAP.hair,
                  alignItems: 'center',
                  sizing: 'hug',
                  /*
                   * **Gone on a phone**, where the same four links are in the menu below. Not shrunk:
                   * four links and a button do not fit on 390 however small they are made.
                   */
                  overrides: { mobile: { visible: false } }
                },
                [
                  navItem('제품', 'products'),
                  navItem('가격', 'pricing'),
                  navItem('소개', 'about'),
                  navItem('블로그', 'blog'),
                  placed('cta', { 문구: '무료로 시작하기' }, { goes: pageRef('pricing'), sizing: 'hug' })
                ]
              ),
              /**
               * **The hamburger**, which is three boxes rather than a picture.
               *
               * A drawing would be a file to keep in step with the palette; three empty boxes are the
               * model saying what the mark *is*. It opens the menu below — `opens` names the block
               * and `openSwitches` publishes a checkbox before it, so the menu works with scripts off.
               */
              stack(
                'column',
                {
                  partId: 'burger',
                  name: '메뉴 열기',
                  gap: px(5),
                  sizing: 'hug',
                  /*
                   * **44 tall**, which is the target a thumb needs and the number every platform's
                   * guidance lands on. Three 2px rules and two gaps is 16; the rest is padding, and
                   * the padding is the control.
                   */
                  padding: px(14),
                  visible: false,
                  opens: 'site-menu',
                  overrides: { mobile: { visible: true } }
                },
                [line(), line(), line()]
              )
            ]
          ),
          /**
           * **The menu a phone opens** — the same four links again, in a column.
           *
           * Hidden at every width until the switch beside it is checked, which is what `visible:
           * false` plus `opens` means here: `neverShown` keeps it in the published page rather than
           * cutting it as a draft, because a block a visitor can open is not a block nobody sees.
           */
          stack(
            'column',
            {
              partId: 'site-menu',
              name: '모바일 메뉴',
              gap: GAP.tight,
              /*
               * Hidden at rest and **what it becomes when opened**, which is the half that makes it
               * a state rather than a hidden block: `stateRules` writes the browser's own
               * two-element selector from this map, so the menu opens with no script at all.
               */
              visible: false,
              states: { open: { visible: true } },
              paddingTop: px(8),
              paddingBottom: px(20),
              paddingLeft: px(20),
              paddingRight: px(20),
              fill: 'var:종이',
              stroke: 'var:선',
              strokeWidth: px(1)
            },
            [
              /*
               * The links grouped, and the button beside them — the same separation the bar makes
               * with `partId: 'nav'`: four places to *go* and one thing to *do* are two kinds of
               * control, and a reader scanning a menu should not have to read the button to find out
               * it is not a fifth page.
               */
              stack('column', { partId: 'menu-nav', name: '메뉴 링크', gap: GAP.tight }, [
                navItem('제품', 'products'),
                navItem('가격', 'pricing'),
                navItem('소개', 'about'),
                navItem('블로그', 'blog')
              ]),
              placed('cta', { 문구: '무료로 시작하기' }, { goes: pageRef('pricing'), sizing: 'hug' })
            ]
          )
          ])
        ]
      },
      {
        stype: 'component',
        attributes: { id: 'site-footer', name: '꼬리말' },
        content: [
          stack(
            'column',
            {
              gap: GAP.mid,
              paddingTop: px(48),
              paddingBottom: px(40),
              paddingLeft: AIR.side,
              paddingRight: AIR.side,
              fill: 'var:먹',
              /**
               * **And what is written on it**, which this band never said.
               *
               * It flipped the ground to the dark ink and left the words to say their own colour,
               * run by run — so the day those runs stopped carrying a hard-coded grey the whole
               * footer went black on black. Which is the fault `ink` exists to make impossible.
               */
              ink: 'var:종이',
              partId: 'foot',
              overrides: { mobile: { paddingLeft: px(20), paddingRight: px(20) } }
            },
            [
              stack(
                'row',
                {
                  partId: 'foot-row',
                  justifyContent: 'between',
                  alignItems: 'center',
                  gap: GAP.mid,
                  overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(12) } }
                },
                [
                  {
                    stype: 'paragraph',
                    attributes: { partId: 'note' },
                    content: [text('© 2026 Barocss')]
                  },
                  stack('row', { partId: 'foot-links', gap: GAP.mid, sizing: 'hug' }, [
                    paragraph([toPage('제품', 'products')]),
                    paragraph([toPage('가격', 'pricing')]),
                    paragraph([toPage('소개', 'about')])
                  ])
                ]
              ),
              {
                stype: 'paragraph',
                attributes: { partId: 'legal' },
                content: [text('서울특별시 · 사업자등록번호 000-00-00000 · 개인정보처리방침')]
              }
            ]
          )
        ]
      },
      /**
       * A **button**, as a component with one question.
       *
       * There is no button node and there does not need to be: a button is a stack with a colour, a
       * padding and words in it, and the one thing that differs between two of them is what it says.
       * Which is exactly what a component variable is for.
       */
      {
        stype: 'component',
        attributes: { id: 'cta', name: '버튼' },
        content: [
          { stype: 'componentVar', attributes: { name: '문구', kind: 'text', value: '시작하기' } },
          { stype: 'componentBind', attributes: { part: 'cta-label', attr: 'text', var: '문구' } },
          stack(
            'row',
            {
              partId: 'cta-box',
              gap: 0,
              justifyContent: 'center',
              alignItems: 'center',
              paddingTop: px(10),
              paddingBottom: px(10),
              paddingLeft: px(18),
              paddingRight: px(18),
              fill: 'var:강조',
              cornerRadius: ROUND.pill,
              sizing: 'hug',
              /*
               * A button that does not answer the pointer is a picture of a button. And a keyboard
               * ring beside it, because the visitor who most needs to know what is focused is the one
               * who cannot see where their mouse is — `:focus-visible`, so a click never flashes it.
               */
              states: {
                hover: { fill: 'var:강조진함' },
                focus: { stroke: 'var:강조진함', shadowColor: 'rgba(214, 52, 26, 0.35)', shadowBlur: px(8) }
              }
            },
            [
              {
                stype: 'paragraph',
                attributes: { partId: 'cta-label' },
                content: [inColour('시작하기', 'FFFFFF')]
              }
            ]
          )
        ]
      },
      /** The same button with the colour taken out, for the second thing a reader can do. */
      {
        stype: 'component',
        attributes: { id: 'ghost', name: '보조 버튼' },
        content: [
          { stype: 'componentVar', attributes: { name: '문구', kind: 'text', value: '더 보기' } },
          { stype: 'componentBind', attributes: { part: 'ghost-label', attr: 'text', var: '문구' } },
          stack(
            'row',
            {
              partId: 'ghost-box',
              gap: 0,
              justifyContent: 'center',
              alignItems: 'center',
              paddingTop: px(10),
              paddingBottom: px(10),
              paddingLeft: px(18),
              paddingRight: px(18),
              stroke: 'var:선',
              strokeWidth: px(1),
              cornerRadius: ROUND.pill,
              sizing: 'hug',
              // The border is already the width it will be; only its colour changes, so nothing moves.
              states: { hover: { stroke: 'var:먹', fill: 'var:바탕' } }
            },
            [
              {
                stype: 'paragraph',
                attributes: { partId: 'ghost-label' },
                content: [inColour('더 보기', '14110F')]
              }
            ]
          )
        ]
      },
      {
        stype: 'component',
        attributes: { id: 'product-card', name: '상품 카드' },
        content: [
          { stype: 'componentVar', attributes: { name: '이름', kind: 'text', value: '상품' } },
          { stype: 'componentVar', attributes: { name: '설명', kind: 'text', value: '설명' } },
          /**
           * **A number, and how it should read.**
           *
           * The dataset keeps `7900`, which sorts and compares; the card shows *월 7,900원*, which is
           * what a person reads. A pattern rather than a named currency format, because the literal
           * text a reader wants around the number is the half a fixed list cannot carry — see
           * `value-format.ts`.
           */
          { stype: 'componentVar', attributes: { name: '가격', kind: 'number', format: '월 #,##0원', value: '0' } },
          { stype: 'componentBind', attributes: { part: 'p-name', attr: 'text', var: '이름' } },
          { stype: 'componentBind', attributes: { part: 'p-body', attr: 'text', var: '설명' } },
          { stype: 'componentBind', attributes: { part: 'p-price', attr: 'text', var: '가격' } },
          stack(
            'column',
            {
              gap: GAP.tight,
              padding: px(28),
              fill: 'var:면',
              partId: 'p-card',
              sizing: 'fill',
              cornerRadius: ROUND.box,
              stroke: 'var:선',
              strokeWidth: px(1),
              shadowColor: 'rgba(20, 17, 15, 0.07)',
              shadowBlur: px(24),
              shadowDistance: px(6)
            },
            [
              heading(3, '상품', { partId: 'p-name' }),
              paragraph('설명', { partId: 'p-body' }),
              paragraph([inColour('0원', 'D6341A')], { partId: 'p-price' })
            ]
          )
        ]
      },
      /**
       * **The template a post is drawn through** — and the reason this definition is in the sample.
       *
       * A fixture must wear what it tests. Templates were built, checked and unusable to look at:
       * every definition here is a *card*, so choosing one as a page's template drew the card and
       * dropped the page's twelve blocks on the floor, which is the exact fault the new check
       * reports. A sample with no template is a sample that cannot show the feature working or
       * failing.
       *
       * The slot is a frame two levels down — the site's header above it, the footer below — which
       * is the ordinary shape and the one that made a top-level-only `hasSlot` wrong.
       */
      {
        stype: 'component',
        attributes: { id: 'post-page', name: '글 페이지' },
        content: [
          stack('column', { gap: 0, sizing: 'fill', partId: 't-root' }, [
            placed('site-header'),
            stack(
              'column',
              {
                gap: GAP.wide,
                paddingTop: px(72),
                paddingBottom: px(96),
                paddingLeft: px(72),
                paddingRight: px(72),
                sizing: 'fill',
                alignItems: 'center',
                partId: 't-band',
                overrides: { mobile: { paddingLeft: px(20), paddingRight: px(20) } }
              },
              [
                /*
                 * **The slot**, and the only thing in this definition that is not chrome: a column a
                 * post's own blocks are drawn into, at a width a person can read a paragraph at.
                 */
                stack(
                  'column',
                  {
                    gap: GAP.mid,
                    sizing: 'fill',
                    maxWidth: px(720),
                    partId: 't-slot',
                    slot: '본문'
                  },
                  []
                )
              ]
            ),
            placed('site-footer')
          ])
        ]
      },
      /**
       * **대시보드 페이지** — a template whose chrome is *less* than a public page's, on purpose.
       *
       * The post template wraps the site's header and footer around a readable column, because a post
       * is a page of the site. A dashboard is not: it is a page of the **tool**, read by the people
       * who run the site, and every piece of marketing chrome on it is something between a reader and
       * a number. So it has a title bar of its own, a wide band rather than a 720px measure, and no
       * footer at all.
       *
       * Which is the argument for templates being a **page's** attribute rather than a blog feature:
       * the second one is not a second blog, it is a different kind of page entirely, and the only
       * thing the two have in common is that a reader should not have to build the frame twice.
       */
      {
        stype: 'component',
        attributes: { id: 'dashboard-page', name: '대시보드' },
        content: [
          stack('column', { gap: 0, sizing: 'fill', fill: 'var:종이', partId: 'd-root' }, [
            /*
             * A bar, not the site's header: a dashboard is not somewhere a visitor navigates from,
             * and offering them 제품 · 가격 · 소개 above a chart is the tool pretending to be the site.
             */
            stack(
              'row',
              {
                gap: GAP.tight,
                alignItems: 'center',
                paddingTop: px(20),
                paddingBottom: px(20),
                paddingLeft: px(40),
                paddingRight: px(40),
                sizing: 'fill',
                stroke: 'var:선',
                strokeWidth: px(1),
                partId: 'd-bar'
              },
              [paragraph('Barocss · 지표', { partId: 'd-name' })]
            ),
            stack(
              'column',
              {
                gap: GAP.wide,
                paddingTop: px(40),
                paddingBottom: px(64),
                paddingLeft: px(40),
                paddingRight: px(40),
                sizing: 'fill',
                partId: 'd-band',
                overrides: { mobile: { paddingLeft: px(20), paddingRight: px(20) } }
              },
              [
                /*
                 * **The slot**, and wide — a dashboard is read across rather than down, which is the
                 * one thing about its shape that is not a preference: two charts side by side is a
                 * comparison, and two charts stacked is two facts.
                 */
                stack('column', { gap: GAP.wide, sizing: 'fill', partId: 'd-slot', slot: '본문' }, [])
              ]
            )
          ])
        ]
      },
      /**
       * **지표 줄** — one month, as a row of a table.
       *
       * The second card in this document whose parts are all bound, and the first whose values are
       * **numbers**: a table of figures wants its columns to line up, which is what `tabular-nums`
       * is for and what a left-aligned number defeats. So the two number columns are fixed-width and
       * right-aligned, and the month is what fills.
       */
      {
        stype: 'component',
        attributes: { id: 'metric-row', name: '지표 줄' },
        content: [
          { stype: 'componentVar', attributes: { name: '달', kind: 'text', value: '1월' } },
          { stype: 'componentVar', attributes: { name: '가입', kind: 'number', value: '0' } },
          { stype: 'componentVar', attributes: { name: '해지', kind: 'number', value: '0' } },
          { stype: 'componentBind', attributes: { part: 'm-month', attr: 'text', var: '달' } },
          { stype: 'componentBind', attributes: { part: 'm-in', attr: 'text', var: '가입' } },
          { stype: 'componentBind', attributes: { part: 'm-out', attr: 'text', var: '해지' } },
          stack(
            'row',
            {
              gap: GAP.mid,
              paddingTop: px(10),
              paddingBottom: px(10),
              alignItems: 'center',
              partId: 'm-row',
              sizing: 'fill'
            },
            [
              stack('column', { gap: 0, sizing: 'fill', partId: 'm-when' }, [paragraph('1월', { partId: 'm-month' })]),
              stack('column', { gap: 0, sizing: 'fixed', minWidth: px(80), partId: 'm-a' }, [
                paragraph('0', { partId: 'm-in', align: 'end' })
              ]),
              stack('column', { gap: 0, sizing: 'fixed', minWidth: px(80), partId: 'm-b' }, [
                paragraph('0', { partId: 'm-out', align: 'end' })
              ])
            ]
          )
        ]
      },
      {
        stype: 'component',
        attributes: { id: 'post-row', name: '글 줄' },
        content: [
          { stype: 'componentVar', attributes: { name: '제목', kind: 'text', value: '제목' } },
          { stype: 'componentVar', attributes: { name: '요약', kind: 'text', value: '요약' } },
          /**
           * **A date, said as a date** — and how it should read.
           *
           * The dataset keeps `2026-08-02`, which sorts and compares; the page shows *2026년 8월
           * 2일*, which is what a person reads. A variable that declared itself text would have made
           * the document choose one, and whichever it chose the other job would be done by hand.
           */
          /*
           * And a **real date** as the default, where it was the empty string: a card's default is
           * what a designer sees when they open the definition, and a date slot showing nothing
           * reads as a card that is broken rather than one waiting for data.
           */
          { stype: 'componentVar', attributes: { name: '날짜', kind: 'date', format: 'yyyy년 M월 d일', value: '2026-01-01' } },
          /**
           * **어디로 가는지**, as a question the card asks — the fourth variable, and the one that is
           * not words.
           *
           * A card's variables had all been *what it says*; this one is *what it does*. It is the
           * same reference every link in this document is written as (`page:블로그`), so the answer
           * is a page's durable id and renaming the page moves every row's link with it.
           *
           * Which is what a list of posts needs and could not have: `goes` was read at export time
           * from the **stored** node, and a row of a list has no stored node of its own — it draws
           * as `${collection}~${index}~${part}`, so the lookup landed on the definition's part and
           * all four rows went to the same place. See `data-goes` in `renderers.ts`.
           *
           * Empty by default: a card placed by hand, with nothing said, is a box and not a link.
           */
          { stype: 'componentVar', attributes: { name: '가는 곳', kind: 'text', value: '' } },
          { stype: 'componentBind', attributes: { part: 'b-title', attr: 'text', var: '제목' } },
          { stype: 'componentBind', attributes: { part: 'b-row', attr: 'goes', var: '가는 곳' } },
          { stype: 'componentBind', attributes: { part: 'b-body', attr: 'text', var: '요약' } },
          { stype: 'componentBind', attributes: { part: 'b-date', attr: 'text', var: '날짜' } },
          /*
           * A row of a list rather than a card: the date holds a fixed column so the titles line up,
           * which is the whole reason a list of posts is not a stack of cards.
           *
           * **No rule between the rows**, and that is a gap rather than a decision: a page's frame
           * has one `stroke` for all four sides, so a hairline between rows would be ten boxes down
           * the page. Word's blocks have `borderTop`…`borderLeft`; a page has not, and it is on the
           * record in `BACKLOG.md`.
           */
          stack(
            'row',
            {
              gap: GAP.wide,
              paddingTop: px(20),
              paddingBottom: px(20),
              alignItems: 'start',
              partId: 'b-row',
              sizing: 'fill',
              overrides: { mobile: { layoutMode: 'column', gap: px(6) } }
            },
            [
              stack('column', { gap: 0, sizing: 'fixed', minWidth: px(120), partId: 'b-when' }, [
                paragraph('', { partId: 'b-date' })
              ]),
              stack('column', { gap: GAP.hair, sizing: 'fill', partId: 'b-what' }, [
                heading(3, '제목', { partId: 'b-title' }),
                paragraph('요약', { partId: 'b-body' })
              ])
            ]
          )
        ]
      }
    ]
  };
}
