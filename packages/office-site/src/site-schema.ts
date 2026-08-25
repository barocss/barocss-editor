/**
 * What a **site** is — which is, again, a question the schema had already answered.
 *
 * `office-schema` says a `surface` holds `block+ | scene*` and records which in its `kind`, with the
 * sentence this product is built on written years before it existed:
 *
 *   "a Word page and a **PageBuilder** page hold blocks, a slide and a FigJam board hold scene
 *    nodes"
 *
 * and, on the kind itself:
 *
 *   "`Flow` — Word, PageBuilder: flow content, **paginated or responsive at the product layer**."
 *
 * So a page of a site is the same node a Word section is, and the difference between the two
 * products is what they do with it: Word measures it and breaks it into sheets, a site builder draws
 * it as one column and lets it reflow. Neither is a new document shape, and this file is therefore
 * mostly empty — which is the claim the third product exists to test.
 *
 * ## What a site adds
 *
 * Two things, and both are about a page rather than about the blocks on it.
 *
 * **A page is a page of a site**, so it needs the name a reader gives it and the address it answers
 * on. `surface.id` and `name` already exist — a deck gave a page a durable id so a button could
 * point at it — and a `path` is the one genuinely new attribute: the address is what a site *is*,
 * and it cannot be derived from a name that two pages may share.
 *
 * **How wide a child means to be.** A frame's children either state a width — and are placed at a
 * coordinate — or state nothing, and the browser decides. A site builder needs the answer every
 * layout tool has and this model has never said: `sizing`, which is `fill`, `hug` or `fixed`. It is
 * a CSS one-liner apiece and it is not derivable from silence, because silence already means two
 * different things depending on the axis and the container.
 */
import { getOfficeSchemaDefinition, type SchemaDefinition } from '@barocss/schema';

/** What a child of a stack means to do with the space along the stack's axis. */
export const SIZING = ['fill', 'hug', 'fixed'] as const;
export type Sizing = (typeof SIZING)[number];

/** The kind a site's pages carry, which is the kind Word's sections carry. */
export const SITE_SURFACE_KIND = 'flow';

export function getSiteSchemaDefinition(): SchemaDefinition {
  const office = getOfficeSchemaDefinition();
  const nodes = office.nodes as Record<string, any>;

  /**
   * What every block on a page may say about its own width.
   *
   * On the node rather than on the parent, because it is the child's decision: three cards in a row
   * where one fills and two hug is an ordinary layout, and a container that decided for all of them
   * could not express it.
   */
  const sizingAttrs = {
    sizing: { type: 'string' as const, required: false, options: [...SIZING] },
    /** The smallest and largest it may be drawn, in twips, for a `fill` that must not collapse. */
    minWidth: { type: 'number' as const, required: false },
    maxWidth: { type: 'number' as const, required: false }
  };

  const withSizing = (name: string) => ({
    ...nodes[name],
    attrs: { ...nodes[name]?.attrs, ...sizingAttrs }
  });

  return {
    ...office,
    nodes: {
      ...office.nodes,

      /**
       * A page of a site.
       *
       * The same surface, with the two things a *site* has that a document does not: an address, and
       * whether it is the one a visitor lands on. `kind` stays `flow` — this is Word's surface, read
       * the other way the schema always said it could be.
       */
      surface: {
        ...nodes.surface,
        attrs: {
          ...nodes.surface.attrs,
          /**
           * Where the page answers: `/`, `/about`, `/blog/first-post`.
           *
           * Not derived from the name. Two pages may be called 소개 and one of them may be the
           * landing page; an address is what a site *is*, and a name is what a reader calls it.
           */
          path: { type: 'string' as const, required: false }
        }
      },

      /** A stack, and everything it may say about the space it takes. */
      frame: withSizing('frame'),
      picture: withSizing('picture'),
      textFrame: withSizing('textFrame'),
      paragraph: withSizing('paragraph'),
      heading: withSizing('heading')
    }
  };
}
