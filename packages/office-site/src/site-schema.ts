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
import { BLENDS } from './paint';
import { POSITIONS } from './position';
import { ASPECTS } from './aspect';
import { FACES, SCALES } from './type-scale';

const FACE_IDS = FACES.map((one) => one.id);
const SCALE_IDS = SCALES.map((one) => one.id);
import { FIELDS } from './form';

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
     * And how **tall**, which this schema had no way to say at all — see `sizing.ts` for the five
     * blocks that turned out to need it and for why it is a pair rather than a stated `height`.
     */
    minHeight: { type: 'number' as const, required: false },
    maxHeight: { type: 'number' as const, required: false },
    /**
     * **Where this block is**, when it is not simply the next thing in the column.
     *
     * `sticky` — in the flow until the page scrolls past it, then held at an edge. `absolute` — out
     * of the flow, placed against the stack it is in. Silence is the column, which is what every page
     * in this document already is and why adding this moved nothing.
     *
     * `fixed` is deliberately not one of them; `position.ts` has the argument, and it is about a
     * phone rather than about purity.
     */
    position: { type: 'string' as const, required: false, options: [...POSITIONS] },
    /**
     * How far in from each edge, in twips — and **negative is allowed**, which is the point.
     *
     * The schema's other lengths are sizes, where a negative number is nonsense. These are offsets:
     * `insetTop: -240` is what lifts a card into the band above it, and overlap is most of what
     * stops a page looking like a stack of rectangles.
     */
    insetTop: { type: 'number' as const, required: false },
    insetRight: { type: 'number' as const, required: false },
    insetBottom: { type: 'number' as const, required: false },
    insetLeft: { type: 'number' as const, required: false },
    /**
     * And what is **over** what, which a column never had to answer and an overlap always does.
     *
     * Read even for a block in the flow: a header that scrolls under a hero picture is this one
     * number, and it is a sticky block rather than a placed one.
     */
    zOrder: { type: 'number' as const, required: false },
    /**
     * **How many columns of a grid this block takes** — see `sizing.ts` for why a grid needed it.
     *
     * On every block rather than on grid children only, because the schema has no way to say "only
     * inside a grid" and a reader who moves a card out of one has not made an error. It draws
     * nothing outside a grid, which is the honest behaviour of `grid-column` itself.
     */
    span: { type: 'number' as const, required: false, min: 1, max: 12 },
    /**
     * **Centred in whatever holds it**, which is half of the commonest layout on the web and the
     * half this schema had no word for: a band the width of the window, and a column of reading
     * measure in the middle of it.
     *
     * A separate decision from `maxWidth`, and finding that out cost a wrong version: a cap says
     * *how wide*, this says *where*, and inferring the second from the first put every heading on
     * the sample into the middle of the page.
     */
    centred: { type: 'boolean' as const, required: false },
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
     * Paint only for a **held** state, and that is arithmetic rather than taste: a state that changed
     * the arrangement would move the block out from under the pointer, at which point the pointer is
     * no longer on it, and the browser draws the two states alternately for as long as the visitor
     * holds still. `STATEABLE` is that list and `stateFaults` is the check.
     *
     * `open` is the exception, and the exception is the point of it: being open is **remembered**
     * rather than held, so nothing alternates, and a menu that appears is what a visitor pressed for.
     * `OPENABLE` adds `visible`, `layoutMode` and `gap` — see `states.ts`.
     */
    states: { type: 'object' as const, required: false },
    /**
     * **What this block opens**, which is the half of `open` that is a gesture rather than a design.
     *
     * A hamburger is a block that says `opens: '메뉴'`; the menu is a block whose `partId` is 메뉴 and
     * whose `states.open` says it is visible. Pressing the first changes the second, and the
     * published page does it with a checkbox rather than with a script — see `openSwitches` in
     * `export-html.ts`.
     *
     * A **`partId`** and not a sid, which is `componentBind`'s rule and for `componentBind`'s reason:
     * a sid is given out when a document is loaded, so nothing that is *written down* can hold one —
     * not a component in a library, not this product's own sample, not a page pasted in from another
     * document. `setOpens` mints the name when the block being opened has none.
     *
     * Resolved inside the page or the definition the opener is in, which is the scope a `partId` is
     * unique within. Every placement then opens **its own** copy for nothing: the export stamps
     * `owner~part` on each element, so the same name is a different element in each placement, and
     * two navigation bars each open their own menu without anything being told there are two.
     *
     * The two are the same block in the simple case — a box that opens itself — and `opens: 'self'`
     * says so.
     */
    opens: { type: 'string' as const, required: false },
    /**
     * **Where this block goes when it is pressed** — `opens`'s sibling, and the half that was missing.
     *
     * ## The finding
     *
     * This schema says, in the sample, that there is no button node and does not need to be: *a
     * button is a stack with a colour, a padding and words in it*. Which is true of how a button
     * **looks** and says nothing about what it **is**, and the sample proved the gap by wearing it.
     * Seven `무료로 시작하기` buttons across five pages, drawn perfectly — the accent fill, the pill
     * radius, a `:hover` that darkens, a `:focus-visible` ring — and every one of them published as
     * `<div><p><span>무료로 시작하기</span></p></div>`.
     *
     * So: not in the tab order, not announced as anything but a paragraph of text, and the focus ring
     * the document carefully declared could never fire, because a `<div>` does not receive focus. The
     * primary call to action on every page of this site was unreachable without a mouse, and every
     * check this product has passed.
     *
     * ## Why an attribute and not a link mark
     *
     * A mark covers **words**. A button is a box: its padding, its fill and its corner are the target
     * a visitor aims at, and a link mark around the label makes the words clickable and the box not —
     * which is the eight-pixel target every builder that does it this way ships.
     *
     * `opens` had already settled this shape for the other gesture a block can be. That one publishes
     * a hidden checkbox and a `<label>` wrapper; this one publishes an `<a href>` wrapper, both with
     * `display: contents` so the layout is untouched, and both giving the block a real control a Tab
     * key reaches and a screen reader names. See `pressables` in `export-html.ts`.
     *
     * ## What it may hold
     *
     * Exactly what a link mark's `href` holds, resolved by the same `hrefFor`:
     *
     * | written | goes to |
     * |---|---|
     * | `page:소개` | a page of this site, following it through a rename |
     * | `https://…` | somewhere else, and `barocss.com` is normalised into one |
     * | `#main` | this page's own body, past the navigation, with the smooth scroll the export ships |
     * | `mailto:` `tel:` | the visitor's own mail or phone |
     * | `/가격` | a path this site does not own a page for — a hand-written route |
     *
     * A fragment is deliberately the thin row: `#main` is the **only** spot a page currently names,
     * because the export writes exactly one id (`main`, for the skip link) and a block has no way to
     * say it is somewhere a link may aim at. Written down in `site-builder.md` rather than claimed
     * here — a table row promising `#요금` would be this comment lying about the product, which is
     * what it was doing until somebody exported the page and looked.
     *
     * A `page:` pointing at a page that is gone publishes an `<a>` with **no** `href`, which is the
     * one shape a browser draws as *not a link* — and `linkFaults` reports it, because a reference
     * that resolves to nothing is the fault this document model already has five other kinds of.
     */
    goes: { type: 'string' as const, required: false },
    /**
     * **Whether this block is open when the page loads.**
     *
     * On the *opener*, beside `opens`, because it is a fact about the gesture rather than about the
     * block that appears: a tab strip is three openers of which exactly one has already been pressed.
     *
     * A tab strip needs it — a tab strip with nothing chosen shows nothing and is not a tab strip —
     * and an accordion may want it, since a FAQ whose first answer is already open is an ordinary
     * design. Silence means closed, which is what a menu and a 더보기 mean.
     */
    openAtRest: { type: 'boolean' as const, required: false },
    /**
     * **Whether only one thing inside this block may be open at a time.**
     *
     * On the *container*, and that is the only place it can be: it is a fact about a set. A tab strip
     * says yes and is the reason this exists — pressing the second tab has to close the first, and
     * nothing about either tab on its own can say that. An accordion says yes when its author wants
     * one answer at a time and nothing when they do not.
     *
     * What it becomes is the difference between a **checkbox** and a **radio**, which is the browser's
     * own answer to *one of these* and has been since 1993. The openers inside get radios sharing a
     * name, so choosing one unchecks the rest and every panel but one falls back to what it says at
     * rest — no rule, no script, and nothing to keep in step.
     *
     * The one behaviour that comes with it and is not a choice: a radio cannot be unchecked by
     * pressing it again. So the last-opened panel in a `opensOne` group stays open, which is what a
     * tab strip wants and what an accordion's author is agreeing to.
     */
    opensOne: { type: 'boolean' as const, required: false },
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
     * And the colour of **what is on it**, which is the other half of the same decision.
     *
     * Found by measuring contrast on the built page rather than by reading the schema: the closing
     * band of the sample sets a near-black gradient and the heading on it came out at 1.06:1, dark
     * on dark, unreadable in both themes. The paragraph beside it was fine only because its author
     * had reached for a **text colour on the run** — which is the workaround, and the evidence that
     * the attribute was missing. A band that flips the ground has to say what is written on it once,
     * not once per run, or every block added to it later inherits the wrong colour and the person
     * who added it has to remember.
     *
     * Inherited, so it reaches everything in the box: a section states it and the headings,
     * paragraphs, list markers and quiet text inside all take it, while any run that states its own
     * still wins. That is what makes it one decision rather than a colour to reapply.
     */
    ink: { type: 'string' as const, required: false },
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
    /**
     * **A sheet over all of it**, so words can be read on a photograph.
     *
     * The layer that was missing rather than a second way to say `backgroundOpacity`: that one fades
     * the picture toward the box's own ground, and a hero usually wants a *chosen* colour on top —
     * the ink, at a quarter, so white words read and the photograph is still a photograph. See
     * `backgroundCss` for why a gradient could not do it.
     */
    overlay: { type: 'string' as const, required: false },
    overlayOpacity: { type: 'number' as const, required: false, min: 0, max: 1 },

    /** A shadow, as a colour, a softness and where the light is. */
    shadowColor: { type: 'string' as const, required: false },
    shadowBlur: { type: 'number' as const, required: false },
    shadowDistance: { type: 'number' as const, required: false },
    shadowAngle: { type: 'number' as const, required: false },

    /**
     * **How much of the box comes through at all.**
     *
     * Declared here, which it had not been: `paintCss` has read it since the day it was written and
     * the panel has offered a row for it, so the row wrote an attribute the schema did not declare
     * and the validator threw the whole transaction away. A control that lights up and changes
     * nothing — the exact thing the harness exists to catch, in the one direction it does not look.
     * The check asks whether every declared attribute is *read*; nothing asked whether every
     * attribute a renderer reads is *declared*.
     */
    opacity: { type: 'number' as const, required: false, min: 0, max: 1 },

    /**
     * **The deliberate disruption**, in degrees.
     *
     * A page of upright rectangles reads as a template whatever is in them. One card at 3° is the
     * cheapest sentence a layout can say about having been arranged by a person, and it is the one
     * move the editorial vocabulary this sample is designed against asks for by name.
     */
    rotate: { type: 'number' as const, required: false },

    /**
     * **How this box mixes with what is under it.** `multiply` is what a second ink does on paper.
     *
     * Four modes and no more — see `effectsCss` for why a list of sixteen would be a list nobody
     * can predict.
     */
    blend: { type: 'string' as const, required: false, options: [...BLENDS] },

    /** **Frosted glass**, in twips. Only visible through a translucent fill, which the panel says. */
    backdropBlur: { type: 'number' as const, required: false },

    /**
     * **The rhythm the words in this box are set at**, as percentages of their own size.
     *
     * `letterSpacing: -2.5` is `-0.025em`; `lineHeight: 140` is `1.4`. Percentages rather than twips
     * because both mean a ratio to the font's size: tracking written as a length is right at one
     * breakpoint and wrong at the next. Inherited, like `ink` and for `ink`'s reason — a band states
     * it once and every block in it takes it.
     */
    letterSpacing: { type: 'number' as const, required: false },
    lineHeight: { type: 'number' as const, required: false },

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
       * The document, with the one thing a **site** has that a document does not: an address.
       *
       * ## Why the model wanted this at last
       *
       * Found writing the Open Graph tags. `og:url` and a `<link rel="canonical">` both need an
       * **absolute** address, and a document here knew its pages' paths and nothing about where the
       * site lives. So does a sitemap, and so would a feed.
       *
       * It is the first fact this model has wanted that is about **publishing** rather than about
       * the document — everything else here is what the pages *are*. It belongs on the document all
       * the same, for the reason a page's own address does: two people editing one site do not
       * publish it to two places, and a thing kept beside the document instead of in it is a thing
       * that goes missing the first time the file is opened somewhere else.
       *
       * ## Silence is not a guess
       *
       * A site that has not said gets no `og:url`, no canonical and no sitemap — rather than a
       * relative address, which Open Graph does not accept and a crawler reads as nothing. Which is
       * the same rule the description follows one level down: written only when a reader wrote it.
       */
      document: {
        ...(office.nodes as Record<string, any>).document,
        attrs: {
          ...((office.nodes as Record<string, any>).document?.attrs ?? {}),
          address: { type: 'string' as const, required: false },
          /**
           * **What the site is set in** — see `type-scale.ts`.
           *
           * The document's, because a brand has one or two faces and one rhythm. Per-block type is
           * what a mark is for and this product has those; what was missing is the level above, and
           * it was missing completely: four heading sizes and a font stack were written into
           * `page-css.ts`, so every site this product made came out in the same type.
           */
          bodyFace: { type: 'string' as const, required: false, options: [...FACE_IDS] },
          headingFace: { type: 'string' as const, required: false, options: [...FACE_IDS] },
          /**
           * How large the words are, **in twips** — 16px unless a reader says.
           *
           * The document's unit and not the reader's, because the panel's `unit: 'px'` already means
           * *stored in twips* for every other length here, and the one attribute that disagreed was
           * silently ignored: 20 typed became 300 stored, 300 is outside the bounds, and the site
           * stayed at 16. `baseSizeOf` is the one place it becomes pixels.
           */
          baseSize: { type: 'number' as const, required: false },
          /** The ratio between one heading and the next; the steps are geometric. */
          scale: { type: 'string' as const, required: false, options: [...SCALE_IDS] },
          /**
           * **The picture in a browser tab**, as `asset:이름`.
           *
           * The cheapest thing that makes a published site look like a site rather than a file
           * somebody opened: without one, every tab shows the browser's blank page glyph, and a
           * reader with six tabs open cannot find theirs.
           *
           * A reference to a file the document holds, which is what made this possible at all — it
           * needed the asset work, and before that there was nowhere for the bytes to live.
           */
          icon: { type: 'string' as const, required: false },
          /**
           * **Whether search engines may index this site.**
           *
           * A `robots.txt` a site with no address cannot have — a `Sitemap:` line needs an absolute
           * one — and a switch that matters most in the state nobody tests: a staging copy of a site
           * that was published before it was ready and is now in a search result.
           *
           * Silence is *yes*, because a site somebody published is a site they meant to be found.
           */
          noIndex: { type: 'boolean' as const, required: false }
        }
      },

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
          description: { type: 'string' as const, required: false },
          /**
           * And the **picture** a shared link shows, which is the half of an unfurl anybody looks at.
           *
           * A title and a description with no image is two lines of grey text; every service that
           * draws a card gives the picture about nine tenths of it. It was the last thing missing
           * from the head and the cheapest to add.
           *
           * A page's rather than the site's, because the one page whose card matters most is a
           * *post*: a blog with one picture for every article is a blog nobody clicks twice. A site
           * that wants one image everywhere writes the same address on each page, which is a
           * repetition a reader can see, where a fallback would be a rule they could not.
           *
           * Absolute or relative — the export joins a relative one onto the site's address, because
           * Open Graph will not take one and a crawler has no page to resolve it against.
           */
          image: { type: 'string' as const, required: false },
          /**
           * **Whether this is the page a visitor gets when they type the address wrong.**
           *
           * A `404.html` beside the pages, which is the name every static host serves for a request
           * it cannot match — so it is a file rather than a route this product invents.
           *
           * A flag on a real page rather than a page called `/404`, because a page in the list is a
           * page that appears in navigation and in the sitemap, and a 404 is neither. The page keeps
           * its own address and gains a second one.
           */
          notFound: { type: 'boolean' as const, required: false },
          /**
           * And **whether a crawler should skip it** — the page's half of what `robots.txt` says
           * about the site. A thank-you page is a page nobody should arrive at from a search result,
           * and `robots.txt` has no way to say so about one page.
           */
          noIndex: { type: 'boolean' as const, required: false }
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
      /**
       * A picture, and **the shape it keeps** whatever width it is given.
       *
       * `minHeight` answered a divider and a banner and does not answer this: a picture that must
       * stay 16:9 in a column that is 1200 wide on a laptop and 350 on a phone needs a *ratio*, not a
       * height — and stating a height instead is how a hero picture ends up letterboxed on one width
       * and cropped on the other.
       *
       * The pair `aspect` and `fit` is the whole of it and they are two questions: what shape the box
       * is, and what the picture does inside a box that is not its own shape. A reader who states an
       * aspect almost always wants `cover` with it, which is a **crop** — so the two are next to each
       * other in the panel rather than in different groups.
       *
       * Silence is the file's own shape, which is what `width` and `height` on the element already
       * reserve — see `assets.ts`. So adding this moved nothing.
       */
      picture: {
        ...withBlockAttrs('picture'),
        attrs: {
          ...withBlockAttrs('picture').attrs,
          aspect: { type: 'string' as const, required: false, options: [...ASPECTS] },
          /**
           * **Whether to wait until it is needed.**
           *
           * `loading="lazy"` on a picture above the fold delays the one image a visitor is waiting
           * for — which is why this is the reader's decision rather than a rule the product applies
           * to everything but the first picture it happens to draw. A hero says no; a photograph
           * eight sections down says yes, and there is nothing but the design that knows which.
           */
          defer: { type: 'boolean' as const, required: false }
        }
      },

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
           * **Fetched again in the visitor's browser**, not only when a reader presses 새로 가져오기.
           *
           * The deliberate second mode, and it is off by default because it costs the thing this
           * product's export is unusual for: a page whose list is live ships a script, and what a
           * crawler reads is the rows as they were when the site was published. That is the right
           * trade for a price that changes hourly and the wrong one for a list of five services.
           *
           * Only means anything with `kind: 'url'` — there is nothing to go and get otherwise.
           */
          live: { type: 'boolean' as const, default: false },
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

      /**
       * A **form**: the one block on an ordinary site with nothing in this model behind it.
       *
       * ## Why this is the only genuinely new thing here
       *
       * Every other node a page needed was already in the office schema or was a stack wearing a
       * different name. A form is neither. It is the first block whose point is not what it *looks*
       * like but what happens **after** a visitor has used it — and this product had a page that
       * could say anything about how it is drawn and nothing at all about where a message goes.
       *
       * ## A stack that submits
       *
       * `content: '(block | frame | field)*'`, so a form holds whatever a section holds and fields
       * as well: a heading, a paragraph, three fields and a button is what a contact form is, and a
       * form that could only hold fields would have been a form nobody could design.
       *
       * It carries a stack's whole vocabulary — `layoutMode`, `gap`, `padding`, paint — for the same
       * reason a collection does: a form *is* a column of things, and inventing a second arrangement
       * vocabulary for it would be two ways to say one thing.
       *
       * ## `action`, and what it means to leave it empty
       *
       * Where the answers go — an address a service gives you. There is deliberately **no default**
       * and no built-in destination: a builder that quietly posted a visitor's message to its own
       * server would be doing something a reader did not ask for with a stranger's data.
       *
       * A form with no `action` is a form that goes nowhere, and `documentFaults` says so — it is
       * exactly the kind of fault the screen cannot show, because a form with no destination looks
       * identical to one that works right up until somebody sends a message into nothing.
       */
      form: {
        name: 'form',
        group: 'block',
        /**
         * Everything a section holds, **and fields, and not another form**.
         *
         * Written out rather than as `block*`, because `form` is itself a block and a form inside a
         * form is the one arrangement a browser will not keep: the HTML parser moves the inner one
         * out and leaves an empty `<form>` behind, so what is in the document stops being what is on
         * the page. `every-drawing-keeps-its-children` said so the minute this node existed, which is
         * the check earning its place — nothing errors and the page may even look right.
         */
        content:
          '(heading | paragraph | list | blockQuote | horizontalRule | codeBlock | picture | instance | collection | frame | field)*',
        attrs: {
          ...(nodes.frame?.attrs ?? {}),
          ...everyBlockAttrs,
          ...paintAttrs,
          /**
           * **Which connection the answers go through** — by name, never by address.
           *
           * The address itself lives on a `service` in `resources`, and this is the fourth reference
           * of the shape this schema uses everywhere: `var:이름` for a colour, `componentId` for a
           * card, a dataset's `name` for rows, and now this. The argument is the same one each time
           * and it is not tidiness — a site with five forms had five copies of one address, so
           * changing services meant finding all five, and the one that was missed goes on posting to
           * an endpoint nobody is reading.
           *
           * A `sends` naming a connection that is not there is a fault the panel reports, exactly
           * like a link to a page that was deleted: the form draws perfectly and goes nowhere.
           */
          sends: { type: 'string' as const, required: false },
          /**
           * **Where the visitor lands after sending** — a page of this site, as `page:id`.
           *
           * The fifth use of the reference shape after `var:이름`, `componentId`, a dataset's `name`
           * and a link's page, and for the same reason each time: an address changes and an id does
           * not, so a 감사합니다 page a reader later moves takes its thank-you with it.
           *
           * It becomes a hidden field named by the connection — see `service.returnField` — and needs
           * the site's own address to be absolute, which is the rule `og:url` and `og:image` already
           * follow. A site that has not said where it lives publishes no return at all rather than a
           * relative one the service cannot use.
           */
          thanks: { type: 'string' as const, required: false }
        }
      },

      /**
       * An **asset**: a file the site is made of, kept in the document.
       *
       * ## The gap this closes, which was the largest one left
       *
       * A `picture` carried a `src` string and nothing anywhere could put a **file** in one. The
       * sample got away with it by drawing its art as SVG data URIs, which is a thing a product's
       * author can do and a reader cannot: adding a photograph was not possible at all, and it is the
       * second most common thing anybody does on a page after writing on it.
       *
       * ## Why the bytes are in the document
       *
       * A site here is one file that a reader owns — that is the promise the whole export makes, and
       * an image kept somewhere else would break it in the worst way: a document that draws correctly
       * on the machine that made it and shows broken images everywhere else. `forFile` already
       * strips sids so a `.baro` travels; the pictures have to travel with it.
       *
       * The cost is real and is stated rather than hidden: base64 is a third larger than the file,
       * and a document with twenty photographs in it is a large document. `assetFaults` says so at
       * the point it starts to matter, and the export writes each one **once** as its own file rather
       * than inlining it into every page that draws it.
       *
       * ## And why a name rather than a sid
       *
       * The sixth reference of the shape this schema uses everywhere — `var:이름`, `componentId`, a
       * dataset's `name`, a link's `page:id`, a form's `sends`. A `src` of `asset:로고` survives a
       * copy between documents, a `forFile`, and a reader renaming nothing.
       */
      asset: {
        name: 'asset',
        group: 'resource',
        atom: true,
        attrs: {
          /** What a picture names. Durable: `forFile` strips sids, so a reference is never one. */
          name: { type: 'string' as const, required: true },
          /** What the file was called when it arrived, which is what a reader recognises it by. */
          label: { type: 'string' as const, required: false },
          /** Its media type — `image/png`. What the export writes the file's extension from. */
          type: { type: 'string' as const, required: true },
          /** The bytes, base64 and without a `data:` prefix — the prefix is `type` said twice. */
          data: { type: 'string' as const, required: true },
          /**
           * How big it is, in **pixels of the file itself** — not twips, and not a size to draw at.
           *
           * A picture states how wide it is drawn like any other block. This is the file's own shape,
           * which is what an `<img>` needs to reserve the right space before it has loaded: without
           * it every image on the page pushes the text under it down as it arrives, which is the
           * layout shift every performance guide measures and no builder that stores only a URL can
           * fix.
           */
          width: { type: 'number' as const, required: false },
          height: { type: 'number' as const, required: false },
          /**
           * **The same picture, smaller** — one entry per rendition, narrowest first.
           *
           * The single largest cost of a page anybody builds with a tool like this is a photograph
           * taken at 4000 pixels and sent, whole, to a phone that is 390 wide. It is not a small
           * effect: it is most of what a page weighs, and no amount of CSS makes the download shorter.
           *
           * A browser has had the answer since 2014 and needs to be handed the sizes: `srcset` lets
           * it choose, knowing the screen and the connection, which is a decision this product cannot
           * make and should not try to. So the renditions are made when the file arrives — the app
           * has a canvas, which is the same line it draws about reading the file at all — and the
           * export writes each as its own file.
           *
           * `[{ width, data }]` rather than a second asset per size, because they are **one picture**:
           * a reader renaming it, replacing it or deleting it means all of them, and two nodes would
           * be two things to keep in step.
           */
          sizes: { type: 'array' as const, required: false }
        }
      },

      /**
       * A **connection**: a place answers go, with a name on it.
       *
       * ## Why this is a resource and not an attribute
       *
       * A form used to carry the address itself, and a site with five forms carried five copies of
       * it. Changing services meant finding all five, and the one that was missed goes on posting to
       * an endpoint nobody reads — silently, because a form that posts somewhere wrong looks exactly
       * like a form that works.
       *
       * The same argument `var:이름`, `componentId` and a dataset's `name` each won: **a thing
       * referred to from several places is a thing with a name**, and the reference is the name
       * rather than the value.
       *
       * ## And why the product has no address of its own
       *
       * There is deliberately no default and no Barocss endpoint. A builder that quietly posted a
       * stranger's message to its own server would be doing something nobody asked for with somebody
       * else's data, and the reader would have no way to know. So a connection arrives **empty**, the
       * panel says so, and the address is one a reader got from a service they chose.
       *
       * The published page posts to it **directly** — a real `<form action method>` — so nothing of
       * this product's is between a visitor and the service, and the page keeps working when every
       * script on it fails.
       */
      service: {
        name: 'service',
        group: 'resource',
        atom: true,
        attrs: {
          /** What a form names. Durable: `forFile` strips sids, so a reference is never one. */
          name: { type: 'string' as const, required: true },
          /** What a reader calls it, when the name is not what they would say out loud. */
          label: { type: 'string' as const, required: false },
          /** The address a service gave them. Empty is a fault a reader is told about. */
          endpoint: { type: 'string' as const, required: false },
          /**
           * How the answers are sent. `post` for anything a person typed — a `get` puts a visitor's
           * message in the address bar, in their history and in every log between here and there.
           */
          method: { type: 'string' as const, default: 'post', options: ['post', 'get'] },
          /**
           * **What this service calls the field that brings a visitor back** — `_next`, usually.
           *
           * The worst thing about a form as it stood: a visitor presses 보내기 and **lands on a
           * stranger's page**. That is what a real `<form>` does — it navigates — and what the site's
           * own design, header and footer are replaced by.
           *
           * Every service of this kind solves it the same way, a hidden field naming where to return
           * to, and every one of them spells it differently: `_next`, `_redirect`, `_returnUrl`.
           * Which is exactly what a **connection** is for: it is a fact about the service, not about
           * the form, so a site with five forms says it once.
           *
           * Empty means the service has no such field, and a form that names a 감사 페이지 then
           * publishes nothing rather than a hidden input the service will ignore.
           */
          returnField: { type: 'string' as const, required: false },
          /**
           * And **what it calls the field that catches a bot** — `_gotcha`, usually.
           *
           * A hidden text input a person never sees and an automated form-filler fills in; the
           * service drops any message that has it filled. One name, one hidden input, no script, and
           * it removes most of the spam a public form collects.
           */
          trapField: { type: 'string' as const, required: false }
        }
      },

      /**
       * A **field**: one question a visitor answers.
       *
       * ## One node type, not five
       *
       * `kind` decides which control is drawn — a line, a paragraph, an address, a number, and the
       * button that sends it. Five node types would be five renderers, five inserts, five rows in
       * every list and one shared set of attributes, and the difference between them is genuinely
       * one word: `<input type>` is the same idea the HTML has had since the beginning.
       *
       * The **submit** is one of them, and that is the part worth arguing. A submit button is not a
       * question, so it does not obviously belong here — but it is the one control that must be
       * inside the form and must be a `<button type="submit">` rather than a styled box, or the
       * Enter key does nothing and a keyboard cannot send the form. Putting it here is what makes
       * that impossible to get wrong.
       *
       * ## `name` is what the answer arrives called
       *
       * Not the label. The person reading the messages sees `email`, `message`, `budget` — so it is
       * a separate attribute, minted from the label when a reader has not said otherwise, and a form
       * with two fields of one name is a message with one of them missing.
       *
       * ## Why it is an atom
       *
       * There is nothing inside a field to select or put a caret in: the label is a string and the
       * control is drawn. A reader editing the label edits the attribute, which is what the panel
       * is for and is the same answer a picture's `alt` gets.
       */
      field: {
        name: 'field',
        group: 'block',
        atom: true,
        attrs: {
          ...everyBlockAttrs,
          /**
           * What it is **painted** with — the five a control actually uses, named rather than taken
           * from `paintAttrs` wholesale.
           *
           * A gradient behind a text box and a shadow angle on a label are things this could have
           * declared and nothing would ever have drawn; the harness reported eleven of them the
           * minute the node existed. A field is a box with a line around it and words in it, and
           * these five say that.
           */
          fill: { type: 'string' as const, required: false },
          ink: { type: 'string' as const, required: false },
          stroke: { type: 'string' as const, required: false },
          strokeWidth: { type: 'number' as const, required: false },
          cornerRadius: { type: 'number' as const, required: false },
          /** What the visitor reads. Also the accessible name, which is why it is not decoration. */
          label: { type: 'string' as const, required: false },
          /** What the answer arrives called. Minted from the label when nobody said. */
          name: { type: 'string' as const, required: false },
          kind: {
            type: 'string' as const,
            default: 'text',
            options: [...FIELDS]
          },
          /** Whether a visitor may send it empty. */
          required: { type: 'boolean' as const, required: false },
          /**
           * The grey words inside the box — a **hint**, never the label.
           *
           * The single commonest accessibility fault on the web is a form labelled by its
           * placeholders: the words vanish the moment somebody types, so anyone who looks away has
           * lost the question, and a screen reader is told a hint where a name belongs. So a field
           * always draws its label, and this is extra.
           */
          placeholder: { type: 'string' as const, required: false },
          /** How many lines, for a `paragraph` field. */
          lines: { type: 'number' as const, required: false },
          /**
           * What a `choice` offers, in order.
           *
           * An array of strings and not a comma-separated one: a Korean answer contains commas, and
           * a separator a reader has to avoid typing is a field that quietly loses half an option.
           */
          choices: { type: 'array' as const, required: false },
          /**
           * The smallest and largest a **number** may be, and the longest a **text** may run.
           *
           * The browser's own validation, which is most of a form feature and costs nothing: it runs
           * with scripts off, in the visitor's own language, and it is what makes insisting on a real
           * `<form>` worth it.
           *
           * `pattern` is deliberately absent. It is a regular expression — a language a reader has to
           * learn and cannot debug — and this schema turned that down once already when a list's
           * filter became `where` + `equals` rather than an expression. A pattern worth having is a
           * **kind**.
           */
          min: { type: 'number' as const, required: false },
          max: { type: 'number' as const, required: false },
          maxLength: { type: 'number' as const, required: false }
        }
      }
    }
  };
}
