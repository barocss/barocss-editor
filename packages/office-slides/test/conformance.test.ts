import { beforeAll, describe, it } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { assertConforms, attributeReadFrom, contentTagFrom, drawnTagFrom } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { markAttributes, markCss } from '@barocss/office-text';
import { iconNames } from '@barocss/office-icons';
import { getGlobalRegistry } from '@barocss/dsl';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { registerSlidesRenderers } from '../src/renderers';
import { createSlidesEditor, createSlidesOwnExtensions } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { kindOfBox } from '../src/layers';
import { slidesToolbarCommands, slidesToolbarIcons } from '../src/toolbar-model';
import { slidesKeyCommands } from '../src/keymap';
import { slidesPanelAttrs, slidesPanelCommands } from '../src/panel-model';
import { slidesMenuCommands } from '../src/menu-model';

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
  /*
   * Four surfaces now. The menubar is the fourth, and the reason it counts is the reason the other
   * three are declarations rather than JSX: a surface the harness has not been told about is a
   * surface that does not exist as far as it is concerned.
   */
  const reachable = [
    ...slidesToolbarCommands(),
    ...slidesKeyCommands(),
    ...slidesPanelCommands(),
    ...slidesMenuCommands()
  ];

  /**
   * And whether a command a surface offers **does anything when it runs**.
   *
   * The site builder's probe, in a deck's state: a slide with a box on it and that box selected.
   * Awaited in a `beforeAll` because a command is `async` and a check is not — the site measured the
   * wrong way first and got "changed nothing" for all 24, which is the shape of a probe that fails
   * loudly rather than quietly.
   */
  const moved = new Map<string, boolean | null>();

  beforeAll(async () => {
    for (const command of [...new Set(reachable)]) {
      const store = new DataStore(undefined as never, schema as never);
      const editor: any = createSlidesEditor({ editable: true, schema, dataStore: store } as never);
      editor.loadDocument(createSampleDeck() as never, 'slides');

      const rootId = editor.getRootId();
      const slide = ((store.getNode(rootId) as any)?.content ?? []).find(
        (sid: unknown) => typeof sid === 'string' && (store.getNode(sid as string) as any)?.stype === 'surface'
      ) as string | undefined;
      const box = slide ? (((store.getNode(slide) as any)?.content ?? [])[0] as string | undefined) : undefined;
      if (!slide || typeof box !== 'string') {
        moved.set(command, null);
        continue;
      }

      // The state a deck's surfaces act from: one box held, and the slide it is on named.
      await editor.executeCommand('setNode', { nodeIds: [box] });
      const payload = { slideId: slide, parentId: slide, nodeId: slide };
      if (editor.canExecuteCommand(command, payload) !== true) {
        moved.set(command, null);
        continue;
      }

      const before = JSON.stringify(editor.exportDocument?.(rootId) ?? '');
      await editor.executeCommand(command, payload);
      moved.set(command, JSON.stringify(editor.exportDocument?.(rootId) ?? '') !== before);
    }
  });

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
      commandChanges: (command: string) => moved.get(command) ?? null,
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
      /**
       * Every attribute a reader can **set**, from the deck's own declarations.
       *
       * `notYet: ['every-property-can-be-edited']` was here until the panel became data
       * (`panel-model.ts`), which is the same move `toolbar-model.ts` and `keymap.ts` made before
       * it. A deferral that stops being true is reported like a stale exemption, so the line had to
       * go the moment this one arrived.
       */
      editable: slidesPanelAttrs(),
      /**
       * Whether the product draws anything for a mark — a vocabulary no check could see.
       *
       * Two ways a mark can draw, and both count: a **template** registered as `mark:<type>` (a link
       * is an `<a>`, and only an element can be one), or an entry in `office-text`'s format tables,
       * which is what turns a `<span class="mark-bold">` into something bold. A mark in neither is a
       * mark a reader applies to no effect — eleven were, until this asked.
       */
      markDrawn: (mark: string) =>
        registry.has(`mark:${mark}`) ||
        Object.keys(markCss(mark, { color: '#f00', size: 22, href: '#x' }, undefined)).length > 0 ||
        Object.keys(markAttributes(mark, { lang: 'ko' })).length > 0,
      ratchet: {
        /**
         * **Eight commands that say they can run and change nothing**, on this check's first run here.
         *
         * A ratchet rather than eight exemptions, because none of these is a decision yet. The site
         * builder's four all turned out to be *application* commands — a clipboard, a selection, two
         * exports — and were exempted with reasons in an afternoon. The deck's are the other kind.
         * What each looks like, from one look:
         *
         * - `setFontColor`, `removeFontColor`, `toggleBulletList`, `toggleOrderedList` — **text**
         *   commands, offered with a *box* selected. They say yes to a node selection and then have
         *   no range to write to, which is precisely the `canExecute` looser than its `execute` this
         *   repository has already found four of.
         * - `sendBackward`, `sendToBack` — the box is already at the back. Every design tool greys
         *   these there; this one offers them and does nothing.
         * - `insertTable` — says it can and puts no table on the slide, which is the one here that
         *   looks like a plain bug.
         * - `nudgeBoxes` — offered with no `dx`/`dy`, which no surface actually does: the key map
         *   always supplies them. Arguably the probe's fault and arguably the command's, and a
         *   ratchet is the honest place for a finding nobody has decided about.
         *
         * The number has to come **down** with the work: fewer findings than this fails too, which is
         * what stops a fixed four leaving room to break four more quietly.
         */
        'every-command-does-something': 8
      },
      exempt: {
        copyBoxes: 'puts boxes on a clipboard, which is a property of the reader and not of the deck',
        /*
         * The filmstrip — a double-click on a slide's row, which becomes a field in place.
         *
         * There rather than in the properties panel for the reason the site's layer list gave: it is
         * where a reader is looking at a list of names, and a rename that sends them to another pane
         * is three gestures for the smallest edit there is.
         */
        setSlideInfo: 'the filmstrip — a double-click on a slide’s row, which becomes a field in place',
        // ── Set by a gesture, never typed ──────────────────────────────────
        /**
         * A connector's ends and a path's outline.
         *
         * These are what a reader **drags**: an end is attached by pulling it onto a shape, and the
         * side it leaves from is chosen by where it lands. Numbers for them would be four fields
         * that describe a line nobody can see while typing into them — and the deck already refuses
         * to draw a rotate grip on a box whose rotation a variable decides, for the same reason.
         *
         * Held in the browser suite, where a gesture is the only way to ask about a gesture.
         */
        startX: 'dragged: an end is attached by pulling it onto a shape',
        startY: 'dragged: an end is attached by pulling it onto a shape',
        endX: 'dragged: an end is attached by pulling it onto a shape',
        endY: 'dragged: an end is attached by pulling it onto a shape',
        startSide: 'chosen by where the dragged end lands — a magnet, not a field',
        endSide: 'chosen by where the dragged end lands — a magnet, not a field',
        d: 'a path’s outline, drawn with the pen and edited by its points',
        flipX: 'the arrange toolbar’s 좌우 뒤집기, which writes it without naming it',
        flipY: 'the arrange toolbar’s 상하 뒤집기, which writes it without naming it',
        /*
         * `startCap` and `endCap` were exempt here as **owed**, and the panel has offered them all
         * along — 시작 모양 and 끝 모양. A prose claim about a React tree, wrong in the direction
         * that costs most: somebody would have built a control that already existed. Declared in
         * `panel-model.ts` now, which is what makes the claim checkable instead of believable.
         */

        // ── A durable name, which a reader must not type ───────────────────
        /*
         * The same reason the site's exemption gives: these are how one node refers to another, and
         * `forFile` strips sids precisely so a reference is never one. A reader retyping a `partId`
         * silently unbinds every placement of the definition it belongs to.
         */
        id: 'a durable reference target — renaming one by hand breaks every reference to it',
        part: 'which piece of a definition this is; a binding names it',
        layoutId: 'which layout a slide follows — chosen from the layout list, never typed',
        role: 'what a placeholder is for; a layout decides it and a slide inherits it',
        componentId: 'which definition a placement draws — instance swap, deferred with variants',
        hidden: 'a layout’s placeholder a slide has turned off — the layer list’s eye, not a field',

        // ── A resource's own fields, edited where the resource is ──────────
        /**
         * A variable and a binding are **resources**, not boxes: they are edited in the variables
         * dialog and in the component library, which are surfaces this panel model does not cover
         * because they are not the panel. Named individually so that the day one of them grows a row
         * here, the claim is stale.
         */
        value: 'a variable’s value — the 문서 변수 dialog',
        var: 'which variable a binding names — the 문서 변수 연결 row picks it, the attribute is the row’s key',
        attr: 'which attribute a binding writes — the row it is on says so',
        type: 'what kind of value a variable holds — the 문서 변수 dialog',
        choices: 'the values a variable may take — the 문서 변수 dialog',

        // ── A film, and a picture's source ─────────────────────────────────
        /*
         * `src`, `poster` and `alt` arrive with the insert — a reader chooses a file — and the four
         * playback flags are genuinely not offered: the 재생 row says *when* a film starts relative
         * to the step before it, which is a different question from whether it loops. Owed.
         */
        src: 'chosen when the picture or film is inserted',
        poster: 'chosen when the film is inserted',
        alt: 'the ribbon’s 대체 텍스트',
        autoplay: 'not offered: 재생 says when a film starts in the sequence, not how it plays — owed, BACKLOG.md',
        controls: 'not offered: 재생 says when a film starts in the sequence, not how it plays — owed, BACKLOG.md',
        loop: 'not offered: 재생 says when a film starts in the sequence, not how it plays — owed, BACKLOG.md',
        muted: 'not offered: 재생 says when a film starts in the sequence, not how it plays — owed, BACKLOG.md',

        // ── Word's vocabulary, drawn on a slide and not editable here ──────
        /**
         * A slide can hold a table and a code block because the shared text kit draws them, and this
         * product has no panel for either. Not a decision — a gap, and it fails on the claim the day
         * one is built. The site builder has the identical four.
         */
        caption: 'the shared text kit draws it; a deck has no table panel — owed, BACKLOG.md',
        colspan: 'the shared text kit draws it; a deck has no table panel — owed, BACKLOG.md',
        rowspan: 'the shared text kit draws it; a deck has no table panel — owed, BACKLOG.md',
        language: 'the shared text kit draws it; a deck has no code panel — owed, BACKLOG.md',
        level: 'a list’s depth, which Tab and Shift+Tab set — the deck offers no numbering panel',
        clipsContent: 'not offered: a frame on a slide always clips, which is what a frame is there — owed, BACKLOG.md',

        /*
         * ── Thirteen exemptions were here, and the harness deleted them ────
         *
         * `setBoxGeometry`, `setBoxStyle`, `setBoxLocked`, `setFrameLayout`, `setBoxLayout`,
         * `setConnector`, `cropPicture`, `setSlideTransition`, `setVarBind`, `setComponentBind`,
         * `setBoxJump`, `addBoxesMotion` and `setBoxPlayback` were sentences describing rows in a
         * React tree — *"the properties panel — fill, stroke, corner radius"*. The day the panel
         * became a declaration (`panel-model.ts`) they stopped exempting anything and came back as
         * **stale**, which is the shape of every good thing this harness does.
         */

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
        setDeckSize: 'the slide-size dialog',
        setSlideLayout: 'the layout dialog',
        addSlideNote: 'the button in the notes pane, shown when a slide has no note',
        insertConnectedShape:
          'the canvas — a line pulled out of a shape’s magnet and let go in empty space, which makes the next shape and joins it. The gesture a flow chart is made of, and it has no button because a button could not say *where*',
        /*
         * `reverseConnector` was exempt here as *"the properties panel — 연결선 › 방향 › 뒤집기"*,
         * which was true and is now **declared** (`panel-model.ts`): a 방향 row whose control is an
         * `action`. The harness reported the exemption stale the moment it was, which is the whole
         * shape of moving a surface out of JSX — one sentence at a time stops being a claim.
         */
        spliceIntoConnector:
          'the canvas — a shape dragged onto a line, which highlights while it is held and splits into two lines on release. Like `insertConnectedShape` it has no button, because a button could not say *which line*',
        applySlideLayout:
          'the 레이아웃 dialog — “이 장을 이 배치로”, beside the button that only makes the slide *follow* the layout. Two buttons because they are two promises: one changes what a slide is like, the other moves the reader’s boxes',
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
        moveMotionStep: 'the timeline pane — the arrows on a step',
        shiftMotionSteps:
          'the timeline pane — dragging bars, and the arrow keys on a selected bar',
        removeMotionStep: 'the timeline pane — the delete button on a step',
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
        /*
         * The four sides, for the same reason and by the same reader. They arrived with the page
         * builder's hero — 96 above and 64 below — and a slide's boxes want them just as much;
         * what a renderer sees is where the arrangement already put the children.
         */
        paddingTop: 'the arrangement — `layoutChildren`',
        paddingRight: 'the arrangement — `layoutChildren`',
        paddingBottom: 'the arrangement — `layoutChildren`',
        paddingLeft: 'the arrangement — `layoutChildren`',
        justifyContent: 'the arrangement — `layoutChildren`, which distributes what is left along the axis',
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
