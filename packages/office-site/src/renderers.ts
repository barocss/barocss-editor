/**
 * How a site draws a page.
 *
 * Almost none of it is here, and that is the measurement this product exists to take. A page's
 * text is the text stack's: a heading is a `heading`, a paragraph is a `paragraph`, a list is a
 * `list`, and every renderer, style resolver and mark written for a word processor draws a section
 * of a landing page without knowing it. What a *site* draws differently is one node — the page
 * itself — plus the one thing a stack's child says that a document's never had to.
 *
 * ## The page: a column, not a sheet
 *
 * Word takes the same `surface` and draws the sheets its text reached; a site draws one column that
 * grows. That is the whole difference between the two products at the drawing layer, and it is why
 * this product registers the **text** renderers rather than Word's: `registerWordRenderers` would
 * bring the paginator's `surface`, the header and footer, the back matter and the contents page,
 * none of which a page has.
 *
 * ## Sizing: the one thing CSS needs told
 *
 * A stack's child either fills the space along the axis, hugs its content, or states a width.
 * Silence already means two different things — a `div` hugs, a flex child fills — so the intent is
 * written down and turned into the one CSS property that says it.
 */
import { data, define, element, external, override, slot } from '@barocss/dsl';
import type { RenderEnv } from '@barocss/dsl';
import { getWordDocument, registerTextRenderers } from '@barocss/office-text';
import { isVarRef, resolveVarValue } from '@barocss/office-canvas';
import { frameCss } from '@barocss/office-word';
import { hrefFor } from './page-link';
import { opacityCss, paintCss } from './paint';
import { presenceCss } from './presence';
import { sizingCss } from './sizing';
import { positionCss } from './position';
import { assetNameOf, assetNamed, assetSrc, isAssetRef, srcsetFor } from './assets';
import { embedSrc } from './embed';
import { datasetNamed } from './data';
import { CHART_BOX, baselineOf, chartRows, chartShape } from './chart';
import { aspectCss } from './aspect';
import { addressOf } from './export-html';
import {
  answerNameOf,
  inputTypeOf,
  choicesOf,
  isChoiceField,
  isParagraphField,
  isSubmitField,
  isTickField,
  hiddenFields,
  needsUpload,
  serviceNamed,
  type Service
} from './form';
import { breakpointOf, published, scopesOf } from './breakpoints';
import { codeComponent } from './code-render';
import { attrsThrough } from './responsive';

type NodeData = Record<string, any>;

const attrsOf = (data: NodeData): Record<string, any> => (data?.attributes ?? {}) as never;

/**
 * The attributes a node is drawn with **in this view**.
 *
 * The one line that makes three frames of one page differ. A template that takes a function gets the
 * render context, and the context carries the env — which is the only per-view channel there is, and
 * therefore the only place a question with three simultaneous answers can be asked
 * (`breakpoints.ts`).
 *
 * A node with nothing to say at this width comes back unchanged, so the overwhelming majority of
 * blocks cost one map lookup and no copy.
 */
const drawnAttrs = (node: NodeData, ctx: any): Record<string, any> => {
  /*
   * The **scopes**, from the env, rather than the width and a constant list: which widths a drawing
   * resolves through is a fact about the *document's* widths, and a renderer is handed a node and an
   * env. The host works the order out once per view — see `createSiteEnv`.
   */
  const at = attrsThrough(attrsOf(node), scopesOf(ctx?.env as RenderEnv | undefined));
  return named(at, node, ctx) as never;
};

/**
 * A **named value** where a value goes: `fill: 'var:강조'`.
 *
 * The one thing a site builder needs from the deck's variables that a document never did — a design
 * token. A page's brand colour is written once and referred to everywhere, and changing it changes
 * the page rather than forty nodes.
 *
 * Resolved **here**, at draw time, and never written into the document: taking the token off brings
 * back whatever the node said before, and a file records the *reference* rather than what it happened
 * to mean on the day it was saved. The scope is the deck's own — a page's declaration wins over the
 * document's — which is why the node's sid is passed in rather than only the value.
 *
 * A reference nothing declares stays a reference, and draws as the literal it is. That is on purpose:
 * a colour of `var:강조` in the DOM is a reader's misspelling made visible, where a silent fallback to
 * black would be a page that quietly lost its brand.
 */
const named = (attrs: Record<string, any>, node: NodeData, ctx: any): Record<string, any> => {
  let out: Record<string, any> | undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (!isVarRef(value)) continue;
    const doc = getWordDocument(ctx?.env as RenderEnv | undefined);
    if (!doc) break;
    const resolved = resolveVarValue(doc as never, value, String(node?.sid ?? ''));
    if (resolved === undefined) continue;
    out = out ?? { ...attrs };
    out[key] = resolved;
  }
  return out ?? attrs;
};

/**
 * A stack, as CSS — `frameCss`, plus the one default a **page** disagrees with a canvas about.
 *
 * `frameCss` aligns a stack's children to the start of the cross axis, and on a canvas that is
 * right: a box on a slide is as wide as what is in it, and a frame that stretched its children
 * would be deciding something the reader placed by hand.
 *
 * A page means the opposite by silence. A section in a column is **the width of the page** — that is
 * what a section *is* — and shrink-to-fit gives the staircase this was measured as: three cards
 * stacked on a phone, each as wide as its own longest line, so the one with the shortest sentence
 * came out narrowest. Found by looking at the drawing; no assertion in the suite could see it,
 * because every test so far asked about `flex-direction` and none about width.
 *
 * A row gets it too, and for the matching reason: a row of cards whose children start at the top is
 * a row of cards of three different heights, and the equal-height row is what every landing page
 * means by putting them side by side.
 *
 * ## And it does not clip
 *
 * The second thing a page means the opposite of by silence, and the more expensive one.
 * `frameCss` writes `overflow: hidden` unless a node says `clipsContent: false`, which on a canvas
 * is what a frame *is*: a box of a stated size, and a window onto what it holds. Measured on the
 * sample site: **nine** stacks on the desktop board clipping, and no control anywhere in the
 * product to stop one.
 *
 * A page's box has no stated size — it is as tall as what is in it — so clipping never shows until
 * something deliberately leaves the box, and then it shows by *deleting the design*: an image that
 * bleeds past its section, a badge hanging off a card's corner, a portrait lifted into the band
 * above it. Overlap is how a page stops looking like a stack of rectangles, and this made it
 * unreachable — silently, because a clipped element looks exactly like an element that was never
 * drawn.
 *
 * So silence means visible here, and `clipsContent: true` still means what it says. A reader who
 * wants a window asks for one, which is also the only time a page has any use for it.
 *
 * ## Only when the node says nothing
 *
 * A stack that states `alignItems` gets what it states, at every width, and these defaults never
 * override a reader — the header's row still centres its wordmark against its links.
 */
/**
 * The connection a form names, resolved through the environment the renderer was given.
 *
 * The document, reached the way every other renderer here reaches it: `WORD_ENV_KEY` carries the
 * root and a `getNode`, which is what a page's blocks already use to resolve a `var:이름` and a
 * `page:id`. A fourth reference of that shape needs no fourth mechanism.
 */
/**
 * **Whether the stack this node sits in scrolls sideways** — asked of the document, because a
 * renderer draws a node without being told whose child it is.
 *
 * Which is the one thing a scrolling row needs its children to know. A card that says Fill inside one
 * shrinks to nothing and the scroll has nothing to scroll — and the fix cannot be a stylesheet rule:
 * `sizing` is written **inline**, so no selector can beat it, and the first attempt used an important
 * flag that the browser suite refused. It was right to: a published page carries none, because a page
 * a reader cannot restyle with their own CSS is not theirs.
 *
 * So the node asks. `WORD_ENV_KEY` already carries the root and a `getNode` — the same access a
 * `var:이름` and a `page:id` are resolved through — and one `parentId` lookup is the whole of it.
 */
const inScrollingRow = (ctx: any, node: NodeData): boolean => {
  const doc = getWordDocument(ctx?.env as RenderEnv | undefined) as
    | { getNode: (sid: string) => { attributes?: Record<string, unknown> } | undefined }
    | undefined;
  const parentId = (node as { parentId?: unknown }).parentId;
  if (!doc || typeof parentId !== 'string') return false;
  const said = doc.getNode(parentId)?.attributes?.scrolls;
  return said === 'x' || said === 'x-snap';
};

