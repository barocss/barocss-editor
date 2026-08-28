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
  const everyBlockAttrs = {
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
    overrides: { type: 'object' as const, required: false },
    /**
     * What this node says **while a pointer is on it**, or while the keyboard is in it.
     *
     * `{ hover: { fill: 'var:강조' } }`, and the same rule as `overrides`: only what differs, checked
     * against the attributes this node declares, one level deep.
     *
     * It sits beside `overrides` because it is the same shape, and it is a **different kind of
     * value** for a reason worth knowing here rather than only in `states.ts`: a width is resolved
     * before the page is drawn, and a pointer never is. There is no moment at which a document can
     * be resolved "as hovered" — the hovering is the visitor's, and it happens after the drawing is
     * finished. So this is the first thing on a page that is published as a **rule** rather than
     * folded into the drawing, and the export grows a `:hover` selector for it.
     *
     * Paint only, and that is arithmetic rather than taste: a state that changed the arrangement
     * would move the block out from under the pointer, at which point the pointer is no longer on
     * it, and the browser draws the two states alternately for as long as the visitor holds still.
     * `STATEABLE` is the list and `stateFaults` is the check.
     */
    states: { type: 'object' as const, required: false },
    /**
     * **How long** this block takes to get from what it says to what a state says, in milliseconds.
     *
     * The pairing every design system has and this one had no word for. A hover that arrives
     * instantly reads as a bug on anything larger than a link: the eye sees a *replacement* rather
     * than a change, and cannot tell what caused it.
     *
     * One number and not a per-state one. A block has one way of answering the pointer — the enter
     * and the leave are the same gesture read in two directions, and a block that faded in over
     * 200ms and out over 40 would be a block that behaved differently depending on where the pointer
     * had come from. Every system that offers two ends up with one of them wrong somewhere.
     *
     * Unset is **not zero**: unset means this block was never told, and a block nobody told answers
     * instantly, which is what it did before this existed. Zero is a reader saying *instantly*, on
     * purpose, and the two are the same drawing and different documents (`setBlockFormat` can reach
     * both, because a number field can be emptied).
     *
     * It is on the node rather than inside `states` because it is not a value a state *changes* —
     * it is a fact about the block that the state rules are written against. `STATEABLE` says what
     * a state may say, and this is not one of them.
     */
    transitionMs: { type: 'number' as const, required: false },
    /**
     * How this block **arrives as a visitor scrolls to it**.
     *
     * The single largest difference between a page built here and a page built anywhere else: this
     * product could answer the pointer and had nothing at all to say about arriving.
     *
     * ## Why it is a name and not a description
     *
     * Five names the deck already uses — `rise`, `slideIn`, `pop`, `focusIn`, `appearSlowly` — which
     * is the paint decision again: the deck arrived at this vocabulary first, and a second product
     * spelling the same idea differently is the fault this repository keeps finding. A reader who has
     * learned 부드럽게 올라오기 on a slide has learned it on a page.
     *
     * What is *not* shared is the arithmetic, and that difference is the interesting one. A slide's
     * motion is a **timeline**: a step of a given duration, played when the slide arrives. A page has
     * no timeline and no arrival — a visitor scrolls, and how far they have scrolled is the only
     * clock there is. So the deck's `duration` and `easing` have no meaning here and are not carried
     * over: the same five names, resolved against a different instrument.
     *
     * ## Why five and not fourteen
     *
     * The deck's other nine either need a script (`typewriter`, `letterByLetter`, `wordByWord` are
     * per-glyph) or say something a scroll cannot (`springIn` rings over its own settling time, which
     * a scroll position has no way to advance). A name a page could not honour would be a name a
     * reader picks once and never trusts again.
     */
    reveal: {
      type: 'string' as const,
      required: false,
      options: ['rise', 'slideIn', 'pop', 'focusIn', 'appearSlowly']
    },
    /**
     * Whether the arrival belongs to **what is inside** rather than to the block itself.
     *
     * A row of three cards that all appear at the same instant is the tell of a template, and every
     * landing page staggers them. The fix cannot be an animation on the row — a scroll animation on a
     * parent moves the whole thing — so a container carrying this gives its `reveal` to its children,
     * each starting a little further along the scroll, and does not animate itself.
     *
     * Beside `reveal` rather than a second kind of reveal, because it is a different question: *what*
     * the arrival is, and *whose* it is. A block either arrives, or what is in it does.
     */
    revealStagger: { type: 'boolean' as const, required: false },
    /**
     * Whether this block is **on the page** — and whether a reader can pick it up.
     *
     * The office schema has both, on `CANVAS_PRESENCE_ATTRS`, for things placed on a canvas. A page
     * places nothing and needed them anyway, which is the same finding `sizing` produced from the
     * other side: the two worlds share more than the shape of a coordinate.
     *
     * ## Why hiding is worth a schema field
     *
     * It is the commonest reason anybody opens a layer list. A reader drafting a section wants it off
     * the page for a week, and without this the only move available is **delete it and undo later** —
     * which is not a move, it is a thing they will get wrong once and never try again.
     *
     * A hidden block is drawn `display: none` in the editor and is **removed** from the exported
     * page. Those differ on purpose: the editor still lists it in 구성 and still shows its properties,
     * because a block a reader cannot get back to is a block they have lost; a visitor should not
     * receive the words of a draft at all, which `display: none` would still ship.
     *
     * ## Why locking is the cheaper half
     *
     * Nothing about the drawing changes — only what the overlay will hand back when a reader presses.
     * Which is what makes a full-width background picture editable: today the only way past one is to
     * find something on top of it and walk up.
     */
    visible: { type: 'boolean' as const, required: false, default: true },
    locked: { type: 'boolean' as const, required: false, default: false }
  };

  /**
   * What a box on a page is **painted** with, beyond a flat colour.
   *
   * ## Why these names and not new ones
   *
   * They are the deck's, exactly: `gradientFrom`, `gradientTo`, `gradientAngle`, `gradientKind`,
   * `shadowColor`, `shadowBlur`, `shadowDistance`, `shadowAngle`, and the four corners. The deck
   * arrived at them first and wrote down why they are flat attributes rather than one string — *a
   * mini-language is a parser, and every parser is a place to disagree about a document* — and a
   * second product spelling the same idea differently is the fault this repository keeps finding in
   * itself, one word later.
   *
   * ## Why they are declared here rather than shared
   *
   * Because they are **read** here. The deck's `paints.ts` turns these into CSS for an absolutely
   * placed box, with a gradient axis computed against a known width and height; a page's box has
   * neither until the browser has laid it out, so it hands the browser a CSS gradient and lets it
   * do the geometry. Same vocabulary, different arithmetic — and `office-site` must not import
   * `office-slides`, because two products depending on each other is how a shared layer stops
   * being one.
   *
   * That makes this the **second** declaration of these names. Two is a coincidence, three is a
   * component nobody wrote — so the day Word wants a gradient on a canvas frame, this moves to the
   * canvas layer and both products read it from there. That is on the record in `BACKLOG.md`.
   *
   * ## What is deliberately absent
   *
   * The **stack**: the deck's `fills` and `effects`, where a photograph tinted by a translucent
   * colour is two fills and a card with a soft shadow and a hard key line is two effects. One of
   * each here, because one of each is what a section, a card and a button want, and the flat
   * attributes were the deck's answer for exactly that long. A page that needs two takes `fills`
   * rather than growing a `gradientFrom2`.
   */
  const paintAttrs = {
    /**
     * The flat colour under everything else.
     *
     * A `frame` has had one since the canvas did; a **page** had not, and a page whose sections can
     * hold a colour while the page behind them cannot is a page with a white band under everything
     * shorter than the window. It is the same attribute, declared where it was missing.
     */
    fill: { type: 'string' as const, required: false },
    /**
     * A gradient, as its two ends and an angle.
     *
     * The angle is CSS's: 0 points up, 90 to the right. Stated because the deck's is measured the
     * same way and a reader moving between them must not have to find out.
     */
    gradientFrom: { type: 'string' as const, required: false },
    gradientTo: { type: 'string' as const, required: false },
    gradientAngle: { type: 'number' as const, required: false },
    gradientKind: { type: 'string' as const, default: 'linear', options: ['linear', 'radial'] },

    /**
     * A picture **behind** what is in the box.
     *
     * The flat form of the deck's image paint, and the one thing a landing page cannot be built
     * without: a hero is words over a photograph, and until now the only picture a page could draw
     * was a `picture` node in the flow, which pushes the words off it.
     *
     * `tile` is here because a texture is the other half of what a background image is for, and it
     * is one CSS word away.
     */
    backgroundImage: { type: 'string' as const, required: false },
    backgroundFit: { type: 'string' as const, default: 'cover', options: ['cover', 'contain', 'tile'] },
    /**
     * And how much of it comes through, so words can be read over it.
     *
     * A separate value from the node's `opacity`, which fades *everything* — the picture and the
     * words on it. A hero with a photograph at 40% and white text at 100% is the ordinary case and
     * one number cannot say it.
     */
    backgroundOpacity: { type: 'number' as const, required: false, min: 0, max: 1 },

    /** A shadow, as a colour, a softness and where the light is. */
    shadowColor: { type: 'string' as const, required: false },
    shadowBlur: { type: 'number' as const, required: false },
    shadowDistance: { type: 'number' as const, required: false },
    shadowAngle: { type: 'number' as const, required: false },

    /** And the four corners, for the boxes that round only two of them. */
    cornerTopLeft: { type: 'number' as const, required: false },
    cornerTopRight: { type: 'number' as const, required: false },
    cornerBottomRight: { type: 'number' as const, required: false },
    cornerBottomLeft: { type: 'number' as const, required: false }
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
  const withBlockAttrs = (name: string) => ({
    ...nodes[name],
    attrs: { ...nodes[name]?.attrs, ...everyBlockAttrs }
  });

  /**
   * What only a **container** can say, which is what part of the page it is.
   *
   * Narrowed rather than exempted, which is the rule this schema already follows about `sizing`: an
   * `<img>` cannot be a header, so declaring `landmark` on `picture` would be offering a reader
   * something nothing can draw. `frame`, `collection` and `instance` are the three things on a page
   * that hold other things — and the third matters most, because the sample's header **is** a
   * placement of a definition.
   */
  const landmarkAttrs = {
    /**
     * **What part of the page this is** — and so which element it is published as.
     *
     * ## Measured on the sample's own published home page
     *
     * The export gets a great deal right — `lang`, a `<title>`, a viewport, **no script at all** and
     * **not one inline style** — and every structural element on it was a `<div>`. The tags it used
     * were `div, section, p, h1…h4, a, img, span, blockquote`, and nothing said which of forty divs
     * was the page's header, its navigation, its body or its footer.
     *
     * The document *knows*: the sample places a `site-header` and a `site-footer` on every page and
     * the four links in the bar are a navigation. Nothing had a word for it, so nothing was said —
     * the shape of finding this repository keeps making, arriving at the one surface where being
     * unsaid costs a **visitor** rather than a reader. A screen reader jumps between landmarks, a
     * search engine reads `<main>`, and a browser's reader mode looks for the page's body.
     *
     * ## Why on the block and not inferred
     *
     * The header is a *placement of a definition*, and inferring "this component id means header"
     * would be a rule about a name a reader may change at any time.
     */
    landmark: {
      type: 'string' as const,
      required: false,
      options: ['header', 'nav', 'main', 'aside', 'footer']
    }
  };

  /** A container, which on a page is also a surface somebody paints. */
  const withPaint = (name: string) => ({
    ...withBlockAttrs(name),
    attrs: { ...withBlockAttrs(name).attrs, ...paintAttrs, ...landmarkAttrs }
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
          /*
           * A page is painted like any other box on it. A site whose sections can hold a gradient
           * and whose *page* cannot is a site with a white band under every short page.
           */
          ...paintAttrs,
          /**
           * Where the page answers: `/`, `/about`, `/blog/first-post`.
           *
           * Not derived from the name. Two pages may be called 소개 and one of them may be the
           * landing page; an address is what a site *is*, and a name is what a reader calls it.
           */
          path: { type: 'string' as const, required: false },
          /**
           * The **sentence a page is found by**, and the one it is shared with.
           *
           * Measured on the sample's published home page: it has a `lang`, a `<title>`, a viewport
           * and no script — and no `description` and no Open Graph at all. So a search result shows
           * whatever the engine can scrape from the first paragraph, and a page pasted into a chat
           * unfurls as a bare address.
           *
           * The page already carries a **name** and an **address** and says neither to anything but
           * a browser tab. This is the third thing a page is, and the only one a reader has to write
           * rather than being able to derive: a title is what it is called, an address is where it
           * answers, and a description is what it is *about*.
           *
           * Not derived from the first paragraph, deliberately. Every builder that guesses one gets
           * it wrong on the page it matters most — a hero whose first words are 무료로 시작하기 — and
           * a guess a reader cannot see is a guess they cannot correct.
           */
          description: { type: 'string' as const, required: false }
        }
      },

      /** A stack, and everything it may say about the space it takes. */
      frame: {
        ...withPaint('frame'),
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
      picture: withBlockAttrs('picture'),

      /** A placement in the flow says what it does with the width, like any other block. */
      instance: { ...withBlockAttrs('instance'), attrs: { ...withBlockAttrs('instance').attrs, ...landmarkAttrs } },

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
          ...everyBlockAttrs,
          ...paintAttrs,
          ...landmarkAttrs,
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
