/**
 * The unified Office schema.
 *
 * Word, Slide, PageBuilder and FigJam all read and write **one** document model,
 * the way Figma's design, FigJam and Slides files share a single node graph. A
 * product is not a different schema — it is a different set of behaviours over
 * the same vocabulary. That is what makes an extension written for one product
 * meaningful in another, and what makes cross-product copy/paste a data move
 * rather than a conversion.
 *
 * The structure follows `docs/specs/standard-schema.md` §9.1: one flat schema
 * containing every node type, with **content expressions** deciding where each
 * type may appear. There is no runtime concept of nested schemas.
 *
 *     document
 *       └── surface+                     a page / canvas / slide / web page
 *             ├── block+                 flow content   (Word, PageBuilder)
 *             └── scene+                 positioned art (Slide, FigJam)
 *
 * `surface` is the seam. A flow surface holds blocks; a canvas surface holds
 * scene nodes. Both live in the same file, so a Word document can embed a canvas
 * and a slide can embed a rich-text frame without either product learning a
 * second model.
 *
 * Domain isolation comes from group membership, not from separate schemas:
 * scene-only types are in group `scene` and are therefore unreachable from
 * `block+`, and vice versa. Content expressions are checked by ContentMatch, so
 * these constraints are actually enforced at commit time.
 */
import type { NodeTypeDefinition, SchemaDefinition } from './types';
import { getStandardSchemaDefinition } from './standard-schema';

/** Nodes that can sit directly on a canvas surface, in a frame, or in a group. */
const SCENE = 'scene';

/**
 * Geometry shared by everything positioned on a canvas.
 *
 * Exported because a command that edits a box has to know which attributes it
 * may write, and the only alternative is a list in the command that says the
 * same thing. That list existed and had already gone stale: `cornerRadius`,
 * `locked` and `visible` were declared here, drawn by the renderers, and named
 * by neither `setBoxGeometry` nor `setBoxStyle` — three attributes a document
 * could hold, a reader could see, and nothing in the product could change.
 *
 * Restated in two places is restated wrongly eventually. There is one
 * declaration and the commands read it.
 */
/**
 * What every placed thing has, box or not: whether it is shown, whether it may be
 * moved, and how solid it is.
 *
 * Separate from the geometry because a **connector** has all three and none of the
 * geometry: its extent is whatever the two shapes it joins happen to make, and
 * `width` below is `required`. A schema that demands a width from a thing that has no
 * width is a promise a document can only keep by inventing a number — which is the
 * fault this repository keeps finding in itself, one level down from the borders that
 * were handed to every box.
 */
export const CANVAS_PRESENCE_ATTRS = {
  opacity: { type: 'number' as const, default: 1, min: 0, max: 1 },
  locked: { type: 'boolean' as const, default: false },
  visible: { type: 'boolean' as const, default: true },
  /**
   * Where this box **came from**: the `partId` of the definition part it was copied from.
   *
   * A placement of a component holds real nodes (canvas-model §10b-2), so a copy has to
   * remember its original or nothing can tell later which of a placement's boxes are the
   * component's and which the reader added. That pairing is what makes the component
   * survive the things that break Figma's: it is not structural, so **renaming or
   * reordering the definition's parts cannot mis-apply an override**, and neither can
   * editing one.
   *
   * Absent means "the reader's own", which is the honest default: everything on a slide is
   * the reader's until it was copied from somewhere.
   */
  /**
   * This part's own durable name inside a definition, for a placement's copy to point at.
   *
   * Written on the definition's parts, and it is not a sid: saving strips those, so a
   * placement's `partOf` written in sids would point at nothing the first time the deck was
   * opened again — and then every part of every placement would look orphaned and apply would
   * remove them all. The same rule motion follows, for the same reason: a saved animation
   * cannot be written in sids.
   */
  partId: { type: 'string' as const, required: false },
  /**
   * What this part takes from a **component variable**: its words, its colour, whether it is
   * there at all.
   *
   * Three attributes rather than one map, and the three are what a component property is
   * anywhere: text, a colour, and a state. (Figma's fourth — swapping one instance for another
   * — is not needed here, because a placement may simply *hold* whatever a reader puts in it.)
   *
   * Named rather than positional, like everything else in this schema that refers to something:
   * a part says `bindText: 'title'`, and renaming a part cannot break it.
   */
  bindText: { type: 'string' as const, required: false },
  bindFill: { type: 'string' as const, required: false },
  bindVisible: { type: 'string' as const, required: false },
  /**
   * That this part is the **slot**: where a placement's own children go.
   *
   * Figma added slots because instance-swap could not say "put whatever you like here", and
   * paid for it with a second layout system inside components. Here the slot is an ordinary
   * `frame` part — so the layout is the frame's, which already exists, is already tested, and
   * already knows that a drag inside it means the order (§5a). What this attribute adds is one
   * sentence: a placement's parts that came from nowhere live **in** this frame rather than
   * beside the definition's.
   *
   * Named, so a definition may have two.
   */
  slot: { type: 'string' as const, required: false },
  partOf: { type: 'string' as const, required: false },
  /**
   * What the placement's definition said when its parts were last taken from it.
   *
   * A signature rather than a version number, because a number would have to be
   * *maintained* — a write on the definition every time it changed, which is derived state in
   * the document and the fault this repository keeps finding. A signature is computed when
   * somebody asks, so nothing is written until a reader applies.
   *
   * It is what tells "the definition has moved on" from "the reader edited this placement":
   * with materialised parts both show up as a difference, and only this says which.
   */
  appliedFrom: { type: 'string' as const, required: false }
};

