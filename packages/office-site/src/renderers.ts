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
import { registerTextRenderers } from '@barocss/office-text';
import { frameCss } from '@barocss/office-word';
import { sizingCss } from './sizing';

type NodeData = Record<string, any>;

const attrsOf = (data: NodeData): Record<string, any> => (data?.attributes ?? {}) as never;

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
  override(
    'frame',
    element(
      'div',
      {
        className: 'st-stack',
        'data-layout': (d: NodeData) =>
          typeof attrsOf(d).layoutMode === 'string' ? attrsOf(d).layoutMode : 'none',
        'data-sizing': (d: NodeData) =>
          typeof attrsOf(d).sizing === 'string' ? attrsOf(d).sizing : undefined,
        style: (d: NodeData) => ({ ...frameCss(attrsOf(d) as never), ...sizingCss(attrsOf(d)) })
      },
      [slot('content')]
    )
  );

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
  define(
    'instance',
    element(
      'div',
      {
        className: 'st-placement',
        'data-component-id': (d: NodeData) =>
          typeof attrsOf(d).componentId === 'string' ? attrsOf(d).componentId : undefined,
        style: (d: NodeData) => ({ display: 'flex', flexDirection: 'column', ...sizingCss(attrsOf(d)) })
      },
      [slot('content')]
    )
  );

  /**
   * A picture on a page.
   *
   * Its own renderer rather than Word's, for the reason the whole product exists: Word draws a
   * `picture` inside an `<svg>` canvas at a coordinate, and a page has no canvas and no
   * coordinates. Here it is an `<img>` in the flow that fills the width it is given.
   */
  define(
    'picture',
    element('img', {
      className: 'st-picture',
      src: (d: NodeData) => String(attrsOf(d).src ?? ''),
      alt: (d: NodeData) => String(attrsOf(d).alt ?? ''),
      style: (d: NodeData) => ({
        display: 'block',
        maxWidth: '100%',
        objectFit: typeof attrsOf(d).fit === 'string' ? String(attrsOf(d).fit) : 'cover',
        ...sizingCss(attrsOf(d))
      })
    })
  );
}