const serviceFor = (ctx: any, sends: unknown): Service | undefined => {
  const doc = getWordDocument(ctx?.env as RenderEnv | undefined);
  return doc ? serviceNamed(doc as never, sends) : undefined;
};

/**
 * Where a visitor lands after sending — **absolute**, or nothing.
 *
 * A service redirecting a browser needs a whole address; it has no page to resolve a relative one
 * against. So a site that has not said where it lives publishes no return at all rather than one the
 * service will send somebody to nowhere with — the same rule `og:url` and `og:image` already follow,
 * and the same answer.
 */
const thanksAt = (ctx: any, thanks: unknown): string | undefined => {
  const doc = getWordDocument(ctx?.env as RenderEnv | undefined);
  const path = doc ? hrefFor(doc as never, thanks) : undefined;
  if (!path) return undefined;
  const root = doc ? (doc as never as { rootId: string }).rootId : undefined;
  return addressOf(doc as never, root, path);
};

/**
 * What a **control** is painted with — the five a field declares, and no more.
 *
 * Named rather than `paintCss`, which answers eleven things a text box has no use for: a gradient
 * behind an input and a shadow angle on a label are attributes that could have been declared and
 * never drawn, and the harness reported every one of them the minute `field` existed. A field is a
 * box with a line around it and words in it.
 *
 * On a wrapper rather than on the `<input>` itself, so the border a reader asks for is the border
 * around the control **and its label's gap** — and so that a browser's own focus ring, which is
 * drawn on the input, still lands inside it rather than being clipped by a radius.
 */
/**
 * **Whether this form asks for a file**, read from the fields it holds.
 *
 * The one question a form has to ask of its own children before it can draw itself — see
 * `needsUpload`, and `enctype` on the form for what it costs to get wrong.
 */
const uploadsIn = (ctx: any, node: NodeData): boolean => {
  const doc = getWordDocument(ctx?.env as RenderEnv | undefined) as never as
    | { getNode: (sid: string) => Record<string, any> | undefined }
    | undefined;
  if (!doc) return false;
  return needsUpload(
    ((node as Record<string, any>)?.content ?? [])
      .map((child: unknown) => (typeof child === 'string' ? doc.getNode(child) : (child as Record<string, any>)))
      .filter((child: Record<string, any> | undefined) => child?.stype === 'field')
      .map((child: Record<string, any>) => child.attributes as Record<string, unknown> | undefined)
  );
};

const controlPaint = (attrs: Record<string, any>): Record<string, string> => {
  const css: Record<string, string> = {};
  if (typeof attrs.fill === 'string' && attrs.fill) css.background = attrs.fill;
  if (typeof attrs.ink === 'string' && attrs.ink) css.color = attrs.ink;
  if (typeof attrs.stroke === 'string' && attrs.stroke) {
    const width = typeof attrs.strokeWidth === 'number' ? attrs.strokeWidth : 15;
    css.border = `${Math.round((width * 96) / 1440)}px solid ${attrs.stroke}`;
  }
  if (typeof attrs.cornerRadius === 'number') {
    css.borderRadius = `${Math.round((attrs.cornerRadius * 96) / 1440)}px`;
  }
  return css;
};

export const stackCss = (attrs: Record<string, any>): Record<string, any> => ({
  ...frameCss(attrs as never),
  /*
   * And what it is **painted** with — a gradient, a picture behind, a shadow, corners that differ.
   * After `frameCss`, which writes the flat `background` and the single radius: everything here is
   * the longer answer to a question that one already gave a short answer to, and the longer answer
   * has to win. `paint.ts` says why the vocabulary is the deck's and the arithmetic is not.
   */
  ...paintCss(attrs, asColour),
  ...(attrs.alignItems === undefined ? { alignItems: 'stretch' } : {}),
  ...(attrs.clipsContent === undefined ? { overflow: 'visible' } : {}),
  /**
   * **Sideways**, when the block says so — and `overflow-x` alone, so a card that pokes out the top
   * still does. A row of cards that scrolls is the shape a phone needs for anything wider than it is,
   * and `hidden` on both axes to get it is a row whose shadows are cut off.
   *
   * The **children** have to say `scroll-snap-align` — that is the child's half of the pair and CSS
   * gives a parent no way to say it for them. It is written as a rule in `PAGE_CSS` keyed off this
   * attribute rather than by the renderer, because the renderer draws a node without knowing whose
   * child it is, and a selector knows exactly that. Without the child's half the container snaps to
   * nothing and the whole thing is an ordinary scroll.
   */
  ...(attrs.scrolls === 'x' || attrs.scrolls === 'x-snap'
    ? {
        overflowX: 'auto',
        overflowY: 'visible',
        ...(attrs.scrolls === 'x-snap' ? { scrollSnapType: 'x mandatory' } : {}),
        // A row that scrolls does not also wrap: wrapping is what a reader does *instead* of this.
        flexWrap: 'nowrap',
        /**
         * **The parent saying it for the children**, which is the one way CSS allows.
         *
         * A child that says Fill carries its flex **inline**, written by the renderer — so no
         * stylesheet rule can stop it shrinking, and the first attempt used an important flag that
         * the browser suite refused: a published page carries none, because a page a reader cannot
         * restyle with their own CSS is not theirs.
         *
         * `align-items` is the parent's own property and it is inherited by the children's *layout*
         * rather than by their styles, so a row that starts its items rather than stretching them
         * gives each one its content width — which is exactly *do not shrink*, said by the only
         * participant that has the standing to say it.
         *
         * Measured before this: the container scrolled and the children shrank, so the scroll had
         * nothing to scroll.
         */
        alignItems: 'flex-start',
        // The strip keeps its own scrollbar rather than the page gaining one.
        scrollbarWidth: 'thin'
      }
    : {}),
  /*
   * And **positioned**, so that a block placed absolutely inside this stack is placed against *this
   * stack* rather than against the page. `position.ts` argues why it is every stack rather than a
   * switch: it changes no layout, makes no stacking context on its own, and is the only answer a
   * reader ever means by "in the corner of this card".
   *
   * Before whatever the block says about its own placement, which is applied after and wins.
   */
  position: 'relative',
  ...positionCss(attrs)
});

/**
 * A colour, if there is one.
 *
 * `named` has already resolved every `var:이름` on the node by the time this is called, so this is
 * the last narrowing rather than the resolution: a value that is not a non-empty string is not a
 * colour, and writing it into CSS would be writing `undefined` into a stylesheet.
 */
/**
 * A number on an axis, as a person would have written it.
 *
 * Thousands as `12k`, because a chart 320 units wide has about five characters of room at the left
 * and `12900` in them is a wall of digits. Not `toLocaleString`, which is a different answer per
 * machine — an axis has to read the same in the editor and in the published page, and the published
 * page is read where the *visitor* is.
 */