export const CANVAS_GEOMETRY_ATTRS = {
  x: { type: 'number' as const, default: 0 },
  y: { type: 'number' as const, default: 0 },
  width: { type: 'number' as const, required: true },
  height: { type: 'number' as const, required: true },
  rotation: { type: 'number' as const, default: 0 },
  ...CANVAS_PRESENCE_ATTRS
};

/**
 * The ink: what a shape's edge is drawn with.
 *
 * Separate from the fill because a **line** and a **connector** have no interior, and
 * declaring `fill` on them is a promise nothing can keep — the drawing has nothing to
 * put a colour in. Both were exempted in the conformance report as "a line has no
 * interior to fill", twice, which is the harness saying the schema is the wrong shape
 * rather than the product.
 */
export const CANVAS_LINE_STYLE_ATTRS = {
  stroke: { type: 'string' as const, required: false },
  strokeWidth: { type: 'number' as const, default: 1 }
};

/** How a box is painted. Every scene node that has a surface to fill. */
export const CANVAS_STYLE_ATTRS = {
  fill: { type: 'string' as const, required: false },
  ...CANVAS_LINE_STYLE_ATTRS
};

const geometry = CANVAS_GEOMETRY_ATTRS;
const style = CANVAS_STYLE_ATTRS;

/**
 * Canvas half of the model: surfaces, containers and shapes.
 *
 * Exported separately so a product can merge just this into a document schema
 * (see `docs/specs/standard-schema.md` §9.1) without taking the whole Office
 * vocabulary.
 */
