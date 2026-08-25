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
    maxWidth: { type: 'number' as const, required: false },
    /**
     * What this node says **differently at a narrower width** — and only what differs.
     *
     * `{ mobile: { layoutMode: 'column' } }`: at 390 the row stacks, and every other thing about it
     * is still the page's own answer. Not a second document per width, which is the difference
     * between a site builder and three copies of a page that drift apart (`responsive.ts`).
     *
     * A map, where `componentBind` refused one — because the difference is checkable. A binding
     * names an attribute of a part it is *not on* and nothing can verify that part declares it; an
     * override names attributes of **this** node, which the schema has right here. `overrideFaults`
     * makes that check and a test holds it.
     *
     * A child node instead would put non-text children at the front of a paragraph's content, and
     * every offset in the text stack counts from there. A responsive layout is not worth changing
     * what a paragraph contains.
     */
    overrides: { type: 'object' as const, required: false }
  };

  /**
   * A node that may state its own width.
   *
   * **Containers only**, and that is a narrowing rather than an omission. It was on `heading`,
   * `paragraph` and `textFrame` as well, and the conformance harness said what that cost: six
   * attributes declared and never read, because the renderer that would have to read them is
   * `office-text`'s and a site does not own it. A schema that offers a reader something nothing
   * draws is worse than one that offers less.
   *
   * And nothing is lost. A reader who wants a heading to hug its words puts it in a stack that hugs,
   * which is how every auto-layout tool works — text sizing is the *stack's* question, asked one
   * level up.
   */
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
        /** A page holds all of it too, and for the same reason — see `frame`. */
        content: 'variable* (block | scene | frame | collection)*',
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
      frame: {
        ...withSizing('frame'),
        /**
         * On a page, **everything in a stack is a block**.
         *
         * The office model separates two worlds and is right to: a canvas frame holds placed things,
         * a document frame holds prose, and `(scene | frame)* | block+` says *one or the other*. A
         * page is where that stops being true — the most ordinary section on a landing page is a
         * heading, a paragraph and a button, which is two blocks and a placement.
         *
         * Measured, and it is the sample that found it: the hero was refused with *Node at index 2 of
         * type `instance` is not allowed here*. So the branch becomes one alternation, which is the
         * honest statement for this product: a page has one kind of child, and the group a node
         * carries is about where else it can go.
         */
        content: '(block | scene | frame | collection)*'
      },
      picture: withSizing('picture'),

      /** A placement in the flow says what it does with the width, like any other block. */
      instance: withSizing('instance'),

      /**
       * A **dataset**: rows the page draws from, named so a list can point at it.
       *
       * A resource, which is where this schema puts "a definition referenced by id from the flow" —
       * beside the footnote bodies and the header definitions, and for the same reason: what a
       * product does with it is a layout decision, and that it is saved, undone and addressable is
       * not.
       *
       * Why the rows are an attribute rather than nodes is measured and written down in `data.ts`:
       * 500 rows would be 4,000 nodes that nothing ever selects or puts a caret in. The cost of
       * this choice is written there too — editing one cell rewrites the array — which is what
       * `kind: 'url'` is for.
       */
      dataset: {
        name: 'dataset',
        group: 'resource',
        atom: true,
        attrs: {
          /** What a list names. Durable: `forFile` strips sids, so a reference cannot be one. */
          name: { type: 'string' as const, required: true },
          /** What a reader calls it, when the name is not what they would say out loud. */
          label: { type: 'string' as const, required: false },
          kind: { type: 'string' as const, default: 'inline', options: ['inline', 'url'] },
          /** Where the rows come from when they are not in the document. */
          url: { type: 'string' as const, required: false },
          /**
           * The columns. Declared, not inferred from the first row — a panel has to offer the
           * fields before there is a row on screen, and a misspelt `field:` is then a fault a
           * reader can be told about rather than a card that silently draws nothing.
           */
          fields: { type: 'array' as const, required: false },
          /** The rows themselves, for a dataset a person curates. */
          records: { type: 'array' as const, required: false }
        }
      },

      /**
       * A **collection**: one design, drawn once per row.
       *
       * A stack that holds exactly one placement. Everything about how the rows are arranged is a
       * stack's — `layoutMode`, `gap`, `padding`, `columns` — because a product grid *is* a grid of
       * cards and inventing a second arrangement vocabulary for it would be two ways to say one
       * thing.
       *
       * `content: 'instance'` and not `block`, and that is the design rather than a restriction:
       * a thing drawn forty times has to be **one definition**, or forty copies drift. It is the
       * same answer the deck gives for a card and Word gives for a style.
       */
      collection: {
        name: 'collection',
        group: 'block',
        content: 'instance',
        attrs: {
          ...(nodes.frame?.attrs ?? {}),
          ...sizingAttrs,
          /** The dataset this draws. */
          source: { type: 'string' as const, required: true },
          /** At most this many rows — "the three featured products". */
          limit: { type: 'number' as const, required: false },
          /** Which column orders them, and which way. */
          sortBy: { type: 'string' as const, required: false },
          sortDir: { type: 'string' as const, default: 'asc', options: ['asc', 'desc'] },
          /**
           * The one filter a landing page actually asks for: this column equals this value.
           *
           * Two attributes rather than an expression, because an expression is a language — with a
           * parser, an error message and a syntax a reader has to learn — and every site builder
           * that started with one arrived at a row of pickers anyway.
           */
          where: { type: 'string' as const, required: false },
          equals: { type: 'string' as const, required: false }
        }
      },
    }
  };
}