const axisNumber = (value: number): string => {
  const size = Math.abs(value);
  if (size >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (size >= 1000) return `${Number((value / 1000).toFixed(1))}k`;
  return String(Number(value.toFixed(2)));
};

const asColour = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

/**
 * Register every renderer a site draws with.
 *
 * Idempotent, like the other two products'.
 */
export function registerSiteRenderers(): void {
  // Everything a page is made of that is not the page. See the header: this is the product.
  registerTextRenderers();

  /**
   * A link, with a **page of this site** as a legitimate destination.
   *
   * `office-text` draws a link as a real `<a>` — half of what a link *is* lives in the element — and
   * this overrides it for one reason: a page's address is not what a link stores. It stores the
   * page's durable id as `page:<id>` and the address is resolved here, at the moment of drawing, so
   * that renaming `/제품` to `/products` moves every link into it rather than breaking them silently
   * (`page-link.ts`).
   *
   * `override` rather than `define`, and said out loud so a check can tell a decision from an
   * accident: if the shared answer ever grows page references of its own, this stops being an
   * override and the product finds out.
   *
   * The export draws through these same renderers, so a published page carries the resolved address
   * and the editor and the visitor cannot disagree.
   */
  override('mark:link', (props: NodeData, _model: NodeData, ctx: any) => {
    const attrs = (props?.attributes ?? {}) as Record<string, unknown>;
    const href = hrefFor(getWordDocument(ctx?.env as RenderEnv | undefined) as never, attrs.href);

    return element(
      'a',
      {
        className: 'mark-link',
        /*
         * **Absent**, not empty, for a page that is gone. An `<a>` with no `href` is the one shape a
         * browser draws as *not a link* — no underline, no pointer, no announcement — which is the
         * honest drawing of a link with nowhere to go, and one a reader sees rather than discovers
         * by clicking. `linkFaults` is how the product can name them.
         */
        href,
        title: typeof attrs.title === 'string' && attrs.title ? attrs.title : undefined,
        // A text drag inside a link is a selection, not a drag of the link — see `office-text`.
        draggable: 'false'
      },
      [data('text')]
    );
  });

  /**
   * A **list**, as a list.
   *
   * ## What it was drawing
   *
   * `<div class="w-list">` holding `<div class="w-list-item" data-marker="">`. No bullet, no number,
   * no `<ul>` — a stack of paragraphs with nothing to say it is a list. The marker is Word's: it
   * comes from a *numbering definition* through the env, which is the right answer for a document
   * with multi-level numbering and eight list styles, and it resolves to the empty string for a
   * product that has none. So 목록 in the toolbar put an indistinguishable pile of sentences on the
   * page, and `PAGE_CSS` had rules for `ul`, `ol` and `li` that could never match anything.
   *
   * ## Why the browser's own marker is the right one here
   *
   * A site has no numbering definitions and wants none: a bulleted list on a page is `<ul>` and a
   * numbered one is `<ol>`, the browser draws the markers, and the published page carries the two
   * elements that *mean* a list to a screen reader and to a search engine. Word needs its own
   * because Word's lists restart, skip levels and carry a format per level; a page's do not.
   *
   * `type` rather than `kind`, which is what the schema declares — `insertBulletList` had been
   * writing `kind: 'bullet'`, an attribute nothing reads, since it was written.
   */
  override('list', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    const ordered = attrs.type === 'ordered';
    return element(
      ordered ? 'ol' : 'ul',
      {
        className: 'st-list',
        'data-type': ordered ? 'ordered' : 'bullet',
        style: { ...sizingCss(attrs as never, inScrollingRow(ctx, node)), ...presenceCss(attrs) }
      },
      [slot('content')]
    );
  });

  override('listItem', element('li', { className: 'st-list-item' }, [slot('content')]));

  /**
   * A **code block**, which draws itself.
   *
   * `override` with an `external({ managesDOM: true })` component, and both halves are said out loud
   * so a check can tell a decision from an accident.
   *
   * The **override**: `office-text` draws a plain `pre` around the run, which is right for a document
   * — Word has no language to tokenize by and no panel to say one in. A *page* publishes code for
   * people to read, so it is worth the grammar, and the dependency stays with the product that needs
   * it rather than in a kit two others would carry it for nothing.
   *
   * The **component**: a code block's content is a tokenized tree rather than a list of children, and
   * it is edited by a real editor — which is exactly the kind of DOM a renderer cannot express. So it
   * owns its element. `code-render.ts` carries the rest.
   */
  override('codeBlock', external(codeComponent) as never);

  /**
   * A page: one column, as wide as the window it is drawn in.
   *
   * `override`, because the text renderers do not draw a `surface` and Word's page renderer does —
   * a site that registered Word's would get sheets. Said out loud so a check can tell a decision
   * from an accident: if the shared answer moves, this stops being an override and the product
   * finds out.
   */
  override('surface', (_props: NodeData, _node: NodeData, ctx: any) =>
    element(
        'section',
        {
          className: 'st-page',
          /** Which shape of surface this is, the way both other products draw it. */
          'data-kind': (d: NodeData) => (typeof attrsOf(d).kind === 'string' ? attrsOf(d).kind : 'flow'),
          /** The address, so a link and a page list can both read it from the drawing. */
          'data-path': (d: NodeData) =>
            typeof attrsOf(d).path === 'string' ? attrsOf(d).path : undefined,
          /**
           * The page's durable id and the name a reader calls it.
           *
           * Drawn because they are *read* — a link names a page by `id`, and the page list shows the
           * `name` — and `every-attribute-is-read` is right that a fact only the model knows is a
           * fact the drawing cannot be checked against.
           */
          'data-id': (d: NodeData) => (typeof attrsOf(d).id === 'string' ? attrsOf(d).id : undefined),
          'data-name': (d: NodeData) =>
            typeof attrsOf(d).name === 'string' ? attrsOf(d).name : undefined,
          style: (d: NodeData) => ({
            display: 'flex',
            flexDirection: 'column',
            /*
             * The page is as wide as it is given and as tall as it turns out. A site has no sheet
             * to fit and no page to break: what makes it a *site* is that the height is a
             * consequence.
             */
            width: '100%',
            minHeight: '100%',
            /*
             * And the page's own paint. A site whose sections can hold a gradient and whose *page*
             * cannot is a site with a white band under every page shorter than the window.
             *
             * **At the width this view is drawing**, which it was not: this read the node's raw
             * attributes, so a page could hold an override and no board would ever show it — a page
             * that is white on a desktop and dark on a phone was unsayable. Only the paint: a page's
             * address and its id are what it *is* rather than how it looks, and a page with two
             * addresses is two pages.
             */
            ...paintCss(attrsThrough(attrsOf(d), scopesOf(ctx?.env as RenderEnv | undefined)), asColour)
          }),
        },
        [slot('content')]
      )
  );

  /**
   * A **stack**: the section, the row of cards, the grid.
   *
   * `frameCss` is Word's, and the reuse is exact — flex row and column, grid with N columns, gap,
   * padding, alignment, background, border, in twips. A site builder's layout engine turned out to
   * be a function written for a document's layout boxes, which is the third product agreeing with
   * the first about something neither knew the other needed.
   *
   * What is added is the child's own intent (`sizing`), which no other product has had to say.
   */
  override('frame', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    return element(
      /*
       * **The element a reader said this is**, and `div` when they said nothing.
       *
       * Measured on the sample's published home page: `lang`, a `<title>`, a viewport, no script and
       * not one inline style — and every structural element a `<div>`. Nothing said which of forty
       * of them was the header, the navigation, the body or the footer, and the document knew.
       *
       * `div` rather than `section` for the silent case, deliberately: a `<section>` with no
       * accessible name is a landmark a screen reader announces as "section" and cannot be told
       * apart from the next one, which is worse than a plain box. A stack that means something says
       * so; one that is a stack stays a stack.
       *
       * The **export follows for free**, which is the whole argument for drawing the published page
       * through these renderers: there is no second place where the tag could be older.
       */
      (typeof attrs.landmark === 'string' && attrs.landmark
        ? attrs.landmark
        : 'div') as 'header' | 'nav' | 'main' | 'aside' | 'footer' | 'div',
      {
        className: 'st-stack',
        'data-layout': typeof attrs.layoutMode === 'string' ? attrs.layoutMode : 'none',
        /*
         * Said on the element as well as in its style, because the **children** need it: a snapping
         * child says `scroll-snap-align` and CSS gives a parent no way to say it for them. A rule in
         * `PAGE_CSS` keys off this.
         */
        'data-scrolls': attrs.scrolls ? String(attrs.scrolls) : undefined,
        // What a reader called this stack, which the layer list shows and the drawing should say.
        'data-name': typeof attrs.name === 'string' ? attrs.name : undefined,
        /**
         * **Where pressing this goes**, drawn — and it used to be read from the stored node at
         * export time only.
         *
         * Which worked for a block a reader wrote a destination on, and could not work for a **row
         * of a list**: a row draws as `${collection}~${index}~${part}`, so the lookup landed on the
         * *definition's* part and every row went to the same place. A blog whose list of posts could
         * not link to the posts is the shape that found it.
         *
         * From the **resolved** attributes, so `var:` and `field:` have already become what they
         * mean — which is what makes a destination a thing a dataset can say.
         */
        'data-goes': typeof attrs.goes === 'string' && attrs.goes.trim() ? attrs.goes.trim() : undefined,
        /**
         * **Where this value came from**, when it was not typed here — a column of a dataset, or the
         * document's own named value.
         *
         * Asked for as *어디가 데이터이고 어디가 아닌지 구분이 잘 안 된다*, and the reason it could not be
         * said is that resolution is total: `field:제목` has become the title by the time anything draws, so
         * the drawing had no way to know it had not been typed. `canvas-instance` keeps the reference beside
         * the resolved value now, and this is where it reaches the page.
         *
         * **Editor only**, and the export is what says so — `clean` strips it, in one place, because
         * the renderers that draw it are in two packages now.
         */
        'data-from': typeof attrs.boundFrom === 'string' ? attrs.boundFrom : undefined,
        'data-sizing': typeof attrs.sizing === 'string' ? attrs.sizing : undefined,
        /*
         * Whether this stack is drawing something a narrower width said, so a reader — and a test —
         * can tell an override from the page's own answer by looking at the drawing.
         */
        'data-at': ctx?.env ? breakpointOf(ctx.env as RenderEnv) : undefined,
        style: {
          ...stackCss(attrs),
          ...sizingCss(attrs, inScrollingRow(ctx, node)),
          ...presenceCss(attrs)
        }
      },
      [slot('content')]
    );
  });

  /**
   * A **placement**: the header that is the same header on every page.
   *
   * Measured, on the first draw of the sample site: the resolver was installed, the definition was
   * there, and the page showed nothing — because a placement has no renderer in the text stack, and
   * the only product that had ever drawn one draws it as a positioned box on a canvas. A page's
   * placement is a block in the column, so it is a `<div>` that holds whatever the definition
   * resolved to.
   *
   * `data-component` for the same reason the other products write it: the drawing has to be able to
   * say which definition it is, or a panel has to ask the model what the reader is already looking
   * at.
   *
   * ## And **it** is what gets a position, not the thing inside it
   *
   * A `position: sticky` block is held at an edge *within its parent's box*. A block inside a
   * definition has this wrapper as its parent, and the wrapper is exactly that block's height — 82
   * pixels, measured in a browser — so a header made sticky in its own definition had nowhere to
   * travel and scrolled away with the page. The stylesheet was correct and nothing happened, which
   * is `sticky`'s signature failure.
   *
   * `display: contents` on the wrapper fixes it and costs more than it is worth: an element with no
   * box cannot be pressed, cannot be measured, and cannot be selected — thirteen browser tests said
   * so at once, and every one of them was a reader losing the ability to pick up a placement.
   *
   * So a position goes **on the placement**, which is where it belongs anyway: whether a header
   * follows the page is a fact about the page it is on, not about the component. A reader who
   * assembled their header out of ordinary stacks sets it on the stack; a reader who placed one sets
   * it on the placement; both are the same row in the panel.
   */
  define('instance', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    return element(
      /*
       * A placement can be a landmark, and it is **the case that matters**: the sample's header and
       * footer are placements of definitions, so a page whose only landmark-capable node was a plain
       * stack could not have marked its own header.
       */
      (typeof attrs.landmark === 'string' && attrs.landmark
        ? attrs.landmark
        : 'div') as 'header' | 'nav' | 'main' | 'aside' | 'footer' | 'div',
      {
        className: 'st-placement',
        'data-component-id': typeof attrs.componentId === 'string' ? attrs.componentId : undefined,
        /*
         * Which row this drawing is, when it is one of a list's. Written on the drawing so a click,
         * a panel or a test can ask without counting siblings — the same reason every other product
         * writes what a drawn element *is* rather than making a reader infer it.
         */
        'data-row': typeof attrs.rowIndex === 'number' ? String(attrs.rowIndex) : undefined,
        /*
         * **Where pressing this goes**, drawn from the resolved attributes — see the stack renderer
         * for why the export can no longer read it from the stored node. A placement is the shape a
         * row of a list actually has, so this is the one that mattered.
         */
        'data-goes': typeof attrs.goes === 'string' && attrs.goes.trim() ? attrs.goes.trim() : undefined,
        /**
         * **Where this value came from**, when it was not typed here — a column of a dataset, or the
         * document's own named value.
         *
         * Asked for as *어디가 데이터이고 어디가 아닌지 구분이 잘 안 된다*, and the reason it could not be
         * said is that resolution is total: `field:제목` has become the title by the time anything draws, so
         * the drawing had no way to know it had not been typed. `canvas-instance` keeps the reference beside
         * the resolved value now, and this is where it reaches the page.
         *
         * **Editor only**, and the export is what says so — `clean` strips it, in one place, because
         * the renderers that draw it are in two packages now.
         */
        'data-from': typeof attrs.boundFrom === 'string' ? attrs.boundFrom : undefined,
        /*
         * And its own opacity, which is the one paint decision a **placement** gets to make. What a
         * card looks like is its definition's; how much of it comes through here is this one's — a
         * placement faded to show it is a draft, or a row of them where one is highlighted by the
         * others being at 40%.
         */
        style: {
          display: 'flex',
          flexDirection: 'column',
          ...sizingCss(attrs, inScrollingRow(ctx, node)),
          ...positionCss(attrs),
          ...opacityCss(attrs),
          ...presenceCss(attrs)
        }
      },
      [slot('content')]
    );
  });

  /**
   * A **collection**: the rows, arranged the way a stack arranges anything.
   *
   * A stack with two extra things it can say — which data, and which row each drawn child is. Its
   * children are not in the document: they are resolved, one placement per row, by the store's
   * content resolver (`collection-resolution.ts`), and `slot('content')` draws whatever that
   * returned exactly as it draws a stack's own children.
   *
   * `frameCss` again, and `drawnAttrs` again, so a product grid is three across on a desktop and one
   * on a phone by saying so in the same attribute every other stack uses.
   */
  /**
   * **서식 있는 글**, drawn — which is what makes it editable at all.
   *
   * A `richText` lives in `resources` and is pointed at from a cell (`text:요약-스택`), so nothing on
   * a page ever draws one: what a card gets is its **blocks**, lifted into the bound part by
   * `bodiesForRow`. So this renderer exists for exactly one caller — the small view the row's form
   * mounts over it — and without it that view drew an empty box, because a view can only draw a node
   * type something has defined.
   *
   * A plain box with its children in it, and **not** the `w-def` treatment the other resources get
   * (`display: none`, because a style definition is read and never drawn). This one is read *and*
   * drawn: it is the only resource in this schema whose content is words a person writes.
   */
  define('richText', element('div', { className: 'st-rich' }, [slot('content')]));

  /**
   * A **chart**, drawn as an `<svg>` from the arithmetic in `chart.ts`.
   *
   * ## No library, in the editor or in the published page
   *
   * `live.ts` settled this rule for lists and this is the same shape one step further: the export
   * ships **the drawing it already made**, marked, and its script rewrites the marked parts. So the
   * chart a visitor sees is this SVG, and a live one is the same geometry re-run over new numbers —
   * not a charting library booted in their browser.
   *
   * Which is why every point says which row it is (`data-st-point`), in exactly the place a live
   * list's rows say which row they are.
   *
   * ## The rows are the list's rows
   *
   * `rowsOf` with the node's own attributes: a chart names a dataset and asks the same
   * filter-sort-limit question a `collection` asks, deliberately with the same four attributes. So a
   * chart and the list beside it can be given the same answer and be about the same thing.
   */
  define('chart', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    const doc = getWordDocument(ctx?.env as RenderEnv | undefined);
    const dataset = datasetNamed(doc as never, attrs.source);
    /*
     * **Filter, group, then sort and limit** — see `chartRows`. *상위 세 분류* means three of the
     * groups, not the groups of the first three rows, and the two are different answers to one
     * sentence.
     */
    const asked = chartRows(dataset as never, attrs as never);
    const shape = chartShape(asked.rows, { ...attrs, valueBy: asked.valueBy } as never);
    /* `drawnAttrs` has already resolved a `var:강조` by here — see `named`. */
    const ink = asColour(attrs.plotInk) ?? 'currentColor';
    const base = baselineOf(shape);

    /**
     * **A donut**, which is the one kind whose arithmetic is about the drawing rather than the data.
     *
     * `chartShape` gives every kind the same three facts — which row, what it says, what it is worth
     * — and stops there, because a value's *place* in a donut is not a point in a box: it is a share
     * of a turn, which only exists once every other value is known. So the angles are worked out
     * here, where the shape is.
     *
     * A **donut** and not a pie, deliberately: a hole in the middle is where the total goes, and a
     * total is the number a reader of a dashboard is looking for first. It also makes the slices read
     * as lengths rather than as areas, which is the one thing a pie chart is criticised for.
     *
     * Negative values are **left out**. A share of a whole is a thing a negative number does not
     * have, and drawing one as a slice would be the chart saying something false about arithmetic
     * rather than about the data — `boundsOf` makes the same call from the other side by keeping zero
     * in range on every other kind.
     */
    const donut = () => {
      const parts = shape.points.filter((one) => one.value > 0);
      const whole = parts.reduce((total, one) => total + one.value, 0);
      if (whole <= 0) return [] as ReturnType<typeof element>[];

      const middle = { x: shape.plot.x + shape.plot.width / 2, y: shape.plot.y + shape.plot.height / 2 };
      const outer = Math.min(shape.plot.width, shape.plot.height) / 2;
      const inner = outer * 0.58;

      let turned = -Math.PI / 2;
      return parts.map((one, index) => {
        const sweep = (one.value / whole) * Math.PI * 2;
        const from = turned;
        const to = turned + sweep;
        turned = to;

        const at = (radius: number, angle: number) => ({
          x: middle.x + Math.cos(angle) * radius,
          y: middle.y + Math.sin(angle) * radius
        });
        const a = at(outer, from);
        const b = at(outer, to);
        const c = at(inner, to);
        const d = at(inner, from);
        /* The flag every arc needs: more than half a turn is drawn the long way round. */
        const big = sweep > Math.PI ? 1 : 0;

        return element('path', {
          key: `d${index}`,
          'data-st-point': String(one.row),
          'data-st-value': String(one.value),
          d:
            `M${a.x} ${a.y} A${outer} ${outer} 0 ${big} 1 ${b.x} ${b.y} ` +
            `L${c.x} ${c.y} A${inner} ${inner} 0 ${big} 0 ${d.x} ${d.y} Z`,
          fill: ink,
          /*
           * One ink, faded by position — a palette per slice would be a second colour decision the
           * document never made, and this site has **one** accent by design. Order is what
           * distinguishes them, which is also what the labels say.
           */
          opacity: String(Math.max(0.28, 1 - index * 0.18))
        });
      });
    };

    /** One point, as the shape its kind is. Each carries its row, so a live page can rewrite it. */
    const drawn = shape.kind === 'donut' ? donut() : shape.points.map((one, index) => {
      const mark = {
        'data-st-point': String(one.row),
        'data-st-value': String(one.value),
        key: `p${index}`
      };
      if (shape.kind === 'bar') {
        const width = Math.max(1, (shape.plot.width / Math.max(1, shape.points.length)) * 0.62);
        return element('rect', {
          ...mark,
          x: String(one.x - width / 2),
          y: String(Math.min(one.y, base)),
          width: String(width),
          height: String(Math.max(1, Math.abs(base - one.y))),
          fill: ink,
          rx: '1'
        });
      }
      /*
       * A line and an area both draw their path once, below — what a point contributes here is the
       * **dot**, which is what a reader aims at and what a live update moves.
       */
      return element('circle', { ...mark, cx: String(one.x), cy: String(one.y), r: '2.5', fill: ink });
    });

    const path = shape.points.map((one, index) => `${index === 0 ? 'M' : 'L'}${one.x} ${one.y}`).join(' ');

    return element(
      'div',
      {
        className: 'st-chart',
        'data-source': typeof attrs.source === 'string' ? attrs.source : undefined,
        'data-chart': shape.kind,
        /**
         * **Which columns it is drawn from**, on the drawing.
         *
         * The conformance harness asked for these and it was right to: a chart with no `source` has
         * no points, so changing which column is the label changed nothing at all — an attribute a
         * reader can set, a file can record, and the page is identical.
         *
         * Said here rather than exempted, because the published page needs them for the same reason
         * a live **list** writes `data-st-field` on each drawn piece: a script that refetches has to
         * know which column each part of the drawing came from. So this is the fact the drawing was
         * always going to have to carry, arriving early because a check asked for it.
         */
        'data-label-by': typeof attrs.labelBy === 'string' ? attrs.labelBy : undefined,
        /* What was **grouped into**, which is `개수` when the aggregate needs no value column. */
        'data-value-by': asked.valueBy || undefined,
        'data-group-by': typeof attrs.groupBy === 'string' && attrs.groupBy ? attrs.groupBy : undefined,
        'data-agg': typeof attrs.groupBy === 'string' && attrs.groupBy ? String(attrs.agg ?? 'sum') : undefined,
        style: {
          ...sizingCss(attrs, inScrollingRow(ctx, node)),
          ...paintCss(attrs, asColour),
          ...positionCss(attrs),
          ...presenceCss(attrs)
        }
      },
      [
        ...(typeof attrs.title === 'string' && attrs.title
          ? [element('p', { className: 'st-chart-title' }, [attrs.title])]
          : []),
        element(
          'svg',
          {
            className: 'st-chart-plot',
            viewBox: `0 0 ${CHART_BOX.width} ${CHART_BOX.height}`,
            /*
             * **The plot box, on the drawing**, so a live refetch can put a point where the axis
             * says without being told the axis: the published SVG already has the columns, the
             * labels and the widths, and what changes is how tall each one is. The axis itself is
             * *not* sent — it is recomputed, because a value that grew past the published maximum
             * drawn against the published axis is a bar out of its own chart.
             */
            /*
             * **What it is drawn in, on the drawing** — the points carry it too, and this is what a
             * chart with no rows yet still says. A default `fill` is also what an `<svg>` is for:
             * everything inside takes it unless it says otherwise.
             */
            fill: ink,
            'data-plot-top': String(shape.plot.y),
            'data-plot-height': String(shape.plot.height),
            role: 'img',
            /*
             * **What it is, in words**, because an `<svg>` of rectangles says nothing to a screen
             * reader and a chart is exactly the kind of thing somebody is told about rather than
             * shown. The numbers themselves are in the list a dashboard puts beside it.
             */
            'aria-label': `${typeof attrs.title === 'string' && attrs.title ? attrs.title : '차트'} · ${
              shape.points.length
            }개`
          },
          [
            /* The axis: a line per tick, and the number at the left of it. */
            ...shape.ticks.flatMap((tick, index) => {
              const span = shape.high - shape.low || 1;
              const y = shape.plot.y + shape.plot.height - ((tick - shape.low) / span) * shape.plot.height;
              return [
                element('line', {
                  key: `t${index}`,
                  x1: String(shape.plot.x),
                  y1: String(y),
                  x2: String(shape.plot.x + shape.plot.width),
                  y2: String(y),
                  stroke: 'currentColor',
                  'stroke-width': '0.5',
                  opacity: tick === 0 ? '0.45' : '0.15'
                }),
                element(
                  'text',
                  {
                    key: `n${index}`,
                    x: String(shape.plot.x - 4),
                    y: String(y + 3),
                    'text-anchor': 'end',
                    'font-size': '8',
                    fill: 'currentColor',
                    opacity: '0.6'
                  },
                  [axisNumber(tick)]
                )
              ];
            }),
            ...(shape.kind === 'area' && shape.points.length > 1
              ? [
                  element('path', {
                    key: 'fill',
                    d: `${path} L${shape.points[shape.points.length - 1].x} ${base} L${shape.points[0].x} ${base} Z`,
                    fill: ink,
                    opacity: '0.18'
                  })
                ]
              : []),
            ...(shape.kind !== 'bar' && shape.kind !== 'donut' && shape.points.length > 1
              ? [element('path', { key: 'line', d: path, fill: 'none', stroke: ink, 'stroke-width': '2' })]
              : []),
            ...drawn,
            /* And what each point is called, under it — the axis a reader actually reads. */
            ...shape.points.map((one, index) =>
              element(
                'text',
                {
                  key: `l${index}`,
                  x: String(one.x),
                  y: String(shape.plot.y + shape.plot.height + 12),
                  'text-anchor': 'middle',
                  'font-size': '8',
                  fill: 'currentColor',
                  opacity: '0.7'
                },
                [one.label]
              )
            )
          ]
        )
      ]
    );
  });

  define('collection', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    return element(
      // A list of posts is very often the page's body — see `frame` for the whole reasoning.
      (typeof attrs.landmark === 'string' && attrs.landmark
        ? attrs.landmark
        : 'div') as 'header' | 'nav' | 'main' | 'aside' | 'footer' | 'div',
      {
        className: 'st-collection',
        'data-source': typeof attrs.source === 'string' ? attrs.source : undefined,
        'data-name': typeof attrs.name === 'string' ? attrs.name : undefined,
        /**
         * **Where pressing this goes**, drawn — and it used to be read from the stored node at
         * export time only.
         *
         * Which worked for a block a reader wrote a destination on, and could not work for a **row
         * of a list**: a row draws as `${collection}~${index}~${part}`, so the lookup landed on the
         * *definition's* part and every row went to the same place. A blog whose list of posts could
         * not link to the posts is the shape that found it.
         *
         * From the **resolved** attributes, so `var:` and `field:` have already become what they
         * mean — which is what makes a destination a thing a dataset can say.
         */
        'data-goes': typeof attrs.goes === 'string' && attrs.goes.trim() ? attrs.goes.trim() : undefined,
        /**
         * **Where this value came from**, when it was not typed here — a column of a dataset, or the
         * document's own named value.
         *
         * Asked for as *어디가 데이터이고 어디가 아닌지 구분이 잘 안 된다*, and the reason it could not be
         * said is that resolution is total: `field:제목` has become the title by the time anything draws, so
         * the drawing had no way to know it had not been typed. `canvas-instance` keeps the reference beside
         * the resolved value now, and this is where it reaches the page.
         *
         * **Editor only**, and the export is what says so — `clean` strips it, in one place, because
         * the renderers that draw it are in two packages now.
         */
        'data-from': typeof attrs.boundFrom === 'string' ? attrs.boundFrom : undefined,
        'data-layout': typeof attrs.layoutMode === 'string' ? attrs.layoutMode : 'none',
        /*
         * Said on the element as well as in its style, because the **children** need it: a snapping
         * child says `scroll-snap-align` and CSS gives a parent no way to say it for them. A rule in
         * `PAGE_CSS` keys off this.
         */
        'data-scrolls': attrs.scrolls ? String(attrs.scrolls) : undefined,
        'data-at': ctx?.env ? breakpointOf(ctx.env as RenderEnv) : undefined,
        style: {
          ...stackCss(attrs),
          ...sizingCss(attrs, inScrollingRow(ctx, node)),
          ...presenceCss(attrs)
        }
      },
      [slot('content')]
    );
  });

  /**
   * A **form**: a stack that submits.
   *
   * Drawn as a real `<form>`, which is the whole point rather than a detail — the Enter key submits,
   * a browser's own validation runs, a password manager can see it, and a page whose script failed
   * still works. Every builder that draws a form as a `<div>` and posts it with a script has taken
   * all four of those away without telling anybody.
   *
   * `action` and `method` are written **only in the published page**, and they are **resolved from a
   * name**: the form says which connection it sends through and the address lives on a `service` in
   * `resources`, so five forms share one address rather than five copies of it.
   *
   * In the editor they are left off deliberately: a designer pressing Enter in a field they are
   * laying out should not send a message to a stranger's service, and a board is not a place where
   * submitting means anything. `siteEnv` says which side of that line the drawing is on.
   */
  define('form', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    const live = published(ctx?.env as RenderEnv | undefined);
    const service = live ? serviceFor(ctx, attrs.sends) : undefined;
    return element(
      'form',
      {
        className: 'st-form',
        'data-name': typeof attrs.name === 'string' ? attrs.name : undefined,
        'data-layout': typeof attrs.layoutMode === 'string' ? attrs.layoutMode : 'column',
        'data-at': ctx?.env ? breakpointOf(ctx.env as RenderEnv) : undefined,
        /*
         * A connection with no address publishes as a form with **no `action` at all**, rather than
         * one pointed at the empty string — which a browser resolves to *this page*, so pressing
         * 보내기 would reload the page and look like the message went somewhere.
         */
        action: service?.endpoint?.trim() ? service.endpoint.trim() : undefined,
        method: service?.endpoint?.trim() ? service.method : undefined,
        /**
         * And **how it is encoded**, which one field kind changes and the rest do not.
         *
         * A browser sends a form as `application/x-www-form-urlencoded` unless told otherwise, and
         * that encoding cannot carry a file: a form with a file field and no `enctype` sends every
         * other answer and **silently drops the attachment**. Nothing errors and nothing is logged;
         * the person who attached it has no idea.
         *
         * Written only when a file is asked for, so every form this product has already published is
         * byte-for-byte what it was. Read from the children rather than stored on the form — see
         * `needsUpload`: a stored copy is a second thing to keep true the day the field is deleted.
         */
        enctype: uploadsIn(ctx, node) ? 'multipart/form-data' : undefined,
        style: {
          ...stackCss(attrs),
          ...sizingCss(attrs, inScrollingRow(ctx, node)),
          ...presenceCss(attrs)
        }
      },
      /**
       * And **the two things the service has to be told**, as hidden fields — where to send the
       * visitor back to, and which input a bot will fill.
       *
       * Before the content rather than after it, because a hidden input has no box and this is the
       * order a reader of the markup would expect: what the form *is* about, then what it asks.
       *
       * On the published page only. A board has no address to return to and nothing to trap.
       */
      [
        ...(live
          ? hiddenFields(service, thanksAt(ctx, attrs.thanks)).map((one) =>
              element('input', { type: 'hidden', name: one.name, value: one.value })
            )
          : []),
        slot('content')
      ]
    );
  });

  /**
   * A **field**: one question a visitor answers, or the button that sends them.
   *
   * ## The label is drawn, always
   *
   * A `<label>` with a real `for`, above the control, even when the field has a placeholder. Labelling
   * a form with its placeholders is the commonest accessibility fault on the web and it is not a
   * subtle one: the words vanish the moment somebody types, so anybody who looks away has lost the
   * question, and a screen reader is told a hint where a name belongs.
   *
   * ## And it is not typable in the editor
   *
   * `readOnly` on a board, so a click selects the block a designer meant to select rather than
   * putting a caret in a control they are arranging. In preview the pointer goes to the page and the
   * fields are live, which is where a designer actually wants to try one.
   */
  define('field', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    const live = published(ctx?.env as RenderEnv | undefined);
    const name = answerNameOf(attrs);
    const label = typeof attrs.label === 'string' ? attrs.label : '';
    const id = `f-${String(node.sid ?? name)}`;

    if (isSubmitField(attrs.kind)) {
      return element(
        'button',
        {
          className: 'st-field st-submit',
          type: 'submit',
          'data-name': typeof attrs.name === 'string' ? attrs.name : undefined,
          // Not pressable on a board: a designer arranging a form should not be sending messages.
          disabled: live ? undefined : true,
          style: {
            ...controlPaint(attrs),
            ...sizingCss(attrs, inScrollingRow(ctx, node)),
            ...positionCss(attrs),
            ...presenceCss(attrs)
          }
        },
        [label || '보내기']
      );
    }

    /**
     * A **tick** is the one field whose label goes after its box and wraps it.
     *
     * Every other field is a question with a box under it. A checkbox is a statement with a box in
     * front of it, and putting its words above would leave a labelled empty line followed by an
     * unexplained square. It is also the one field whose label a visitor **clicks**, which is what
     * wrapping buys and pointing at does not — a 14-pixel target becomes the whole sentence.
     *
     * In Korea this is the field a form collecting personal data needs, and the policy link that
     * belongs beside it is an ordinary paragraph the form holds: a label is a string and a link is
     * not, and a rich label would be a second text model inside an attribute.
     */
    if (isTickField(attrs.kind)) {
      return element(
        'label',
        {
          className: 'st-field st-tick',
          'data-name': typeof attrs.name === 'string' ? attrs.name : undefined,
          'data-kind': 'checkbox',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            ...sizingCss(attrs, inScrollingRow(ctx, node)),
            ...positionCss(attrs),
            ...presenceCss(attrs)
          }
        },
        [
          element('input', {
            id,
            name,
            type: 'checkbox',
            value: '예',
            required: attrs.required === true ? true : undefined,
            disabled: live ? undefined : true,
            className: 'st-input'
          }),
          element('span', { className: 'st-label' }, [label || name])
        ]
      );
    }

    const control = isParagraphField(attrs.kind)
      ? element('textarea', {
          id,
          name,
          rows: typeof attrs.lines === 'number' ? attrs.lines : 4,
          required: attrs.required === true ? true : undefined,
          maxlength: typeof attrs.maxLength === 'number' ? attrs.maxLength : undefined,
          placeholder: typeof attrs.placeholder === 'string' ? attrs.placeholder : undefined,
          readonly: live ? undefined : true,
          className: 'st-input'
        } as never)
      : isChoiceField(attrs.kind)
        ? element(
            'select',
            {
              id,
              name,
              required: attrs.required === true ? true : undefined,
              disabled: live ? undefined : true,
              className: 'st-input'
            } as never,
            [
              /*
               * An empty first option, so a `required` list is genuinely unanswered until somebody
               * chooses. Without it a browser reports the first entry as the answer and every message
               * arrives saying whatever happened to be at the top.
               */
              element('option', { value: '' }, [
                typeof attrs.placeholder === 'string' && attrs.placeholder
                  ? attrs.placeholder
                  : '고르세요'
              ]),
              ...choicesOf(attrs).map((one) => element('option', { value: one }, [one]))
            ]
          )
        : element('input', {
            id,
            name,
            type: inputTypeOf(attrs.kind),
            required: attrs.required === true ? true : undefined,
            min: typeof attrs.min === 'number' ? attrs.min : undefined,
            max: typeof attrs.max === 'number' ? attrs.max : undefined,
            maxlength: typeof attrs.maxLength === 'number' ? attrs.maxLength : undefined,
            placeholder: typeof attrs.placeholder === 'string' ? attrs.placeholder : undefined,
            /*
             * A **file** is disabled on the board rather than read-only, which is the same choice a
             * tick and a list already make: `readonly` means nothing to a file input, so a designer
             * arranging the form would open a file picker by clicking it.
             */
            readonly: live || attrs.kind === 'file' ? undefined : true,
            disabled: !live && attrs.kind === 'file' ? true : undefined,
            className: 'st-input'
          } as never);

    return element(
      'div',
      {
        className: 'st-field',
        'data-name': typeof attrs.name === 'string' ? attrs.name : undefined,
        'data-kind': typeof attrs.kind === 'string' ? attrs.kind : 'text',
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          ...sizingCss(attrs, inScrollingRow(ctx, node)),
          ...positionCss(attrs),
          ...presenceCss(attrs)
        }
      },
      [
        /*
         * `for` and the control attributes below are written verbatim: the DSL's attribute types are
         * the ones a *document* renderer needs, and a form control's are HTML's own. A cast here is
         * narrower than widening those types for one product's five node kinds.
         */
        element('label', { className: 'st-label', for: id } as never, [label || name]),
        element('span', { className: 'st-input-wrap', style: controlPaint(attrs) }, [control])
      ]
    );
  });

  /**
   * A picture on a page.
   *
   * Its own renderer rather than Word's, for the reason the whole product exists: Word draws a
   * `picture` inside an `<svg>` canvas at a coordinate, and a page has no canvas and no
   * coordinates. Here it is an `<img>` in the flow that fills the width it is given.
   */