export function getCanvasNodeDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    // ── Containers ───────────────────────────────────────────────────────────
    /**
     * A box that holds other placed things, and may arrange them.
     *
     * `layoutMode` has been declared since these nodes were written and was read
     * by nothing. Reading it is what turns a frame into Figma's auto-layout:
     * `row`, `column` or `grid` means the frame owns its children's `x` and `y`
     * and computes them, so three shapes stay evenly spaced when a fourth
     * arrives. Absent, or `none`, and the children keep their own coordinates as
     * they always have.
     *
     * The four attributes beside it are what the arrangement needs, and each is
     * declared in the change that reads it — `gap` and `padding` in twips like
     * every other length, `alignItems` across the run, `columns` for a grid.
     */
    frame: {
      name: 'frame',
      /**
       * A block, and still a scene node wherever a canvas names it.
       *
       * A frame is a *layout box*: a thing that holds other things and decides
       * where they go. That is as useful in a document as on a slide — two
       * columns of text, a row of cards, a grid of pictures — and a word
       * processor has no node for it, so a reader who wants three boxes side by
       * side in a document has to draw a table.
       *
       * A node carries one group, and `block` is the one that makes a frame
       * reachable in the flow. The canvas containers name it explicitly instead:
       * `(scene | frame)*` rather than `scene*`, which says the same thing it
       * said before.
       */
      group: 'block',
      /**
       * Blocks in a document, scene nodes on a canvas — the same shape
       * `surface` has, and for the same reason: what a container holds depends
       * on which kind of surface it is standing on.
       *
       * The arrangement follows from that and needs no second mechanism. Blocks
       * have no coordinates, so a frame full of blocks is laid out by the
       * browser; scene nodes carry `x` and `y`, so a frame full of those has
       * them computed — see `docs/specs/canvas-model.md`.
       */
      content: 'scene* | block+',
      attrs: {
        name: { type: 'string', required: false },
        clipsContent: { type: 'boolean', default: true },
        /** `row`, `column` or `grid`; `none` and anything absent leave the children where
         * they were put. Declared so `layoutModeOf`'s set is readable — see options. */
        layoutMode: {
          type: 'string',
          required: false,
          options: ['none', 'row', 'column', 'grid']
        },
        gap: { type: 'number', default: 0 },
        padding: { type: 'number', default: 0 },
        /** Where a child sits across the arrangement's axis — see `layoutChildren`. */
        alignItems: { type: 'string', default: 'start', options: ['start', 'center', 'end'] },
        columns: { type: 'number', default: 2 },
        ...geometry,
        /**
         * A size the frame may not have, which every other placed node must.
         *
         * `geometry` requires a width and a height because a shape with neither
         * cannot be drawn — a rectangle of no stated size is a bug caught at the
         * transaction rather than a blank spot noticed a week later. A frame in
         * the flow is the one case where that guard is wrong: it is as wide as
         * the column it sits in, and that width is the page's to decide. An
         * author who had to state one in twips would be writing down a number
         * that goes stale the moment a margin moves, which is most of the reason
         * to want a frame in a document at all.
         *
         * So the requirement moves to where it can be stated truthfully: a frame
         * *placed on a canvas* is given a size by the command that places it,
         * and `frameCss` writes `width` only when there is one to write.
         */
        width: { type: 'number', required: false },
        height: { type: 'number', required: false },
        ...style
      }
    },
    group: {
      name: 'group',
      group: SCENE,
      /**
       * `*`, not `+`, and the reason is **when validation runs**.
       *
       * A group with nothing in it is not a group, and nothing here keeps one: grouping
       * refuses fewer than two shapes and ungrouping deletes the group it empties. But
       * ungrouping *has to pass through* the empty state — the children leave one at a
       * time and the group is removed after the last one — and a transaction is
       * validated as a whole. With `+` that gesture could not be expressed at all:
       * every ungroup was rejected with "Content of 'group' ended early".
       *
       * It went unnoticed because of a second bug that hid it. `moveNode` wrote the
       * *alias* it was given into the child's `parentId`, so a grouped child pointed at
       * a name that existed only inside that transaction; the later ungroup then failed
       * to find the old parent, never removed the child from the group's content, and
       * the group was never empty. Two faults cancelling out, and the pair only showed
       * up when a connector became the first thing to walk **up** the tree.
       *
       * So the rule stays a *product* rule, where it can be enforced by the commands
       * that make and unmake groups, rather than a schema rule that also governs the
       * inside of a transaction. `frame` is named because it is a block now — see the
       * note there.
       */
      content: '(scene | frame)*',
      attrs: { name: { type: 'string', required: false }, ...geometry }
    },

    // ── Shapes ───────────────────────────────────────────────────────────────
    rectangle: {
      name: 'rectangle',
      group: SCENE,
      atom: true,
      attrs: { cornerRadius: { type: 'number', default: 0 }, ...geometry, ...style }
    },
    ellipse: { name: 'ellipse', group: SCENE, atom: true, attrs: { ...geometry, ...style } },
    /**
     * Two points, drawn between. No `fill`: a line has no interior, and the attribute
     * was on it only because one style list was handed to every shape.
     */
    line: {
      name: 'line',
      group: SCENE,
      atom: true,
      attrs: { ...geometry, ...CANVAS_LINE_STYLE_ATTRS }
    },
    /**
     * A picture placed on a canvas.
     *
     * Distinct from the standard schema's `inline-image`, which flows with text
     * and takes its place in a line. This one is placed: it has a position and a
     * size like every other scene node, and a reader drags and resizes it.
     * PowerPoint's pictures are these; a picture pasted into a paragraph is the
     * other one.
     *
     * Declared here in the change that draws it and the command that makes it,
     * which is the rule this schema learned the hard way — fifteen node types
     * were declared before anything read them.
     */
    picture: {
      name: 'picture',
      group: SCENE,
      atom: true,
      attrs: {
        src: { type: 'string', required: true },
        alt: { type: 'string', required: false },
        /** How the picture fills a box that is not its own shape. */
        fit: { type: 'string', default: 'contain' },
        ...geometry,
        ...style
      }
    },
    /**
     * A line that remembers **what it joins** rather than where it is.
     *
     * Which is the whole difference from a `line`: move either shape and the
     * connector follows, so a flowchart survives being rearranged. See
     * `docs/specs/canvas-model.md` §8 for the decisions, and `canvas-connector.ts`
     * for the arithmetic.
     *
     * No geometry, deliberately — §8.1. Its extent is whatever the two shapes make,
     * and `width` is a required attribute a connector could only satisfy by inventing
     * a number. Every consumer derives the bounds from the ends.
     */
    connector: {
      name: 'connector',
      group: SCENE,
      atom: true,
      attrs: {
        /** The shape each end is attached to. Absent is an end pinned to the canvas. */
        startNodeId: { type: 'string', required: false },
        endNodeId: { type: 'string', required: false },
        /**
         * Where each end **is**, in the container's twips.
         *
         * Carried even while attached, and written back every time the ends are resolved:
         * when the shape an end holds is deleted, the attachment is dropped and the
         * line stays where it last was. A line that vanished with its shape would take
         * the relationship out of the picture silently — §8.2.
         */
        startX: { type: 'number', default: 0 },
        startY: { type: 'number', default: 0 },
        endX: { type: 'number', default: 0 },
        endY: { type: 'number', default: 0 },
        /**
         * How far along the **line** an end holds, when what it holds is another
         * connector — a flowchart's branch off the middle of a flow.
         *
         * A fraction of that line's *length*, `0` to `1`. It has to be a length rather
         * than a side, because a line has no sides to be a magnet of; and the halfway
         * of an elbow whose first leg is twice its second is not its corner, it is the
         * halfway a reader can see.
         */
        startT: { type: 'number', required: false, min: 0, max: 1 },
        endT: { type: 'number', required: false, min: 0, max: 1 },
        /**
         * Which magnet each end holds: a side, the centre, or `auto` for the nearest
         * pair. A straight connector uses the centre and clips at the outline — a
         * straight line to a side's midpoint cuts through the shape (§8.3).
         */
        startSide: {
          type: 'string',
          default: 'auto',
          options: ['auto', 'n', 'e', 's', 'w', 'c']
        },
        endSide: {
          type: 'string',
          default: 'auto',
          options: ['auto', 'n', 'e', 's', 'w', 'c']
        },
        /**
         * Whether the line **flows**: dashes travelling along it.
         *
         * An arrowhead says where the relationship points and says it standing still. A
         * flow says the same thing moving, which is stronger — with six lines on a
         * slide, the one that flows is the one the eye follows, and that is what a
         * presenter wants while they are talking about one path through a diagram.
         */
        flow: { type: 'boolean', default: false },
        /**
         * A word on the line — what the relationship *is*.
         *
         * "yes", "no", "1..n", "on failure": a flowchart without them is a picture of
         * boxes. Plain text and short on purpose (`LABEL_MAX`): a line carries a word,
         * and a paragraph on one is a text box that should have been placed as one.
         */
        label: { type: 'string', required: false },
        /**
         * The points a reader has told the line to go **through**.
         *
         * `[{ x, y }]` in the connector's own coordinates. In the document when the route
         * itself is not (§8.11) because these are the opposite of derived: there is
         * nothing to work a hand-placed bend out *from*, and a reader who has routed a
         * line around a table they will move later means that route to stay.
         *
         * With any of these, nothing routes around anything — they have said where it
         * goes. `type: 'array'` is what the schema takes for a list, the same way a
         * slide's guides and a shape's fills are expressed.
         */
        waypoints: { type: 'array', required: false },
        /** The route it takes — §8.4. */
        kind: {
          type: 'string',
          default: 'elbow',
          options: ['straight', 'elbow', 'curve', 'arc']
        },
        /**
         * How far the route bows out, in twips.
         *
         * What it moves depends on the route: an elbow's midpoint slides, a curve's
         * handles push sideways, and a straight line has nothing to bow. Signed, so a
         * reader can separate two connectors between the same pair of shapes.
         */
        bend: { type: 'number', default: 0 },
        /**
         * What is drawn at each end. A vocabulary rather than a preference: a flow is
         * an arrow, an association a dot, and UML's inheritance and composition a
         * hollow triangle and a diamond — §8.6.
         */
        /**
         * The label's own type: how big, what colour, and whether it is bold.
         *
         * Three attributes rather than one style object, for the reason the whole
         * connector is flat: the schema can then declare the *range* and the validator and
         * the conformance probe can both read it. A JSON blob in one attribute is a value
         * nothing can check.
         *
         * Twips, like every other length here (canvas-model §1) — 200 is ten point. The
         * range is a reader's range: below about half that a label on a projected slide is
         * unreadable, and above it the pill is bigger than the shapes.
         */
        /**
         * A word for each **end**, beside the one in the middle.
         *
         * The middle label names the relationship; these say something about that end —
         * UML's multiplicity (`1` here, `0..*` there) is the notation everyone knows, and
         * it is the difference between "an order has items" and "an order has many items".
         *
         * Two attributes rather than a list of `{ t, text }`, for the reason the whole
         * connector is flat: a list of objects is a value the validator and the
         * conformance probe cannot read, and the notation readers actually draw is these
         * three words.
         */
        startLabel: { type: 'string', required: false },
        endLabel: { type: 'string', required: false },
        labelSize: { type: 'number', default: 195, min: 90, max: 800 },
        labelColor: { type: 'string', required: false },
        labelBold: { type: 'boolean', default: false },
        startCap: {
          type: 'string',
          default: 'none',
          options: [
            'none',
            'arrow',
            'open',
            'triangle',
            'hollow',
            'circle',
            'diamond',
            'bar',
            'cross'
          ]
        },
        endCap: {
          type: 'string',
          default: 'arrow',
          options: [
            'none',
            'arrow',
            'open',
            'triangle',
            'hollow',
            'circle',
            'diamond',
            'bar',
            'cross'
          ]
        },
        ...CANVAS_PRESENCE_ATTRS,
        ...CANVAS_LINE_STYLE_ATTRS
      }
    },
    path: {
      name: 'path',
      group: SCENE,
      atom: true,
      // Freehand ink and vector paths alike; `d` is SVG path data.
      attrs: { d: { type: 'string', required: true }, ...geometry, ...style }
    },
    sticky: {
      name: 'sticky',
      group: SCENE,
      // A sticky note holds flow content, which is how canvas and document meet.
      content: 'block+',
      attrs: { ...geometry, ...style }
    },
    /**
     * Rich text placed on a canvas. Its children are ordinary blocks, so every
     * text command written for Word works inside a slide or a FigJam frame.
     */
    textFrame: {
      name: 'textFrame',
      group: SCENE,
      content: 'block+',
      attrs: {
        /**
         * Where the text sits in a box taller than it.
         *
         * `center` is in the set because `verticalAlignCss` accepts it as a spelling of
         * `middle`, and a set that excluded a value the renderer draws would make the
         * validator disagree with the product.
         */
        verticalAlign: {
          type: 'string',
          default: 'top',
          options: ['top', 'middle', 'center', 'bottom']
        },
        /**
         * The room between the box's edge and the text in it, in twips.
         *
         * PowerPoint calls it the internal margin and gives it four sides;
         * this is one value, like the `padding` a frame already carries, and a
         * per-side `insetLeft` would sit beside it rather than instead of it if
         * a reader ever asks. One is what the common case needs — a text box
         * with a fill, whose words would otherwise touch its border — and four
         * numbers to set the common case is four chances to set three of them.
         *
         * Zero by default, not PowerPoint's 0.1in: a default is what every
         * document that says nothing gets, and changing it would shift the text
         * in every deck already written by 144 twips.
         */
        textInset: { type: 'number', default: 0 },
        ...geometry,
        ...style
      }
    },
    /** Reusable definition and its placements (Figma component / instance). */
    /**
     * A component's **definition**: named parts a placement is made from.
     *
     * ## Where it lives, and why that is not the page sequence
     *
     * A definition is not a page of the document, and putting it in `surface+` said that it
     * was — after which every reader of "the document's surfaces" had to ask whether each one
     * counted: the slide list, the strip, the presenter, the count. Two of those leaked before
     * the third was written. `resources` is where this document keeps the things pages *refer
     * to* — a layout, a master, a theme, a footnote body — and a component is one of those.
     *
     * ## Drawn, and hidden
     *
     * The reason it is not simply left out of the drawing is `slideLayout`'s, written where
     * that decision was made: *a node with no element has no place in the sid map, and every
     * mapping from a DOM position back to the model goes through that.* So a definition is
     * drawn `display: none` and shown when a reader **opens** it — which is how it gets the
     * whole editing apparatus without anything being told about components.
     *
     * ## `id`, because a sid does not survive a file
     *
     * Saving strips `sid` and `parentId` — they are the store's, not the document's — so a
     * reference written in sids is a reference that breaks the first time a deck is opened
     * again. A layout is referenced by `id` for that reason, and motion names a shape rather
     * than pointing at it. This is the same rule, and getting it wrong here would be
     * expensive in a particular way: every placement's parts would look orphaned after a
     * reload, and apply would take them all out.
     */
    component: {
      name: 'component',
      group: 'component',
      /**
       * What it **declares**, then what it **draws**.
       *
       * The variables come first because they are the definition's interface: a reader looking
       * at the file sees what a placement of this can be asked for before seeing what it is
       * made of.
       */
      content: 'componentVar* (scene | frame)*',
      attrs: {
        id: { type: 'string' as const, required: true },
        name: { type: 'string' as const, required: false },
        /** The room the definition is drawn in while it is being edited. */
        width: { type: 'number' as const, required: false },
        height: { type: 'number' as const, required: false }
      }
    },

    /**
     * One thing a placement can be asked for: a **component variable**.
     *
     * ## Why a node rather than a list in an attribute
     *
     * Because a value nothing can check is the fault this schema keeps finding. A blob of JSON
     * in one attribute cannot be validated, cannot be probed by the conformance harness, and
     * cannot be read by a panel without a parser — the argument already made twice, against
     * keeping a connector's spec in one attribute and against keeping a placement's overrides
     * in one. A declaration made of nodes is a declaration the product can be held to.
     *
     * ## Why variables at all, when a placement can be edited freely
     *
     * A placement holds real nodes, so a reader can already change anything in it. Three things
     * that cannot do:
     *
     * - **One value in more than one place.** An accent colour used by three parts is one
     *   decision, and editing three copies of it is three chances to disagree.
     * - **A state.** "Show the badge" is a `boolean`, and a set of them is a `choice` with its
     *   options declared — which is what stops variants multiplying into a matrix, the thing
     *   Figma had to bolt component properties on to escape.
     * - **A panel worth having.** "This card: title, number, badge" is a list a reader can be
     *   shown; free editing gives no list at all.
     *
     * ## What a variable is *not*
     *
     * It is not resolved when the placement is drawn. Values are substituted into a placement's
     * parts when the definition is **applied** (canvas-model §10b-4), for the same reason the
     * parts themselves are copied: a template cannot draw a foreign node, so the drawing stays
     * plain.
     */
    componentVar: {
      name: 'componentVar',
      group: 'componentVar',
      atom: true,
      attrs: {
        /** What a part binds to and a placement names. Durable, like every other reference. */
        name: { type: 'string' as const, required: true },
        /** What a reader is shown beside the field, when the name is not enough. */
        label: { type: 'string' as const, required: false },
        kind: {
          type: 'string' as const,
          default: 'text',
          options: ['text', 'color', 'number', 'boolean', 'choice']
        },
        /**
         * The values a `choice` may take.
         *
         * An array, which the conformance probe abstains from rather than inventing a value for
         * — the same abstention a connector's waypoints get, and for the same reason: a shape
         * the schema does not describe is one a probe would be guessing at.
         */
        choices: { type: 'array' as const, required: false },
        /** What a placement gets when it says nothing. */
        value: { type: 'string' as const, required: false }
      }
    },

    /**
     * What one placement says a variable is.
     *
     * A node for the reason above, and a **string** for the value whatever the kind: the
     * variable's declared `kind` is the contract that says how to read it, and one shape here
     * means one thing to write, one thing to diff in a file and one thing to check. A number
     * kept as `"12"` is a number a person can read in a pull request.
     */
    componentValue: {
      name: 'componentValue',
      group: 'componentValue',
      atom: true,
      attrs: {
        name: { type: 'string' as const, required: true },
        value: { type: 'string' as const, required: false }
      }
    },

    /**
     * A placement of a component's definition.
     *
     * ## Where the definition is, and why it is not here
     *
     * Not on a slide, which is where it used to be allowed: a definition drawn where it sits
     * is drawn twice — once as itself and once through every placement — and a reader could
     * select the master copy by clicking it. That is Figma's model, and the thing that gives a
     * Figma file a page of furniture belonging to no design.
     *
     * And not a surface either, which is where this schema put it next: a surface is a *page*,
     * and saying a definition was one meant every reader of the page sequence had to ask
     * whether each page counted. It is a **resource** — see `component` above.
     *
     * ## Why this holds children
     *
     * It was `atom: true`, meaning an instance could only ever be *placed*. But a placement
     * has to be able to differ — a card with this heading, that number — and the two ways to
     * say so are not equal:
     *
     * - Figma's way: any property of any descendant may be overridden, matched structurally.
     *   Which is where every complaint about components comes from — rename a layer and the
     *   overrides mis-apply, and nothing shows a reader which properties have stopped
     *   following the definition.
     * - This schema's way, already written for slides: a slide references a `layoutId` and
     *   holds **its own** placeholders, which override the layout's by **role, never by
     *   position** (`layout-format.ts`). An instance is to a component exactly what a slide
     *   is to a layout, so it holds its own children and they win by role.
     *
     * The gain is that an override is an ordinary node the validator can check and the
     * conformance probe can read, and that renaming or reordering the definition's children
     * cannot break a placement — there is no structural matching to break.
     */
    instance: {
      name: 'instance',
      group: SCENE,
      /**
       * What it **says**, then what it **holds**.
       *
       * The values first, for the same reason a definition's variables come first: they are
       * this placement's answers to the definition's questions, and they are what a reader —
       * or a diff — wants to see before the parts.
       */
      content: 'componentValue* (scene | frame)*',
      attrs: { componentId: { type: 'string', required: true }, ...geometry }
    },

    /**
     * A canvas embedded inside flow content — a diagram in the middle of a Word
     * document.
     *
     * `scene*` and not `(scene | frame)*` like the containers above it, which is
     * a distinction worth stating because it looks like an omission. This is the
     * one canvas that is *inside* the flow, and a frame is already a block: a
     * reader who wants two columns of text puts a frame in the document, next to
     * this drawing rather than inside it. Naming a frame here would say a drawing
     * can hold a layout box, and the product where that reads as a real offer is
     * the one where it draws nothing.
     */
    canvasBlock: {
      name: 'canvasBlock',
      group: 'block',
      content: 'scene*',
      attrs: { width: { type: 'number', required: false }, height: { type: 'number', required: false } }
    }
  };
}

