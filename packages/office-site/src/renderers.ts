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
import { define, element, override, slot } from '@barocss/dsl';
import type { RenderEnv } from '@barocss/dsl';
import { registerTextRenderers } from '@barocss/office-text';
import { frameCss } from '@barocss/office-word';
import { sizingCss } from './sizing';
import { breakpointOf } from './breakpoints';
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
const drawnAttrs = (node: NodeData, ctx: any): Record<string, any> =>
  attrsAt(attrsOf(node), breakpointOf(ctx?.env as RenderEnv | undefined)) as never;

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
 * Only when the node says nothing. A stack that states `alignItems` gets what it states, at every
 * width, and this default never overrides a reader — the header's row still centres its wordmark
 * against its links.
 */
const stackCss = (attrs: Record<string, any>): Record<string, any> => ({
  ...frameCss(attrs as never),
  ...(attrs.alignItems === undefined ? { alignItems: 'stretch' } : {})
});

/**
 * Register every renderer a site draws with.
 *
 * Idempotent, like the other two products'.
 */
export function registerSiteRenderers(): void {
  // Everything a page is made of that is not the page. See the header: this is the product.
  registerTextRenderers();

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
          style: {
            display: 'flex',
            flexDirection: 'column',
            /*
             * The page is as wide as it is given and as tall as it turns out. A site has no sheet
             * to fit and no page to break: what makes it a *site* is that the height is a
             * consequence.
             */
            width: '100%',
            minHeight: '100%'
          }
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