/**
   * **A picture inside a line** — a sticker, in the words a reader would use.
   *
   * Its own renderer here rather than `office-text`'s, and the difference is one line: an `asset:`
   * reference. A page's pictures are files **in the document**, named, so a rename moves every use
   * and the bytes are written once — which the block `picture` below has always done and the inline
   * one did not, so a sticker put in from the asset box drew a broken image with `asset:하트` in the
   * `src` attribute.
   *
   * No new node type, which is the point: a sticker *is* an inline image. What it needed was
   * somewhere to pick one from, and for the picture to resolve the name like everything else on a
   * page does.
   */
  define('inline-image', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = (node.attributes ?? {}) as Record<string, unknown>;
    const doc = getWordDocument(ctx?.env as RenderEnv | undefined);
    const live = published(ctx?.env as RenderEnv | undefined);
    return element('img', {
      className: 'st-sticker',
      src: assetSrc(doc as never, attrs.src, live),
      alt: String(attrs.alt ?? ''),
      /*
       * Its height is the line's, so a sticker sits in a sentence rather than pushing it apart — a
       * picture that decides its own height in the middle of a paragraph is a paragraph whose lines
       * are different heights. A reader who wants a big one wants a block, and the page has one.
       */
      style: { height: '1.35em', width: 'auto', verticalAlign: '-0.28em' }
    });
  });