/** Document-level content that is not laid out in the flow. */
const META = 'meta';  // group name for docTitle/docSubtitle/docAuthor

/** A definition referenced from the flow by id, placed by the product. */
const RESOURCE = 'resource';

/**
 * Document-level content and referenced definitions.
 *
 * Three kinds of thing are NOT flow content but still belong to the document:
 *
 *   document.attrs   scalars that are never rich and never separately edited
 *                    (locale, revision, pageSize)
 *   meta             document-level CONTENT — a title carries marks, takes a
 *                    collaborative cursor, and lives in history like any node
 *   resources        definitions referenced by id from the flow — footnote and
 *                    endnote bodies, comment threads, surface notes, headers
 *
 * `resources` exists because the render position of these is a *layout*
 * decision, not an authoring one: a footnote sits at the foot of a printed page,
 * in a popover on the web, and in a side panel in review mode. Keeping them out
 * of `surface` means the authoring model does not encode one product's layout,
 * while keeping them in the document means they are still saved, undone,
 * collaboratively edited and addressable by sid — which attributes could never
 * give them.
 *
 * The reference direction already exists in the mark vocabulary: the flow holds
 * `footnoteRef` (a mark carrying `id`), the body lives here. Several references
 * may point at one definition.
 */
export function getMetaNodeDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    docMeta: { name: 'docMeta', group: 'document', content: 'docTitle? docSubtitle? docAuthor*' },
    docTitle: { name: 'docTitle', group: META, content: 'inline*' },
    docSubtitle: { name: 'docSubtitle', group: META, content: 'inline*' },
    docAuthor: { name: 'docAuthor', group: META, content: 'inline*' },

    resources: { name: 'resources', group: 'document', content: 'resource*' },

    /**
     * The deck's component **library**: the definitions its placements point at.
     *
     * Its own container rather than a corner of `resources` — see `document` for the reason,
     * which is that this is the one kind of definition that appears on the screen.
     */
    components: { name: 'components', group: 'document', content: 'component*' },

    // Bodies referenced from the flow by `footnoteRef` / `endnoteRef` marks.
    footnoteDef: {
      name: 'footnoteDef',
      group: RESOURCE,
      content: 'block+',
      attrs: { id: { type: 'string', required: true } }
    },
    endnoteDef: {
      name: 'endnoteDef',
      group: RESOURCE,
      content: 'block+',
      attrs: { id: { type: 'string', required: true } }
    },
    /**
     * A discussion anchored to something in the document. `targetId` is the sid
     * it is about, so the same mechanism serves a Word comment, a FigJam sticky
     * reply and a review note on a slide.
     */
    commentThread: {
      name: 'commentThread',
      group: RESOURCE,
      content: 'block+',
      attrs: {
        id: { type: 'string', required: true },
        targetId: { type: 'string', required: false },
        resolved: { type: 'boolean', default: false }
      }
    },
    /**
     * A note about one surface, rather than about the document.
     *
     * Named for how it binds and not for who reads it. What a presenter says
     * beside a slide, what an author leaves beside a page, what a facilitator
     * writes beside a board — one relationship, and the schema is shared by all
     * three, so a name from any one product would be wrong in the other two.
     *
     * **The surface names the note, not the other way round.** This carried a
     * `surfaceId` at first, which read well and could not work: a surface's
     * identity is its sid, sids are `session:counter` and handed out at load,
     * and a document that arrives with a note is a document whose author never
     * saw one. Every binding in this schema that a product actually resolves
     * goes the other way — a surface names its header by `headerId` and the
     * `docHeader` carries the matching `id` — so this does too, and a fixture,
     * an importer and a saved file can all express it.
     */
    surfaceNote: {
      name: 'surfaceNote',
      group: RESOURCE,
      content: 'block+',
      attrs: { id: { type: 'string', required: true } }
    },
    /**
     * Repeating page furniture. Document-wide when `surfaceId` is absent, an
     * override for one surface when present — the same binding rule as every
     * other resource, rather than a second mechanism.
     */
    docHeader: {
      name: 'docHeader',
      group: RESOURCE,
      content: 'block+',
      attrs: {
        /**
         * Referenced by id as well as bound by surface, because one section can
         * need several: a first-page header, an even-page header and the rest.
         * `surfaceId` alone cannot say which of the three a given header is.
         */
        id: { type: 'string', required: false },
        surfaceId: { type: 'string', required: false }
      }
    },
    docFooter: {
      name: 'docFooter',
      group: RESOURCE,
      content: 'block+',
      attrs: {
        id: { type: 'string', required: false },
        surfaceId: { type: 'string', required: false }
      }
    },
    bibliography: { name: 'bibliography', group: RESOURCE, content: 'block*' },
    indexBlock: { name: 'indexBlock', group: RESOURCE, content: 'block*' }
  };
}

