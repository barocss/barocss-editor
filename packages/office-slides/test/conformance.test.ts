import { describe, it } from 'vitest';
import { assertConforms, attributeReadFrom, contentTagFrom, drawnTagFrom } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { iconNames } from '@barocss/office-icons';
import { getGlobalRegistry } from '@barocss/dsl';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { registerSlidesRenderers } from '../src/renderers';
import { createSlidesEditor, createSlidesOwnExtensions } from '../src/slides-kit';
import { kindOfBox } from '../src/layers';
import { slidesToolbarCommands, slidesToolbarIcons } from '../src/toolbar-model';
import { slidesKeyCommands } from '../src/keymap';

/**
 * What Slides promises, held to.
 *
 * This is what the harness was for. The checks Word had to discover — across
 * months, mostly in a browser — applied to the second product on its first day,
 * and its failures were a work list rather than a surprise. It started as a
 * ratchet at 64 of 64 undrawn, because Slides had registered nothing at all;
 * this is the same test with the renderers written, and it now asserts rather
 * than counts.
 *
 * Every exemption below is a decision on the record and a *claim*: if one of
 * these grows a renderer, this fails on the exemption rather than passing
 * quietly. That is the whole design — the operation roster allowed exemptions
 * with written reasons, fourteen went stale, and the checks they silenced
 * stayed off for months looking exactly like coverage.
 *
 * There are ten. There were twenty-seven, and seventeen of them said "inherited"
 * — a callout, a description list, a video the office schema declared because it
 * took the standard schema's node set entire. Word wrote the same list. The
 * schema names what an office document is made of now, so those are not
 * exemptions here or anywhere; what is left is about *this product*, which is
 * what an exemption is for.
 */
