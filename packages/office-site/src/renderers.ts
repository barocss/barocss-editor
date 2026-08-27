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
import { paintCss } from './paint';
import { sizingCss } from './sizing';
import { breakpointOf } from './breakpoints';
import { codeComponent } from './code-render';
import { attrsAt } from './responsive';

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
  const at = attrsAt(attrsOf(node), breakpointOf(ctx?.env as RenderEnv | undefined));
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
  ...(attrs.clipsContent === undefined ? { overflow: 'visible' } : {})
});

/**
 * A colour, if there is one.
 *
 * `named` has already resolved every `var:이름` on the node by the time this is called, so this is
 * the last narrowing rather than the resolution: a value that is not a non-empty string is not a
 * colour, and writing it into CSS would be writing `undefined` into a stylesheet.
 */
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
        style: { ...sizingCss(attrs as never) }
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
  override(
    'surface',
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
             */
            ...paintCss(attrsOf(d), asColour)
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
      'div',
      {
        className: 'st-stack',
        'data-layout': typeof attrs.layoutMode === 'string' ? attrs.layoutMode : 'none',
        // What a reader called this stack, which the layer list shows and the drawing should say.
        'data-name': typeof attrs.name === 'string' ? attrs.name : undefined,
        'data-sizing': typeof attrs.sizing === 'string' ? attrs.sizing : undefined,
        /*
         * Whether this stack is drawing something a narrower width said, so a reader — and a test —
         * can tell an override from the page's own answer by looking at the drawing.
         */
        'data-at': ctx?.env ? breakpointOf(ctx.env as RenderEnv) : undefined,
        style: { ...stackCss(attrs), ...sizingCss(attrs) }
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
   */
  define('instance', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    return element(
      'div',
      {
        className: 'st-placement',
        'data-component-id': typeof attrs.componentId === 'string' ? attrs.componentId : undefined,
        /*
         * Which row this drawing is, when it is one of a list's. Written on the drawing so a click,
         * a panel or a test can ask without counting siblings — the same reason every other product
         * writes what a drawn element *is* rather than making a reader infer it.
         */
        'data-row': typeof attrs.rowIndex === 'number' ? String(attrs.rowIndex) : undefined,
        style: { display: 'flex', flexDirection: 'column', ...sizingCss(attrs) }
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
  define('collection', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    return element(
      'div',
      {
        className: 'st-collection',
        'data-source': typeof attrs.source === 'string' ? attrs.source : undefined,
        'data-name': typeof attrs.name === 'string' ? attrs.name : undefined,
        'data-layout': typeof attrs.layoutMode === 'string' ? attrs.layoutMode : 'none',
        'data-at': ctx?.env ? breakpointOf(ctx.env as RenderEnv) : undefined,
        style: { ...stackCss(attrs), ...sizingCss(attrs) }
      },
      [slot('content')]
    );
  });

  /**
   * A picture on a page.
   *
   * Its own renderer rather than Word's, for the reason the whole product exists: Word draws a
   * `picture` inside an `<svg>` canvas at a coordinate, and a page has no canvas and no
   * coordinates. Here it is an `<img>` in the flow that fills the width it is given.
   */
  define('picture', (_props: NodeData, node: NodeData, ctx: any) => {
    const attrs = drawnAttrs(node, ctx);
    return element('img', {
      className: 'st-picture',
      src: String(attrs.src ?? ''),
      alt: String(attrs.alt ?? ''),
      style: {
        display: 'block',
        maxWidth: '100%',
        objectFit: typeof attrs.fit === 'string' ? String(attrs.fit) : 'cover',
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
        ...sizingCss(attrs)
      }
    });
  });
}