/**
 * Surfaces: the per-product page. All four products use the same node type and
 * differ only in `kind` and which content they hold.
 */
export function getSurfaceNodeDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    /**
     * `meta? surface+ resources? components?` — metadata, referenced definitions and the
     * component library are siblings of the pages, not children of them.
     *
     * ## Why the library is not inside `resources`
     *
     * It was, and it worked: a component is a definition pages refer to, which is what
     * `resources` holds. What decided the move is not taxonomy but **display and ownership**.
     *
     * Every definition in `resources` is hidden as a group (`.w-resources { display: none }`),
     * because none of them belongs on the screen — and a component's definition is the one
     * that does, while it is being edited. Showing it meant punching a hole in that rule with
     * a `:has()` selector naming the group that happens to hold the focused one, and the first
     * attempt un-hid the whole group and put the ruler six pixels off the slide (measured). A
     * container whose *whole* purpose is components can simply be shown.
     *
     * And a library is a thing to own: where a name would go, where "imported from that deck"
     * would go, and what a brand kit would be. `resources` has no such identity — it is a bag.
     */
    document: {
      name: 'document',
      group: 'document',
      content: 'docMeta? surface+ resources? components?'
    },
    /**
     * One page / slide / canvas / web page.
     *
     * `block+ | scene*` is the whole product split: a Word page and a
     * PageBuilder page hold blocks, a slide and a FigJam board hold scene nodes.
     * `kind` records which, so a product can filter surfaces it understands
     * while still round-tripping the ones it does not.
     */
    surface: {
      name: 'surface',
      group: 'surface',
      content: 'block+ | (scene | frame)*',
      attrs: {
        kind: { type: 'string', default: 'flow' },
        name: { type: 'string', required: false },
        width: { type: 'number', required: false },
        height: { type: 'number', required: false }
      }
    }
  };
}