/**
   * **A video**, drawn by the browser.
   *
   * `<video controls>` and nothing else: no player, no library, no script. Every video library on the
   * web exists to skin this element, and a skin is a thing a visitor has to download before they can
   * press play.
   *
   * `aspect` matters more here than on a picture and the reason is worth stating: a video that has
   * not loaded has **no** intrinsic size, so a page without one jumps by several hundred pixels the
   * moment the metadata arrives — the classic layout shift, and the one every performance report
   * blames on video.
   */
  define('mediaVideo', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = (node.attributes ?? {}) as Record<string, unknown>;
    const doc = getWordDocument(ctx?.env as RenderEnv | undefined);
    const live = published(ctx?.env as RenderEnv | undefined);
    return element('video', {
      className: 'st-video',
      src: assetSrc(doc as never, attrs.src, live),
      poster: attrs.poster ? assetSrc(doc as never, attrs.poster, live) : undefined,
      /*
       * On unless a reader says otherwise, which is the honest default rather than the pretty one: a
       * video a visitor cannot pause is a video they close the tab on.
       */
      controls: attrs.controls === false ? undefined : true,
      /*
       * **The attribute, and it is not the same as the property.**
       *
       * `muted` is the one media attribute a browser does *not* reflect onto an element it has
       * already created: the attribute is the page's *initial* state, so setting it on a live element
       * leaves `video.muted` false. Measured — `getAttribute('muted')` said "true" and the video was
       * not muted.
       *
       * A published page is parsed from markup, so the attribute is the whole answer there. The board
       * builds elements, so the board also needs the property said — which is what the reconciler's
       * property path is for and is why this is written as `true` rather than as a string.
       */
      muted: attrs.muted === true ? true : undefined,
      loop: attrs.loop === true ? true : undefined,
      // `metadata`, not `auto`: a page with three videos on it should not download three videos.
      preload: 'metadata',
      playsinline: true,
      style: {
        display: 'block',
        maxWidth: '100%',
        /*
         * The same set a picture draws, because a video and an embed are the same kind of thing: a
         * rectangle in the flow that a reader sizes, places, paints and reveals. Sharing the list
         * rather than choosing a subset is also what stops three block types drifting into three
         * different ideas of what a block can say.
         */
        ...aspectCss(attrs as never),
        ...sizingCss(attrs as never, inScrollingRow(ctx, node)),
        ...positionCss(attrs as never),
        /*
         * `frameCss` before `paintCss`, which is the order a stack uses and for its reason: the first
         * writes the flat colour, the single radius and the border; the second is the longer answer —
         * four separate corners, a shadow — and the longer answer has to win.
         *
         * A video and an embed take the border and the corners from it, because their fill is painted
         * over by whatever they end up showing. `boxAttrs` is the schema half of the same sentence.
         */
        ...frameCss(attrs as never),
        ...paintCss(attrs as never, asColour),
        ...opacityCss(attrs as never),
        ...presenceCss(attrs as never)
      }
    });
  });

  /**
   * **An embed** — a map, or a video somebody else hosts.
   *
   * An `<iframe>`, which is a browser feature from 1997 and needs nothing. What this adds is the one
   * thing worth adding: the document holds a **provider and an id** rather than a URL, so a company
   * changing its address shape does not break every page that used it, and an unknown provider draws
   * nothing rather than a frame pointing at whatever somebody pasted. See `embed.ts`.
   *
   * `loading="lazy"` and a `sandbox`, both of which an embed on somebody else's page should have had
   * from the beginning: a map three screens down should not be fetched before the page is read, and
   * a frame that can navigate the page it is in is a frame that can take a visitor somewhere they did
   * not ask to go.
   */
  define('mediaEmbed', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = (node.attributes ?? {}) as Record<string, unknown>;
    const src = embedSrc(attrs.provider, attrs.id);
    if (!src) {
      /*
       * Nothing to draw, drawn as nothing — and said in the fault list rather than as a grey
       * rectangle a reader cannot tell from a broken one. The rule every reference in this model
       * follows.
       */
      return element('div', {
        className: 'st-embed st-embed-empty',
        'data-embed': 'none',
        /*
         * **Still a box.** An embed with nothing to show is still something a reader placed, sized
         * and gave a corner to — drawing it as a bare `div` made every one of those attributes read
         * as unread, which the harness said thirty-six times and was right about each. It is also
         * what a reader needs to see: a rectangle where the thing will be, not a collapse.
         */
        style: {
          display: 'block',
          maxWidth: '100%',
          ...aspectCss(attrs as never),
          ...sizingCss(attrs as never, inScrollingRow(ctx, node)),
          ...positionCss(attrs as never),
          ...paintCss(attrs as never, asColour),
          ...opacityCss(attrs as never),
          ...presenceCss(attrs as never)
        }
      });
    }
    return element('iframe', {
      className: 'st-embed',
      src,
      title: typeof attrs.title === 'string' && attrs.title ? attrs.title : '넣은 콘텐츠',
      loading: 'lazy',
      referrerpolicy: 'no-referrer',
      sandbox: 'allow-scripts allow-same-origin allow-popups allow-presentation',
      allow: 'accelerometer; encrypted-media; picture-in-picture; fullscreen',
      style: {
        display: 'block',
        maxWidth: '100%',
        /*
         * A frame's own border comes off first and the reader's goes on after — every browser draws
         * an iframe with a 2px inset one, which is a border nobody chose and which sat under a
         * reader's until this was moved above `frameCss` rather than below it.
         */
        border: 0,
        /*
         * The same set a picture draws, because a video and an embed are the same kind of thing: a
         * rectangle in the flow that a reader sizes, places, paints and reveals. Sharing the list
         * rather than choosing a subset is also what stops three block types drifting into three
         * different ideas of what a block can say.
         */
        ...aspectCss(attrs as never),
        ...sizingCss(attrs as never, inScrollingRow(ctx, node)),
        ...positionCss(attrs as never),
        /*
         * `frameCss` before `paintCss`, which is the order a stack uses and for its reason: the first
         * writes the flat colour, the single radius and the border; the second is the longer answer —
         * four separate corners, a shadow — and the longer answer has to win.
         *
         * A video and an embed take the border and the corners from it, because their fill is painted
         * over by whatever they end up showing. `boxAttrs` is the schema half of the same sentence.
         */
        ...frameCss(attrs as never),
        ...paintCss(attrs as never, asColour),
        ...opacityCss(attrs as never),
        ...presenceCss(attrs as never)
      }
    });
  });

  define('picture', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    /*
     * **A file in the document**, or an address — see `assets.ts`. The bytes on a board, because a
     * board has no server to ask; the file's own path on a published page, because inlining a logo
     * used on five pages writes its bytes five times and a photograph in the middle of the HTML
     * delays the first paint by exactly as long as it takes to download.
     */
    const doc = getWordDocument(ctx?.env as RenderEnv | undefined);
    const asset = isAssetRef(attrs.src) ? assetNamed(doc as never, assetNameOf(attrs.src)) : undefined;

    const live = published(ctx?.env as RenderEnv | undefined);

    return element('img', {
      className: 'st-picture',
      src: assetSrc(doc as never, attrs.src, live),
      alt: String(attrs.alt ?? ''),
      /*
       * **Where pressing this goes**, drawn from the resolved attributes — see the stack renderer for
       * why the export can no longer read it from the stored node.
       */
      'data-goes': typeof attrs.goes === 'string' && attrs.goes.trim() ? attrs.goes.trim() : undefined,
      /**
       * **Where this value came from**, when it was not typed here — a column of a dataset, or the
       * document's own named value.
       *
       * Asked for as *어디가 데이터이고 어디가 아닌지 구분이 잘 안 된다*, and the reason it could not be
       * said is that resolution is total: `field:제목` has become the title by the time anything draws, so
       * the drawing had no way to know it had not been typed. `canvas-instance` keeps the reference beside
       * the resolved value now, and this is where it reaches the page.
       *
       * **Editor only**, and the export is what says so — `clean` strips it, in one place, because
       * the renderers that draw it are in two packages now.
       */
      'data-from': typeof attrs.boundFrom === 'string' ? attrs.boundFrom : undefined,
      /**
       * And **the sizes a browser may choose from**, on the published page only.
       *
       * The single largest cost of a page built with a tool like this is a photograph taken at 4000
       * pixels and sent, whole, to a phone that is 390 wide. A browser has had the answer since 2014
       * and needs to be handed the renditions; which one to fetch is a decision it makes knowing the
       * screen and the connection, and one this product cannot make for it.
       *
       * Not on a board, and for the plain reason: a board has no files to point at, only bytes.
       *
       * `sizes` says how wide the picture will be drawn, which a browser cannot know before it has
       * laid the page out and must guess before it fetches. The block's own `maxWidth` is the honest
       * answer where there is one, and `100vw` — *as wide as the window* — where there is not: an
       * overestimate costs a larger file, an underestimate costs a blurry one, and only one of those
       * is a thing a reader will report.
       */
      srcset: live ? srcsetFor(asset) : undefined,
      sizes:
        live && srcsetFor(asset)
          ? typeof attrs.maxWidth === 'number'
            ? `(max-width: ${Math.round((attrs.maxWidth * 96) / 1440)}px) 100vw, ${Math.round((attrs.maxWidth * 96) / 1440)}px`
            : '100vw'
          : undefined,
      /*
       * And **not until it is needed**, for every picture but the first.
       *
       * `lazy` on a picture above the fold delays the one image a visitor is waiting for, which is
       * why this is a reader's decision rather than a blanket rule — and why the default is off. The
       * panel's 나중에 불러오기 is where a hero says no and a photograph far down the page says yes.
       */
      loading: live && attrs.defer === true ? 'lazy' : undefined,
      decoding: live && attrs.defer === true ? 'async' : undefined,
      /*
       * And **how big the file is**, which is not how big it is drawn.
       *
       * An `<img>` with no intrinsic size is a hole of zero height until it has loaded, so every
       * word under it jumps down when it arrives — the layout shift every performance guide measures,
       * and the one a builder that stores only a URL cannot fix because it has never seen the file.
       * This one has: the width and height are read off the file when it is added.
       */
      width: asset?.width,
      height: asset?.height,
      style: {
        display: 'block',
        maxWidth: '100%',
        objectFit: typeof attrs.fit === 'string' ? String(attrs.fit) : 'cover',
        /*
         * And **the shape it keeps** at every width, which a height cannot say: a picture in a
         * column is 1200 wide on a laptop and 350 on a phone. See `aspect.ts`.
         */
        ...aspectCss(attrs),
        /*
         * A ground behind it, and a line around it.
         *
         * Read rather than exempted, which the harness is what settled: a picture on a page is very
         * often a transparent PNG on a colour, or a photograph with a hairline. A stack could do
         * both by wrapping it, and making a reader wrap a picture to give it a border is the kind of
         * thing a builder is supposed to save them from.
         */
        ...(typeof attrs.fill === 'string' && attrs.fill ? { background: attrs.fill } : {}),
        ...(typeof attrs.stroke === 'string' && attrs.stroke
          ? {
              border: `${Math.round(((typeof attrs.strokeWidth === 'number' ? attrs.strokeWidth : 15) * 96) / 1440)}px solid ${attrs.stroke}`
            }
          : {}),
        ...sizingCss(attrs, inScrollingRow(ctx, node)),
        ...positionCss(attrs),
        /*
         * And **how much of it comes through**, which is the case opacity exists for: a photograph
         * behind words, a logo at a quarter, an image that brightens on hover. A picture is the one
         * node where a reader reaches for this first.
         */
        ...opacityCss(attrs),
        ...presenceCss(attrs)
      }
      /*
       * `srcset`, `sizes`, `loading` and `decoding` are HTML's own and are not in the DSL's attribute
       * types — the same narrowing the form's controls take above, and for the same reason: those
       * types are the ones a *document* renderer needs, and widening them for one product's five node
       * kinds would be the larger change.
       */
    } as never);
  });
}
