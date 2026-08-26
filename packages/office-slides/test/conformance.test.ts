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
      attributeRead: attributeReadFrom(
        registry as never,
        (type: string) => (schema.nodes.get(type) as { attrs?: Record<string, never> } | undefined)?.attrs,
        {},
        /**
         * What this product's `array` values look like.
         *
         * The probe has nothing to invent for an array, so it answers "cannot be asked" and the
         * check skips it — and the count of skips was nowhere, so a deck reporting `examined: 422`
         * had **29** questions it never asked. Among them `fills` and `effects` on six shape types
         * each: the whole paint system, unchecked, in the product that has the most of it.
         *
         * Each value below is the shape the reader expects — `readPaint`, `readEffect` and
         * `varBindsOf` all refuse anything else, and a refused value draws the same as an absent one
         * and would report a working mechanism as unread.
         */
        (_type: string, attr: string) => {
          switch (attr) {
            case 'fills':
              // A gradient rather than a solid: `paintsOf` falls back to the flat `gradientFrom` /
              // `gradientTo` pair when there is no list, and the probe sets those too — so a solid
              // could draw identically to the fallback and look unread.
              return [[{ kind: 'linear', angle: 45, opacity: 1, visible: true, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] }]];
            case 'effects':
              return [[{ kind: 'drop', x: 30, y: 90, blur: 240, spread: 15, color: 'rgba(0,0,0,0.4)', visible: true }]];
            case 'varBinds':
              return [[{ attr: 'fill', var: '강조' }]];
            case 'waypoints':
              return [[{ x: 1200, y: 900 }]];
            case 'guides':
              return [[{ axis: 'x', at: 1200 }]];
            case 'choices':
              return [['하나', '둘']];
            default:
              return undefined;
          }
        }
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
      /**
       * Not adopted, and named rather than left silent.
       *
       * `every-property-can-be-edited` asks which attributes a reader can **set**, and the answer
       * has to come from a declaration — a product's panel as data, the way its toolbar and its key
       * map already are. This product's is still a React tree, so it cannot answer, and a check with
       * no subjects passes without checking anything.
       *
       * The site builder answers it (`panel-model.ts`), which is what makes this a difference
       * between the three products rather than a limit of the harness. Owed here; in BACKLOG.md.
       */
      notYet: ['every-property-can-be-edited'],
      exempt: {
        /*
         * ── The three the attribute probe cannot see, and each says where it *is* read ──
         *
         * All three arrived at once, the day the probe was taught what an `array` looks like. Before
         * that the check answered "cannot be asked" and skipped them without counting, so a deck
         * reporting `examined: 422` had **29 questions it never asked** — and an unasked question
         * reads exactly like an answered one, which is the failure this whole harness is named after.
         */
        /**
         * Read by the deck's **instance resolver** (`boundAttrs` / `boundText`), not by a renderer,
         * and `slides-kit.ts` says why in the place it is installed: `attrsOf` is read in 62 places
         * inside the renderers and none of them has a document to look a variable up in, so a bound
         * corner radius would have reached the paint and not the border radius. A parent's
         * resolution is the one place that can hand a child back *as it is drawn* — and the probe
         * renders one bare node with no parent and no store, so it can never see this happen.
         */
        varBinds:
          'read by the instance resolver (`boundAttrs` / `boundText`), which hands a child back as it is drawn — a renderer has no document to look a variable up in',
        /**
         * Read by the **connector pass**, which computes every route once per render from the boxes
         * the line joins (`connector-pass.ts`). A bare connector joins nothing, so there is no route
         * for a waypoint to bend.
         */
        waypoints:
          'read by the connector pass, which routes every line once per render; a bare connector joins no boxes and has no route to bend',
        /**
         * Read by the **overlay**, which is the app's, and by `snapBox` during a drag. A guide is a
         * line a reader places to line things up against — it is not part of the slide's drawing and
         * must not be, or it would be in the exported picture.
         */
        guides:
          'read by the overlay and by `snapBox` during a drag — a guide is not part of the slide, which is the point of one',

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
        setComponentValue:
          'the properties panel — a placement’s 컴포넌트 group, one field per variable the definition declares. The fields come from the document, so a card that declares a colour and a state gets a swatch and a switch',
        detachComponent:
          'the properties panel — 분리 on a placement, which leaves a group: the parts a reader arranged stay arranged',
        importComponent:
          'the library dialog — 컴포넌트 on a deck’s row lists what it defines, and 가져오기 / 다시 가져오기 brings one in. There because the *storage* is there: whether a deck is a name in the library or an address to fetch is the host’s question, and the command takes the parsed deck rather than reaching for it',

        setComponentSize:
          'the properties panel — a definition’s own 크기 row, drawn while the reader is standing in one. The only place a card’s size can be changed: a placement’s extent *is* the card’s, so its own fields are greyed and the overlay draws it no resize handles',
        setComponentVar:
          'the components panel — the 변수 list, drawn while a definition is open: a label, a kind, a default, and 추가 for a new one. Beside the definition rather than on a part, because a variable belongs to the card — an accent colour used by three parts is one decision, which is the whole reason a declaration exists',
        setVarBind:
          'the properties panel — the 문서 변수 연결 group on an ordinary shape: one row per attribute the shape declares, each offering the document variables whose kind fits. Beside the card’s own rows rather than mixed into them, because they are two scopes and a reader has to see which they are choosing. Geometry is not offered at all (`UNBINDABLE`), which is measured rather than chosen: a bound size would be drawn where the resolution says and answered where the document says, and the overlay reads the answer',
        importVariable:
          'the library dialog — 안에 있는 것 on a deck’s row lists the values it declares beside the cards, and 가져오기 / 다시 가져오기 brings one in. There because the *storage* is there: whether a deck is a name in the library or an address to fetch is the host’s question, and the command takes the parsed deck rather than reaching for it',
        setSlideVar:
          'the components panel — the 이 장 변수 list, under the document’s and drawn while a slide is showing. The same control at a narrower scope, because setting a value should feel the same wherever the value lives; what the list says instead of a use count is that this page’s answer comes first inside it',
        setDocumentVar:
          'the components panel — the 문서 변수 list, above the card’s and drawn always, because a document variable is a fact about the document and there is nothing to be standing in. Each row says how many places name it (`varUses`), which is what a reader needs before changing one everywhere or deleting one: a reference to a name that is gone draws nothing',
        /**
         * The rename is the **name field** in those two lists, which is why it needs no control of
         * its own: it is the row's first field, and a reader who wants to change a name types in
         * the place the name is written.
         */
        renameDocumentVar:
          'the components panel — the name field on a 문서 변수 row. A separate command from setting one because it is a separate thing: setting writes one node, renaming rewrites every attribute, every shape binding and every card binding in the deck that means this declaration (`renameVarPlan`), in one transaction so one undo takes it back whole. A name the scope already declares is refused rather than merged',
        renameSlideVar:
          'the components panel — the name field on an 이 장 변수 row, the same gesture at the narrower scope. A page’s may take a name the document declares: the page was already shadowing it, so refusing that would refuse an edit for a clash that does not exist',
        setComponentBind:
          'the properties panel — a part’s 컴포넌트 부품 group, while the reader is inside a definition: one row per attribute the part declares, each offering the variables of a kind that fits. A declaration on the definition rather than an attribute on the part, so a variable can drive anything the part has (canvas-model §10g-2)',
        setComponentSlot:
          'the properties panel — the 슬롯 switch on a frame part in the same group. Not a binding and never was: it says where a reader’s own things go, and it was only in the same command because both were attributes on a part',

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

        setDeckShow:
          'the map’s bar — 눌러서 다음 장 / 버튼으로만 이동. There because that is where a reader thinks about a deck that is not a line, and because the picture beside it is what the setting is *about*: turn it on and the spine disappears, which is an honest preview of what a press will no longer do',

        setBoxJump:
          'the properties panel — the 누르면 row on a shape: a page picked by name, or 다음/이전/처음/끝/돌아가기. The pages are offered by name because that is what a reader knows; what the command writes is the page’s durable id, minting one if the page has none — the same thing motion does when a build first names a shape',

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
          'components — a definition part’s own durable name. Read by `instanceParts` (which binding applies to which part) and by the properties panel, which says which piece of the card the reader is standing in. Not a sid, because saving strips those: a binding written in sids would come back from a file naming nothing',
        /**
         * ── Where a definition came from ───────────────────────────────────
         *
         * A brand kit is a deck, and using one here is a **copy** that remembers its source — a
         * template cannot draw a foreign node (§10b-2), so a reference was never available. Read by
         * `componentSourceOf` and `componentBehindSource`: the panel says which definitions are the
         * library's and which of them have moved on. A definition's drawing is the same either way,
         * which is right — a card from a brand kit is still just a card.
         */
        fromDeck:
          'components — the deck a definition was brought in from, read by `componentSourceOf`; the copy is what makes it drawable at all, and the drawing is the same either way',
        fromId: 'components — its id in that deck, which may differ from its id here: two decks can both define a `card`',
        /**
         * ── A value that came from **another deck** ─────────────────────────
         *
         * The brand kit's answer (§10f) for a value rather than a card: another document is not in
         * this one, so it is a copy that remembers its source. Read by `variableSourceOf` and
         * `variableBehindSource` — the library dialog says which of a brand's values this deck has and
         * which of them the brand has since changed.
         *
         * An imported value is otherwise **this deck's own**: it draws, resolves and scopes exactly
         * like any other, which is why the drawing is identical either way and why there is no third
         * list anywhere.
         */
        fromValue:
          'the library dialog — what the source deck said when this value was copied, so `variableBehindSource` can offer the newer one. A value rather than a signature, because a variable *is* its value; a hash of one string would be one string more to read',
        fromSignature:
          'components — what that definition said when it was copied, so `componentBehindSource` can offer the library’s changes. A signature rather than a version, because a number would have to be maintained by a write on every edit of the source deck',

        /**
         * ── A binding is read where the children are, not by a renderer ─────
         *
         * These *look* unread to a check that asks the drawing, and they are read by
         * `instance-parts.ts` — in the resolver the view reads children through, which hands a
         * placement the definition's parts with this placement's values already in them. So the
         * renderer never sees a binding: by the time a part reaches a template it is an ordinary
         * node with an ordinary fill and ordinary words.
         *
         * Measured the other way first. A renderer that built the parts itself evaluated every one
         * of them against the *placement*, so two parts came out with the placement's box and the
         * placement's sid — the reason this is resolved in the datastore rather than drawn in a
         * template (§10b-2a).
         */
        slot:
          'components — `instanceParts` puts a placement’s own children *inside* the part marked with it, rather than beside the definition’s parts. The slot draws as the ordinary frame it is, which is the point: the arrangement is the frame’s and already knows what a drag inside it means',
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
        /**
         * A page's **durable name**, which is what a button points at.
         *
         * Read by `slideById` in `jump.ts` — and therefore by the show, the deck's own check and
         * (next) the map — and by nothing in the drawing, which is right: a page a reader linked
         * to does not look different from one nobody did. The sid is what everything on screen
         * keys on; this is what survives being saved (`forFile` strips sids), which is the whole
         * reason it exists.
         */
        /**
         * How a reader moves through the deck — the first deck-level setting this schema has.
         *
         * Read by the show (`advanceShow`), the map (there is no spine to draw), the deck's own
         * check (every page a button does not name is an island) and the scroll show (refused: a
         * scroll is a line). Nothing in the *drawing* reads it, and that is right — a page in a
         * links-only deck looks exactly like a page in any other.
         */
        'document.advance':
          'how the deck is moved through: read by `advanceShow`, `deckMap`, `jumpFaults` and the scroll show. A page in a links-only deck looks like any other, so the drawing does not read it',

        'surface.id':
          'a page’s durable name, resolved by `slideById` in `jump.ts` so a button can point at it across a save. Nothing in the drawing reads it, and a linked page looks like any other',

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