/**
 * The standard nodes an Office document is made of.
 *
 * Named, rather than taken whole. Office used to spread the standard schema's
 * entire node set and let each product write off what it could not draw, and
 * two products' lists came back **identical**: the same twenty-three types, in
 * Word's exemptions as `BUG:` and in Slides' as `inherited`. One product's list
 * is an opinion; two identical lists are the schema declaring things nothing in
 * this domain offers.
 *
 * What that cost, exactly: a document could legally contain a `callout`, a
 * `mediaVideo` or a `descList`, no renderer would draw it, and the reader's text
 * would be in the file and invisible on the page. Every product after these two
 * would have written the same list again.
 *
 * So the rule is the one the frame taught: **if a check can be turned into a
 * schema, it should be.** A node office does not offer is now a node office does
 * not declare, and a document that tries one is refused when it is written.
 *
 * ## What is left out, and where it went
 *
 * Nothing is deleted — these all remain in the standard schema, for a product
 * whose domain is the web rather than the office: `bFigure`/`bFigcaption`,
 * `bDetails`/`bSummary`, `columns`/`column`, `descList`/`descTerm`/`descDef`,
 * `mediaVideo`/`mediaAudio`/`mediaEmbed`, `callout`, `pullQuote`, `taskItem`,
 * `chart`, `emoji`, `toc`, `docSection`, `mathInline`/`mathBlock` and
 * `fieldPageNumber`/`fieldPageCount`.
 *
 * The last three groups are the interesting ones, because office has all three
 * *and does them differently*: Word draws equations from OMML node names, its
 * page numbers are furniture the layout pass paints rather than nodes in the
 * flow, and its contents page is `tableOfContents`, computed from the headings.
 * A second way to say the same thing is not a spare — it is a second thing to
 * keep working.
 *
 * They form a closed set: every reference to one of them comes from another one
 * of them (`bFigure` names `bFigcaption` and the media types, `descList` names
 * its own terms), so nothing that stays points at something that went.
 */