describe('Slides draws what its schema declares', () => {
  registerSlidesRenderers();

  const schema = createSchema('slides', getSlidesSchemaDefinition());
  const registry = getGlobalRegistry();

  /**
   * What each of Slides' insert commands puts in the document.
   *
   * Nine, where Word has twenty-three, which is the kit doing its job: a kit is
   * a product's answer to "what can be done here", and an answer that includes
   * things the product cannot draw is the wrong answer. Written out rather than
   * discovered — the engine cannot see inside a command, and a guess from the
   * name lies in both directions, which is how Word's list came to claim
   * `insertMention` made a node when it applies a mark.
   */
  const produces = [
    // Caught by `every-insert-is-accounted-for` within minutes of the command
    // being written, which is the whole reason that check exists.
    { command: 'insertSlide', produces: 'surface' },

    // One command per shape rather than `insertShape({ kind })`, because a
    // single command would have to answer "it depends" here — which is the
    // answer this check exists to refuse.
    { command: 'insertRectangle', produces: 'rectangle' },
    { command: 'insertEllipse', produces: 'ellipse' },
    { command: 'insertLine', produces: 'line' },
    // Not `insertImage`, which is the standard schema's and puts an
    // `inline-image` in a paragraph. A picture on a slide is placed.
    { command: 'insertPicture', produces: 'picture' },
    { command: 'insertTextBox', produces: 'textFrame' },
    /**
     * One command each, and this list is why: written first as a single
     * `insertMedia({ kind })`, which this check refused because it could only
     * answer "it depends" here.
     */
    { command: 'insertVideo', produces: 'mediaVideo' },
    { command: 'insertAudio', produces: 'mediaAudio' },
    { command: 'insertFrame', produces: 'frame' },
    /**
     * A line that remembers what it joins — the last of the office schema's canvas
     * nodes a deck could not make. `connector` was declared, named in the shared
     * vocabulary, and exempted here as "a deck has no arrows yet".
     */
    { command: 'insertConnector', produces: 'connector' },
    /**
     * Makes **two** things: the line, and a shape of the same kind as the one it grew
     * out of. The line is what is named here — the shapes it may make are each already
     * in this list under their own insert command, and naming one of them would be
     * choosing arbitrarily between them.
     */
    { command: 'insertConnectedShape', produces: 'connector' },

    { command: 'insertParagraph', produces: 'paragraph' },
    { command: 'insertHardBreak', produces: 'hardBreak' },
    { command: 'insertImage', produces: 'inline-image' },
    { command: 'insertTable', produces: 'bTable' },
    { command: 'insertRowAbove', produces: 'bTableRow' },
    { command: 'insertRowBelow', produces: 'bTableRow' },
    { command: 'insertColumnLeft', produces: 'bTableCell' },
    { command: 'insertColumnRight', produces: 'bTableCell' }
  ];

  /** Every command the kit registers, so `produces` can be checked for holes. */
  const commands = createSlidesEditor().commandNames();

  /**
   * The commands *this product* adds, measured rather than listed.
   *
   * A deck registers about a hundred and twenty and almost all of them are the
   * shared editing kit's — `moveCursorLeft`, `deleteWordBackward`,
   * `splitListItem` — which no toolbar should be asked to carry. The difference
   * between an editor built with Slides' own extensions and one built with none
   * is exactly the set this product is answerable for, and measuring it means
   * there is no list here to forget to update.
   */
  const own = (() => {
    const bare = new Set(createSlidesEditor({ kit: [] }).commandNames());
    /**
     * The product's own extensions, read from the product.
     *
     * This used to be a list written out here — `[createSlideCommands,
     * createBoxCommands, createArrangeCommands, createClipboardCommands]` —
     * while the kit installed six, and the check's own note says a list "would be
     * a fourth place to forget the thing the check exists to catch". It was: the
     * table commands and the layout commands were invisible to it, so a reader
     * could select a block of cells on a slide, find nothing anywhere that merged
     * them, and this reported no findings.
     */
    const mine = createSlidesEditor({ kit: createSlidesOwnExtensions() }).commandNames();
    return mine.filter((name: string) => !bare.has(name));
  })();

  /**
   * What a reader can actually reach: the toolbar, and the keys.
   *
   * Both read from the product's own declarations rather than from the app, so
   * this cannot drift from what is installed — which is why a deck's key map is
   * data in the package and not a handler in the host.
   */
  const reachable = [...slidesToolbarCommands(), ...slidesKeyCommands()];

  it('draws what it declares, expects only what it says it expects', () => {
    assertConforms({
      schema: schema as never,
      hasRenderer: (nodeType) => registry.has(nodeType),
      // Taken from the renderers rather than written down; see `drawnTagFrom`.
      drawnAs: drawnTagFrom(registry as never),
      // Where a node's *children* land, which is not always the element the node
      // draws as: a table header draws a `<thead>` and holds its cells in a
      // `<tr>` inside it.
      holdsIn: contentTagFrom(registry as never),
      /**
       * What this product calls a node type in a list — the layer panel's rows.
       *
       * `kindOfBox` and nothing else: it returns nothing for a type it has no word
       * for, which is what lets the check see a missing name. `labelOfBox` would
       * have answered "상자" for every one of them, which is a fallback and is the
       * failure the check is about.
       */
      nameOf: (type: string) => kindOfBox(type) ?? null,
      /**
       * Whether drawing a node changes when an attribute is set.
       *
       * Which replaces a list a person had to re-measure — see the check. The shapes
       * come from the same schema the check walks, so the probe value matches the
       * type the attribute declares.
       */
      attributeRead: attributeReadFrom(registry as never, (type: string) =>
        (schema.nodes.get(type) as { attrs?: Record<string, never> } | undefined)?.attrs
      ),
      /**
       * Every icon the deck's controls ask for, and whether the suite draws it.
       *
       * From the **declaration**, which is the point: the browser test asserts that
       * nothing *on screen* fell back to drawing its own name, and a control on a tab
       * nobody opened is declared exactly like a visible one.
       *
       * `iconNames()` is the table `Icon` itself reads, so this is the product's own
       * answer rather than a second list about it.
       */
      iconsAsked: slidesToolbarIcons(),
      iconDrawn: (name: string) => iconNames().includes(name),
      produces,
      commands,
      own,
      reachable,
      exempt: {
        // ── Reached somewhere other than the toolbar or a key ──────────────
        // Each of these is run from a control a reader can point at; the check
        // can see the toolbar and the key map and nothing else, so where it is
        // reached is written down here and fails if it stops being true.
        setBoxGeometry: 'the properties panel — position, size and rotation',
        setBoxStyle: 'the properties panel — fill, stroke, corner radius',
        setBoxLocked: 'the properties panel — the lock, which needs its own command',
        setDeckSize: 'the slide-size dialog',
        setSlideLayout: 'the layout dialog',
        addSlideNote: 'the button in the notes pane, shown when a slide has no note',
        setFrameLayout: 'the properties panel — a frame’s direction, gap, padding and columns',
        setBoxLayout:
          'the properties panel — a child’s 프레임 안에서 row (채우기 and 늘리기), drawn only inside a frame that arranges. The other half of the greyed position fields: the frame owns where a child goes, and this is what the child says about how it is treated',
        setConnector:
          'the properties panel — a connector’s 연결선 group: its route, its bow and the shape at each end. Dragging an end onto another shape runs the same command',
        insertConnectedShape:
          'the canvas — a line pulled out of a shape’s magnet and let go in empty space, which makes the next shape and joins it. The gesture a flow chart is made of, and it has no button because a button could not say *where*',
        reverseConnector:
          'the properties panel — 연결선 › 방향 › 뒤집기. A relationship drawn the wrong way round had two ways back before this: delete the line and draw it again, or drag both ends past each other',
        spliceIntoConnector:
          'the canvas — a shape dragged onto a line, which highlights while it is held and splits into two lines on release. Like `insertConnectedShape` it has no button, because a button could not say *which line*',
        cropPicture:
          'the crop handles on the stage — double-click a picture — and the panel’s way back',
        applySlideLayout:
          'the 레이아웃 dialog — “이 장을 이 배치로”, beside the button that only makes the slide *follow* the layout. Two buttons because they are two promises: one changes what a slide is like, the other moves the reader’s boxes',
        setSlideTransition: 'the properties panel — the slide’s 전환 row and its length',
        setBoxBuild: 'the properties panel — the box’s 애니메이션 row',
        setDeckTheme: 'the properties panel — the slide’s 테마 row, which re-colours the deck',
        // ── The components panel and a placement's own rows ────────────────
        /**
         * A component is made from a *selection* and placed *where the reader is*, and neither
         * is a thing a toolbar button can say. So these are in the panel beside the deck and
         * in the properties panel, and this is where that is written down.
         */
        createComponent:
          'the components panel — 고른 것으로 만들기, with boxes selected. Not a toolbar button because the gesture is about the selection: the reader’s boxes *become* the definition and a placement of it stays on the slide',
        placeComponent:
          'the components panel — 놓기 on a definition’s row, which puts one on the surface the reader is on. The app passes that surface, because it is the only thing that knows whether the reader is on a slide or inside a definition',
        applyComponent:
          'two places, and they are two questions: 적용 in the properties panel for *this* placement, and 모두 적용 on a definition’s row for every placement that has fallen behind it. Asked for rather than automatic — a definition pushing every edit into forty placements is two hundred document writes per keystroke',
        setComponentValue:
          'the properties panel — a placement’s 컴포넌트 group, one field per variable the definition declares. The fields come from the document, so a card that declares a colour and a state gets a swatch and a switch',
        detachComponent:
          'the properties panel — 분리 on a placement, which leaves a group: the parts a reader arranged stay arranged',
        setComponentSize:
          'the properties panel — a definition’s own 크기 row, drawn while the reader is standing in one. The only place a card’s size can be changed: a placement’s extent *is* the card’s, so its own fields are greyed and the overlay draws it no resize handles',
        setComponentVar:
          'the components panel — the 변수 list, drawn while a definition is open: a label, a kind, a default, and 추가 for a new one. Beside the definition rather than on a part, because a variable belongs to the card — an accent colour used by three parts is one decision, which is the whole reason a declaration exists',
        bindComponentPart:
          'the properties panel — a part’s 컴포넌트 부품 group, while the reader is inside a definition: which variable its words, its colour or its presence take, and whether a frame is the slot. Two panels because they are two questions, and the reader has selected a different thing in each',

        // ── The definitions a deck inherits from ───────────────────────────
        /**
         * `applySlideLayout` and `setSlideLayout` have always said what a slide *follows*, and
         * nothing said what a layout **is**. These two are that, reached from where a reader is
         * standing when they have opened one.
         */
        setDesign:
          'the properties panel — a layout’s or the master’s own group, drawn while the reader is standing in one: its name and the background every slide that follows it draws. Not `setBoxStyle`, which refuses a node that is not a box — measured, and it was the whole of the old state of this feature',
        applyDesign:
          'the properties panel — 따르는 장에 적용 in that group. Offered rather than automatic, because a layout’s **graphics are copied, not transcluded** (a template cannot draw a foreign node, canvas-model §10b-2): a slide draws its layout’s formatting and background live and its boxes never, so moving them is a thing a reader asks for',

        setSlideGuides:
          'the rulers — a guide is pulled out of one, dragged along the slide, and thrown away by being dragged off it',

        // ── The layer list ─────────────────────────────────────────────────
        // What is on the slide, stacked. Two of its three gestures are commands
        // the toolbar has no button for, because the question each answers is
        // about *one row* rather than about the selection.
        setBoxVisible:
          'the layer list — the eye on a row. An attribute the shared schema declared and the renderers already read (`isVisible` → `display: none`), with nothing able to set it',
        moveBoxTo:
          'the layer list — a row dragged to a place in the stack, which is the question 맨 앞으로/앞으로/뒤로/맨 뒤로 answer four ways; and a drag inside a frame that *arranges*, where a move has nowhere to go and the order is what a drag means (canvas-model §5)',

        // ── The timeline pane ──────────────────────────────────────────────
        // A slide's steps as one list: the order, the timing, and a film made
        // part of the sequence. Three of these are rows in that list; the fourth
        // is the properties panel's 재생 row on a film.
        setMotionStep:
          'the timeline pane — a step’s effect, start, length, delay, curve, colour, unit, trail, trigger and which fill or shadow it aims at',
        addBoxBuild: 'the timeline pane — 효과 추가 on a shape’s track',
        addBoxPath:
          'the properties panel — the 경로 gallery in the 모션 tab, beside the motion presets',
        addBoxCombo:
          'the properties panel — the 함께 gallery in the 모션 tab: one tile, two motions at once',
        addBoxesMotion:
          'the properties panel — the same galleries, with more than one box selected: a tile then animates all of them a beat apart',
        moveMotionStep: 'the timeline pane — the arrows on a step',
        shiftMotionSteps:
          'the timeline pane — dragging bars, and the arrow keys on a selected bar',
        removeMotionStep: 'the timeline pane — the delete button on a step',
        setBoxPlayback: 'the properties panel — a film’s 재생 row',
        setMediaTrim: 'the timeline pane — a play step’s 필름 group, 시작점 and 끝점',

        // ── Attributes read by something that is not a renderer ────────────
        /**
         * `every-attribute-is-read` asks the drawing, because that is the answer it can
         * take from the product rather than from a claim. An attribute that reaches a
         * reader some other way looks unread to it, and this is where that is written
         * down — **once per decision**, keyed by the attribute rather than by the node,
         * which is what `Finding.family` is for. `locked` came back on eleven node
         * types for one reason; eleven copies of it is the failure this harness is
         * named after.
         *
         * Each of these was verified by reading the reader, not by assuming one. Two of
         * the things that came back were not read anywhere at all, and are fixed rather
         * than listed: a path now takes the deck's paint (`svg-paint.ts`) and a slide
         * records its `kind` the way Word's surface always did.
         */
        locked:
          'the commands — `moveBoxes`, the arrange commands and `setBoxLocked` all refuse a locked box — and the layer list draws the padlock. A drawing that changed would be a shape that looks different from the one beside it for a reason about editing',
        name:
          'motion — a step names its box by it (`namedBoxes` in `timeline.ts`), `setBoxBuild` assigns one as it goes, and the deck file format is written in those names. A durable identity is the point: a sid is handed out at load, so a saved animation cannot be written in sids. A slide’s own `name` is read by the filmstrip (`titleOf` in `deck.ts`)',
        partId:
          'components — a definition part’s own durable name, which a placement’s copy points at. Not a sid, because saving strips those: a placement paired by sid would come back from a file with every part looking orphaned, and apply would take them all out. Caught before it shipped',
        partOf:
          'components — a placement holds *real* nodes (a template cannot draw a foreign node, canvas-model §10b-2), so a copy remembers the definition part it came from. That pairing is what apply reads, and it is deliberately not a role or a position: it survives renaming, reordering and editing, which is what breaks an override in every tool that matches structurally',
        appliedFrom:
          'components — what the definition said when this placement last took its parts, so `componentStale` can tell "the definition has moved on" from "the reader edited this placement". A signature rather than a version number, because a number would have to be maintained by a write on every edit',

        /**
         * ── A binding is substituted, not resolved ─────────────────────────
         *
         * These four *look* unread to a check that asks the drawing, and they are read by
         * `components.ts` — at **apply**, where the value is written into the placement's copy
         * of the part. The renderer deliberately does not read them, and that is the same
         * measurement the whole materialised design rests on: a template cannot draw a foreign
         * node (§10b-2), so a placement holds real nodes and the drawing stays plain. A
         * renderer resolving a binding would also mean a placement's text could not be
         * searched, spell-checked or measured without the definition in hand.
         */
        bindText:
          'components — `partCopy` writes the placement’s value into the part when the definition is applied, and the runs collapse to one so the value is *all* the part says. Read at apply rather than at draw: the drawing is plain nodes, which is what lets the text be found, checked and measured',
        bindFill:
          'components — the same substitution, for a colour used in more than one place. One decision instead of three copies of it, which is the thing free editing of a placement cannot do',
        bindVisible:
          'components — the same substitution, for a state. Only the falsy half is ever written (`visible: false`), because `visible: true` beside no `visible` at all is the same drawing — the asymmetry this very probe finds in every boolean',
        slot:
          'components — `componentApplyPlan` reads it twice: a slot part is compared with its origin *without its contents* (a slot is always different otherwise, so a definition’s change to the frame could never reach a placement anybody had used), and it is rewritten with `keepChildren`, which is what stops apply taking the reader’s own boxes out with it. The slot draws as the ordinary frame it is',
        noteId:
          'the notes pane — a slide names its note the way it names its header, and `noteOf` resolves it in `deck.ts`',
        trackId:
          'the timeline — `trackFor` in `motion.ts` resolves it. Time lives beside the document, so a slide carries a name rather than keyframes',
        trimStart: 'playback — `media-trim.ts`, when a play step starts a film part-way in',
        trimEnd: 'playback — the same file, which is the only thing that can act on a moment in time',

        // A frame arranges what is *in* it, so the change is in the children's
        // positions and not in the frame's own drawing. One entry each because they
        // are separate attributes, and one reader for all of them.
        layoutMode: 'the arrangement — `layoutChildren` in `canvas-layout.ts` moves the children; a frame with none of them draws the same either way',
        /*
         * The other side of the arrangement: what a *child* asks of the frame it is in. Read by
         * the same `layoutChildren`, which writes the child a width or a height — so a box on a
         * slide, with no arranging frame around it, draws exactly the same either way.
         */
        layoutStretch:
          'the arrangement — `layoutChildren` gives a stretched child the frame’s room across the axis. A box that is not in a frame that arranges draws the same either way, which is what this check is measuring',
        layoutGrow: 'the arrangement — the same, sharing what is left along the axis',
        gap: 'the arrangement — `layoutChildren`',
        padding: 'the arrangement — `layoutChildren`',
        alignItems: 'the arrangement — `layoutChildren`, across the axis',
        columns: 'the arrangement — `layoutChildren`, in grid mode',

        /**
         * ── An attribute whose value is a **reference** ─────────────────────
         *
         * The renderer reads both of these — resolving them against the document is
         * the whole of what a connector does — and the probe cannot demonstrate it: a
         * made-up string names no node, so both ends fall back to their remembered
         * places and the drawing is unchanged.
         *
         * The third shape of this. A fixed set the schema does not declare (fixed by
         * `options`), a set whose reader tolerates anything (exempted in Word), and now
         * a value that has to *exist elsewhere in the document*. A probe that invented
         * a legal sid would be building a document, which is a different check.
         */
        startNodeId:
          'the shape the end holds — `connectorSpecOf` reads it and the renderer resolves it against the document. A probe value names no node, so there is nothing to resolve',
        endNodeId: 'the other end’s shape — the same',
        startT:
          'how far along the *line* the end holds — read by `connectorRouteOf`, and only meaningful beside a `startNodeId` that names a connector. The probe can name no node, so there is no line to be a fraction of',
        endT: 'the other end’s fraction — the same',

        // ── One node, not the attribute everywhere ─────────────────────────
        'fieldDateTime.format':
          'the field needs a clock, and a clock arrives on the environment — with none the field draws nothing whatever the format says. Word tests the formats directly in `date-field.test.ts`',
        'paragraph.placeholder':
          'nothing reads it, and this is a gap rather than a decision: the prompt would show on an *empty* paragraph, and an empty paragraph here holds a caret filler, so `:empty` is not the test. Slides prompts from its layouts instead. See `docs/BACKLOG.md`',

        /**
         * ── A declaration is not a drawing ────────────────────────────────
         *
         * Asked about because an `instance` is a scene container, and a check that walks
         * containers cannot know that one of its children is a *value* rather than a box.
         * The layer list descends into `group` and `frame` only (`layerRows`), so a
         * placement's values are never rows in it — and if they were, "값" is not a name a
         * reader could tell one row from another with. What they are for is a field in a
         * panel, beside the placement.
         */
        componentValue:
          'a declaration, not a box: what one placement says a variable is. The layer list descends into `group` and `frame` only, so it is never a row in one — its place is a field in the panel beside the placement',

        // ── Commands that put no node in the document ──────────────────────
        insertText: 'writes characters into a run; makes no node',

        // ── A board's, not a deck's ────────────────────────────────────────
        // Reachable, because a slide is a canvas surface and these are scene
        // nodes. Slides registers no command for any of them, so nothing in
        // this product can make one — but a board pasted into a deck could
        // carry them, and then they would draw nothing. Logged rather than
        // called fine.

        // ── The twenty-three "inherited" lines are gone ────────────────────
        // They said the same thing twenty-three times — a callout, a checklist,
        // a description list, a video, a contents page: declared by the schema
        // and offered by nothing. Word's list was the same twenty-three, which
        // is what settled it. A list one product writes is an opinion; the same
        // list written twice is the schema claiming things the domain does not
        // have.
        //
        // `OFFICE_STANDARD_NODES` in `packages/schema/src/office-schema.ts` now
        // names what an office document is made of, and these are not in it.
        // They remain in the standard schema for a product whose domain is the
        // web — nothing was deleted, only un-claimed.
      }
    });
  });
});