const OFFICE_STANDARD_NODES = [
  // The flow itself.
  'paragraph',
  'heading',
  'blockQuote',
  'codeBlock',
  'horizontalRule',
  'pageBreak',
  'list',
  'listItem',
  'hardBreak',
  'inline-text',
  'inline-image',
  'bookmarkAnchor',

  // Tables, all seven parts.
  'bTable',
  'bTableHeader',
  'bTableBody',
  'bTableFooter',
  'bTableRow',
  'bTableHeaderCell',
  'bTableCell',

  // The fields office resolves from the document rather than from the page.
  'fieldDateTime',
  'fieldDocTitle',
  'fieldAuthor',

  /**
   * Bodies and definitions — declared here and re-declared as resources below,
   * which is the point of naming them: they are reachable through `resources`
   * and nowhere else, so a footnote's body cannot sit between two paragraphs.
   */
  'footnoteDef',
  'endnoteDef',
  'commentThread',
  'bibliography',
  'indexBlock',
  'docHeader',
  'docFooter'
] as const;

/**
 * The whole Office vocabulary: the standard nodes above + canvas nodes, under a
 * document → surface root.
 *
 * Products install different kits over this one schema rather than defining
 * their own.
 */
export function getOfficeSchemaDefinition(): SchemaDefinition {
  const standard = getStandardSchemaDefinition();

  /**
   * The standard schema roots at `document → block+`. Office roots at
   * `document → surface+` so a file can hold several pages/slides/boards, so
   * the standard `document` definition is left out rather than merged — as is
   * everything office does not offer; see `OFFICE_STANDARD_NODES`.
   */
  const standardNodes: Record<string, NodeTypeDefinition> = {};
  for (const name of OFFICE_STANDARD_NODES) {
    const node = standard.nodes[name];
    // A name here that the standard schema no longer has is a rename nobody
    // followed through, and silence would turn it into a node type that stopped
    // existing without anything saying so.
    if (!node) throw new Error(`office schema names a standard node that does not exist: ${name}`);
    standardNodes[name] = node;
  }

  return {
    topNode: 'document',
    nodes: {
      ...standardNodes,
      ...getSurfaceNodeDefinitions(),
      // Deliberately after the standard nodes: the standard schema declares
      // footnoteDef, commentThread, bibliography, indexBlock, docHeader and
      // docFooter as `group: 'block'`, which lets a footnote body sit between two
      // paragraphs in the flow. Office re-declares them as resources so they are
      // reachable only through `resources`, and placed by the product.
      ...getMetaNodeDefinitions(),
      ...getCanvasNodeDefinitions()
    },
    marks: standard.marks
  };
}

/** Surface kinds the built-in products use. Not exhaustive — `kind` is a free string. */
export const SurfaceKind = {
  /** Word, PageBuilder: flow content, paginated or responsive at the product layer. */
  Flow: 'flow',
  /** Slide: fixed-size canvas. */
  Slide: 'slide',
  /** FigJam: unbounded canvas. */
  Board: 'board'
} as const;

export type SurfaceKindValue = (typeof SurfaceKind)[keyof typeof SurfaceKind];
