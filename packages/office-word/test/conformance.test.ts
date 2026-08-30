import { describe, it } from 'vitest';
import { assertConforms, attributeReadFrom, contentTagFrom, drawnTagFrom } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { markAttributes, markCss } from '@barocss/office-text';
import { iconNames } from '@barocss/office-icons';
import { nameOfNode } from '@barocss/office-controls';
import { WORD_ENV_KEY, createWordEnv } from '../src/render-context';
import { getWordSchemaDefinition } from '../src/word-schema';
import { createWordEditor } from '../src/word-kit';
import { toolbarAttrs, toolbarIcons } from '../src/toolbar-model';
import { wordRulerAttrs } from '../src/ruler-model';
import { getGlobalRegistry } from '@barocss/dsl';
import { registerWordRenderers } from '../src/renderers/word';

/**
 * What Word promises, held to.
 *
 * The schema is a promise about what a document may contain, and until now
 * nothing checked that the product could draw what it promised. It could not:
 * more than half the declared node types had no renderer, and the whole scene
 * set — the second document shape a `surface` can hold — sat there for as long
 * as the schema had existed.
 *
 * Every exemption below is a decision on the record. It is also a *claim*: if
 * one of these grows a renderer, this test fails on the exemption rather than
 * passing quietly. That is deliberate and it is the whole design — the
 * operation roster allowed exemptions with written reasons, fourteen went
 * stale, and the checks they silenced stayed off for months looking exactly
 * like coverage.
 */
describe('Word draws what its schema declares', () => {
  registerWordRenderers();

  /**
 * Word's own schema, not the office base it extends.
 *
 * This asked the base schema first, and the check that asks whether a command's
 * node exists caught it: `insertTab` and `insertColumnBreak` both looked
 * impossible, and both work — Word declares `tab` and `columnBreak` itself. A
 * harness pointed at the wrong subject reports on something nobody ships.
 */
const schema = createSchema('word', getWordSchemaDefinition());
  const registry = getGlobalRegistry();

  /**
   * What each of Word's insert commands puts in the document.
   *
   * Written out rather than discovered: a command is a function and the engine
   * cannot see what it makes, and a guess from the name would be a check that
   * lies in both directions. The cost of writing it is the point — a new
   * command added without a line here is a command this check does not cover,
   * and that is visible in the diff.
   */
  const produces = [
    { command: 'insertParagraph', produces: 'paragraph' },
    { command: 'insertHardBreak', produces: 'hardBreak' },
    { command: 'insertLineBreak', produces: 'hardBreak' },
    { command: 'insertImage', produces: 'inline-image' },
    { command: 'insertHorizontalRule', produces: 'horizontalRule' },
    { command: 'insertPageBreak', produces: 'pageBreak' },
    { command: 'insertColumnBreak', produces: 'columnBreak' },
    { command: 'insertTab', produces: 'tab' },
    { command: 'insertTable', produces: 'bTable' },
    { command: 'insertFrame', produces: 'frame' },
    /*
     * The drawing, and what goes on it. Each shape says which node it makes, which is the whole
     * reason they are five commands rather than one `insertShape` with a kind — and each of them
     * also makes the `canvasBlock` when the reader is not already on one, which is a fact about
     * *where* rather than about what, and is the insert's own comment.
     */
    { command: 'insertDrawing', produces: 'canvasBlock' },
    { command: 'insertRectangle', produces: 'rectangle' },
    { command: 'insertEllipse', produces: 'ellipse' },
    { command: 'insertLine', produces: 'line' },
    /*
     * Enter, with a shape selected: a line to keep writing on after the drawing. Named as an insert
     * because that is what it does — always a new paragraph, never "the caret goes to whatever is
     * already below", which would be two gestures wearing one key.
     */
    { command: 'insertParagraphAfterDrawing', produces: 'paragraph' },
    { command: 'insertRowAbove', produces: 'bTableRow' },
    { command: 'insertRowBelow', produces: 'bTableRow' },
    { command: 'insertColumnLeft', produces: 'bTableCell' },
    { command: 'insertColumnRight', produces: 'bTableCell' },
    { command: 'insertBookmark', produces: 'bookmarkAnchor' },
    { command: 'insertFootnote', produces: 'footnoteDef' },
    { command: 'insertEndnote', produces: 'endnoteDef' },
    { command: 'insertComment', produces: 'commentThread' }
  ];


  /**
   * Every command Word registers, so the harness can ask whether `produces` is
   * complete. Built by standing an editor up, because a list of commands
   * written by hand is the thing this check exists to distrust.
   */
  const commands = createWordEditor().commandNames();

  const held = () =>
    assertConforms({
      schema: schema as never,
      hasRenderer: (nodeType) => registry.has(nodeType),
      // Taken from the renderers rather than written down; see `drawnTagFrom`.
      drawnAs: drawnTagFrom(registry as never),
      /**
       * What this product calls a canvas node.
       *
       * The suite's table and nothing of its own: Word draws shapes on a canvas —
       * `rectangle`, `ellipse`, `line`, a `frame` — and had no word for any of
       * them. It has no list beside a canvas *yet*; the check applies all the same,
       * because the day it grows one (or an accessibility name, or an audit report)
       * the words have to exist, and the point of the check is that they cannot
       * quietly stop existing.
       */
      nameOf: (type: string) => nameOfNode(type) ?? null,
      /**
       * Whether drawing a node changes when an attribute is set.
       *
       * This is the check that replaces **this product's own hand-kept list**: a
       * section of `docs/BACKLOG.md` headed "Attributes the schema declares and
       * nothing reads", a line each, and *"Re-measured 2026-08-18, and five came
       * off."* Somebody had to go and look, one attribute at a time, and between one
       * look and the next the list said things that were no longer true.
       *
       * The shapes come from the same schema the check walks, so a probe value always
       * matches the type the attribute declares — see `attributeReadFrom`.
       */
      attributeRead: attributeReadFrom(
        registry as never,
        (type: string) =>
          (schema.nodes.get(type) as { attrs?: Record<string, never> } | undefined)?.attrs,
        /**
         * With Word's own environment, because Word's renderers answer nothing without
         * one: every piece of block and run formatting resolves through the style
         * resolver, and `formatFor` returns `{}` when there is none. The first run of
         * this check had no environment and reported 483 of 597 attributes as unread.
         *
         * An empty document is the right one to resolve against: it gives the resolver
         * no named styles, so what reaches the drawing is the node's own direct
         * formatting — which is exactly what the probe sets.
         */
        {
          [WORD_ENV_KEY]: createWordEnv({
            rootId: 'conformance',
            getNode: () => undefined
          } as never)
        },
        /**
         * And what Word's `array` values look like.
         *
         * The probe has nothing to invent for an array, so it answers "cannot be asked" and the
         * check skips it — and until the skips were counted, `examined: 600` read as coverage over a
         * product with **11 questions it never asked**. Three attributes, and all three turn out to
         * be read somewhere a bare render cannot reach, which is what the exemptions below say.
         */
        (_type: string, attr: string) => {
          switch (attr) {
            case 'tabs':
              // `[{ pos, align, leader }]` — `tabStopsOf`'s shape.
              return [[{ pos: 2880, align: 'right', leader: 'dot' }]];
            case 'wrapPolygon':
              return [[{ x: 0, y: 0 }, { x: 1440, y: 0 }, { x: 720, y: 1440 }]];
            case 'varBinds':
              return [[{ attr: 'fill', var: '강조' }]];
            /**
             * How a picture fills a box that is not its own shape.
             *
             * Not `options` in the schema, because the site and the deck pass it straight through as
             * CSS `object-fit` and take everything that property takes; Word maps three of them onto
             * SVG's `preserveAspectRatio`. So the *product* says what its values are, which is what
             * this hook is for — and until it did, the probe invented strings, every one of them fell
             * to the same default, and `fit` came back as an attribute nothing reads.
             */
            case 'fit':
              return ['contain', 'cover', 'fill'];
            /*
             * A table's column widths, in twips — `gridOf` splits on commas and drops anything that
             * is not a positive number, so an invented string parses to an empty grid and a table
             * that plainly reads this looked as though it did not.
             */
            case 'grid':
              return ['1440,2880,1440'];
            /*
             * `auto` or `fixed`, which `css.ts` reads as `table-layout`. Not `options` in the schema
             * because it is `str('auto')` and every product that draws a table takes the CSS
             * property's own vocabulary; the two values Word maps are the product's to name.
             */
            case 'layout':
              return ['fixed', 'auto'];
            /*
             * How a **text box** is wrapped, which is what decides whether it floats, clears, or
             * leaves the flow — and with it whether `horizontalAlign` (which side it floats to) and
             * `zOrder` (which of two stacked boxes is on top) mean anything at all. Not `options` in
             * the schema for the reason `fit` is not: the value comes from Word's own vocabulary and
             * a page and a deck use the same node with more of it.
             */
            case 'wrapType':
              return ['square', 'topAndBottom', 'behind', 'inFront'];
            /* Which side a floating box goes to. `left` or the other one, which is `right`. */
            case 'horizontalAlign':
              return ['left', 'right'];
            /*
             * How a run of maths is set — Word's `m:sty`: plain, bold, italic or both. Four values,
             * and the renderer switches on every one of them; an invented string falls to italic,
             * which is also what `i` gives, so the attribute looked unread.
             */
            case 'style':
              return ['p', 'b', 'i', 'bi'];
            /*
             * A date field's picture string. `formatDateField` honours a subset of Word's and falls
             * back to the ISO date for anything else — which is right, and means an invented string
             * draws exactly what no string draws, so a field that plainly reads this looked as
             * though it did not.
             */
            case 'format':
              return ['yyyy-MM-dd', 'd MMMM yyyy', 'MMMM d, yyyy', 'dddd', 'HH:mm'];
            default:
              return undefined;
          }
        }
      ),
      // Where a node's *children* land, which is not always the element the node
      // draws as: a table header draws a `<thead>` and holds its cells in a
      // `<tr>` inside it.
      holdsIn: contentTagFrom(registry as never),
      /**
       * Every icon Word's controls ask for, and whether the suite draws it.
       *
       * The declaration rather than the screen: the browser test asserts that nothing
       * *drawn* fell back to its own name, and Word's ribbon has tabs — a control on
       * one nobody opened is declared exactly like a visible one, and a table's
       * controls only appear with a table selected.
       */
      iconsAsked: toolbarIcons(),
      iconDrawn: (name: string) => iconNames().includes(name),
      produces,
      commands,
      /**
       * The attribute check, adopted as a count while it is worked off.
       *
       * 362 of Word's 597 attributes change no drawing. That is not 362 decisions and
       * must not become 362 written reasons — Slides met this harness with sixty-four
       * undrawn node types, adopted it as a number that could only go down, and worked
       * every one of them off. See `Ratchets` for why the number fails in *both*
       * directions.
       *
       * What is in the pile, from reading the list rather than guessing at it:
       *
       * **108 of them came off in one pass** and are the exemptions below: the
       * paginator's, the page-furniture pass's, the image-layout pass's, the three
       * resolvers', the contents page's, and the enumerated attributes whose reader
       * tolerates anything (which the probe cannot demonstrate and which must *not* be
       * closed with `options`, or the validator would reject values the renderer draws).
       *
       * Then **45 more went by deleting them**: `boxBorderAttrs()` handed every block,
       * every table, every cell and every page all seven edge groups, so a page was
       * declared to have interior borders and a cell a between-border. Each kind now
       * gets the edges it has — the office schema's inheritance fault at the attribute
       * level, fixed the same way, and the last time that was done forty-six exemption
       * lines became zero.
       *
       * What is left is 184 — one came off with `fill`, which a `line` has no interior
       * for and which the connector work took out of the shared style list — and
       * reading the list rather than guessing at it, it is
       * four piles — none of which is "somebody forgot a line":
       *
       *   - **40: borders that are declared where they belong and drawn nowhere.** A
       *     block's `borderBetween`, the single line Word draws where two bordered
       *     paragraphs meet — which needs the neighbour, the way `suppressedSpacing`
       *     already asks for one — and a table's `borderInsideH` and `borderInsideV`,
       *     its interior, which needs the cell's position and so belongs with the
       *     per-cell style layers rather than in `applyBorders`. The four `*Space`
       *     values came off this pile: every bordered paragraph in the product had its
       *     line hard against the letters.
       *   - ~~**44: block revisions are recorded and never shown.**~~ **Done**, and it was the
       *     largest pile: `revisionId`, `revisionType`, `revisionAuthor` and `revisionDate` on
       *     eleven node types, written by `revision-record.ts` and read by nothing but
       *     `recordParagraphMerge` checking whether it had already proposed one. A whole feature
       *     written down and invisible — with 변경 내용 추적 on, Backspace at the start of a
       *     paragraph recorded the merge, the author and the date, and the screen showed nothing.
       *     `blockRevision` draws it now: a change bar in the margin in the author's colour, from
       *     the same `authorColor` the marks use, and a struck-through ¶ where a paragraph mark is
       *     the thing being deleted. Accepting and rejecting one is still owed — see BACKLOG.
       *   - **~25: the OMML switches.** `hideSub`, `hideSup`, `hideDegree`, `plcHide`,
       *     `zeroWidth`, `strikeHorizontal`, `noBreak`, `operatorEmulator` and the
       *     rest: the maths model this schema follows, drawn by nothing. There is no
       *     `.docx` converter yet either, so they are not even round-tripped.
       *   - **The rest**, one node each and each its own small answer: a `picture`'s
       *     `alt`, `fill`, `stroke` and `strokeWidth`; a `textBox`'s `wrapType`,
       *     `zOrder` and `horizontalAlign`; a `frame`'s `visible`, `opacity`,
       *     `rotation` and layout attributes (read by `canvas-layout.ts` for the
       *     children, like Slides'); `locked` on seven types, which Slides' commands
       *     read and Word's do not; a `contentControl`'s five; `sectionStart`;
       *     `headerId` and the four other header and footer names, which nothing looks
       *     up; `columnsEqualWidth`, `fitText` and `overlap`, which are in the backlog
       *     with what each is waiting for.
       */
      /**
       * Two counts being worked off, and the second one arrived with its own work list.
       *
       * `every-property-can-be-edited` asks which attributes a reader can **set**. Word answered
       * nothing at all until `Control.writes` and `ruler-model.ts` existed; with both, its two
       * writing surfaces cover 17 of the 77 attribute names it draws, and the 60 left are not
       * scattered — they are **four dialogs Word has never had**:
       *
       * | owed | names |
       * |---|---:|
       * | borders (`borderTop*` … `borderLeft*`) | 16 |
       * | page setup (page size, margins, columns) | 8 |
       * | a field's own settings (`tag`, `literal`, `sequence`, …) | 12 |
       * | table properties (`cellSpacing`, `hide*`, `noWrap`, `heightRule`) | 7 |
       *
       * plus paragraph spacing (5), and a handful a *drag* writes on a drawing. A ratchet rather
       * than sixty exemptions because none of these is a decision: every one is a control somebody
       * will build, and an exemption saying "owed" sixty times is a hand-kept list wearing a
       * harness's clothes.
       */
      /*
       * **Up by one and by four**, which a ratchet is supposed to make expensive and which is
       * correct here: the shared frame learned `justifyContent` and its four sides, `frameCss`
       * draws them — a navigation bar's `space-between` is Word's frame too — and Word has nowhere
       * to set them, because Word has no panel and no dialogs. Real attributes, really drawn,
       * owed to the sixth dialog rather than regressed.
       */
      ratchet: { 'every-attribute-is-read': 16, 'every-property-can-be-edited': 182 },

      /**
       * Every attribute a reader can **set**, out of Word's two writing surfaces.
       *
       * Word has no property panel — its chrome is a ribbon, a ruler, an overlay for shapes and
       * three read-only panes — so the answer comes from `Control.writes` on the ribbon and from
       * `ruler-model.ts`, which is the only place a paragraph's indents and its tab stops can be
       * changed at all. `notYet: ['every-property-can-be-edited']` was here until both existed.
       */
      editable: [...toolbarAttrs(), ...wordRulerAttrs()],
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
      exempt: {
        /*
         * ── Written by the tracking commands, never typed by a reader ──────
         *
         * These four became *drawn* the day `blockRevision` existed, and being drawn is what puts an
         * attribute in front of `every-property-can-be-edited`. They are not properties: nobody sets
         * a revision's author in a panel, `tracking-commands.ts` stamps all four when a reader edits
         * with 변경 내용 추적 on. A control that let a reader type an author into a revision would be
         * a control that lets them forge one.
         *
         * A reason rather than a bigger ratchet, because a ratchet is a count that has to come down
         * and this is a decision that does not.
         */
        /*
         * ── Owed to a dialog Word has never had ───────────────────────────
         *
         * Both arrived in front of this check the day they started being *drawn*, which is the check
         * working: an attribute that starts being drawn starts needing an answer to *who sets it*.
         * They belong to Format Picture, which is not among the four dialogs the note above lists
         * only because nothing drew a picture's alt text or its fit until now.
         */
        'picture.alt': 'Format Picture → Alt Text, a dialog Word has not got yet — drawn as the `aria-label` of the SVG image',
        'picture.fit': 'Format Picture → Size, the same dialog — drawn as the image’s `preserveAspectRatio`',
        /*
         * And the two a **text box** started saying the same afternoon. Word sets both from Format
         * Shape → Layout — where the box is anchored, and how the text behaves around it — and this
         * product has an overlay that drags a shape on a *canvas* and nothing at all for a box
         * anchored in the flow. A surface rather than a dialog, and in the backlog as one.
         *
         * `width` and `height` are **not** here: the ruler already writes them, which is the answer
         * this check wants and the reason a written exemption for them went stale the moment it was
         * added.
         */
        /*
         * And the three a **frame** started drawing the same afternoon. The overlay drags and
         * resizes a box on the canvas; hiding one, fading one and turning one are the three things
         * it has no handle for, on a frame or on any other shape — see BACKLOG.
         */
        'frame.visible': 'the canvas overlay has no handle for hiding a box yet — see BACKLOG',
        'frame.opacity': 'the canvas overlay has no handle for fading a box yet — see BACKLOG',
        'frame.rotation': 'the canvas overlay has no rotation handle yet — see BACKLOG',

        /*
         * And the five a **content control** started drawing the same afternoon. Word sets every one
         * of them from Developer → Properties, a dialog this product has never had — which is why
         * the sample writes them and no reader can. A control a *template author* sets up and a
         * reader fills in is the shape of the feature, and the author's half is what is missing.
         */
        /*
         * And the two a **table** started drawing the same afternoon. Both belong to Table
         * Properties, which is one of the four dialogs the note above already lists as owed — a
         * reader can drag a column edge on the ruler and cannot say `fixed` or state a grid.
         */
        'bTable.grid': 'Table Properties → Column, a dialog Word has not got yet — drawn as the table’s `<col>` widths',
        'bTable.layout': 'Table Properties → Table, the same dialog — drawn as `table-layout`',

        /*
         * A **section's name** and a **paragraph's hint**, both drawn now and neither settable. The
         * section's belongs to page setup, which is already on the owed list; the paragraph's belongs
         * to whatever surface makes a template, which is the same thing a content control's
         * properties want and is one gap rather than two.
         */
        /*
         * ── The **equation tools' properties**, which Word has not got ─────
         *
         * All twenty arrived in front of this check the same afternoon, because that is the afternoon
         * they started being *drawn*. Word sets every one of them from the ribbon's equation tools —
         * a matrix's alignment and gaps, whether an n-ary sign shows its limits, which alphabet a run
         * of letters is in — and this product has `math-commands.ts`, which builds the constructs,
         * and no surface at all for what a construct is *set* to.
         *
         * One gap and not twenty: the reason is the same for every line, and each one goes stale on
         * the day that surface exists. A ratchet would be the wrong shape — it is a count that has to
         * come **down**, and these went up because more is drawn than was.
         */
        'mathArray.maxDistance': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathArray.objectDistance': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathBorderBox.strikeHorizontal': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathBorderBox.strikeVertical': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathBox.differential': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathBox.noBreak': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathBox.operatorEmulator': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathDelimiter.separator': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathDelimiter.shape': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathMatrix.columnAlignment': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathMatrix.columnGap': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathMatrix.plcHide': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathMatrix.rowGap': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathNary.grow': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathNary.hideSub': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathNary.hideSup': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathPhantom.zeroAscent': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathPhantom.zeroDescent': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathPhantom.zeroWidth': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathRun.script': 'the equation tools’ properties, which Word has not got — see BACKLOG',

        /*
         * Three more **names**, and a field switch, all drawn the same afternoon and none settable.
         *
         * A name is what a layer list shows and what a screen reader announces, and this product has
         * no layer list for a document's canvas — the deck has one and Word does not. `useHyperlink`
         * belongs to a field's own settings, which is already on the owed list above.
         */
        'frame.name': 'a layer list, which a document’s canvas has not got — drawn as the box’s accessible name',
        'group.name': 'a layer list, which a document’s canvas has not got — drawn as the group’s accessible name',
        'fieldRef.useHyperlink': 'a field’s own settings, a dialog Word has not got — drawn as whether the reference is a link',
        'mathRun.style': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathFraction.type': 'the equation tools’ properties, which Word has not got — see BACKLOG',
        'mathRadical.hideDegree': 'the equation tools’ properties, which Word has not got — see BACKLOG',

        'surface.name': 'page setup, a dialog Word has not got yet — drawn as the section’s accessible name',
        'paragraph.placeholder': 'a template author’s surface, which Word has not got — drawn by `text.css` while the paragraph is empty',

        'contentControl.id': 'Developer → Properties, a dialog Word has not got yet — drawn as `data-control-id`',
        'contentControl.title': 'Developer → Properties — drawn as the region’s accessible name',
        'contentControl.controlType': 'Developer → Properties — drawn as `data-control-type`',
        'contentControl.placeholder': 'Developer → Properties — drawn by `text.css` while the control is empty',
        'contentControl.lockContent': 'Developer → Properties — drawn as `contenteditable="false"`, and refused by the typing gate',

        /* And the side a floating box goes to, which the same surface would set. */
        'textBox.horizontalAlign': 'Format Shape → Layout, the same surface — which side the box floats to',
        'textBox.anchorTo': 'Format Shape → Layout, a surface the flow has no overlay for yet — see BACKLOG',
        'textBox.wrapType': 'Format Shape → Layout, the same surface — how the text behaves around the box',


        revisionId: 'stamped by `tracking-commands.ts` when a reader edits with tracking on; a reader never sets one',
        revisionType: 'stamped by `tracking-commands.ts` — what the edit was, not a property somebody chooses',
        revisionAuthor: 'the reviewer, from the editor; a control for typing one would be a control for forging one',
        revisionDate: 'when the edit happened, from the clock, for the same reason as the author',

        /*
         * ── Read when a **cell** is drawn, which a bare table has none of ──
         *
         * A table's interior and its cell margins are stated once on the table and applied to every
         * cell: `cellBorders(tableFormat, cellFormat, at)` picks `borderInsideH` for a cell's top and
         * bottom unless it is on the table's own edge, `borderInsideV` for its sides, and
         * `cellMargins(tableFormat)` becomes each cell's padding — which is why they are named
         * `cellMargin*` on the table and `margin*` on the cell.
         *
         * Rendering a bare `bTable` draws a `<table>` and no cells, so the check has nothing for the
         * value to change. The same shape as the header ids below, and the same answer.
         *
         * The **cells'** copies of `borderInside*` were a different matter and are gone: a cell has no
         * interior in this model, because merging removes the cells it swallowed. See
         * `tableCellFormatAttrs`.
         */
        'bTable.borderInsideHStyle': 'drawn by `cellBorders` on each cell’s top and bottom, unless the cell sits on the table’s own edge',
        'bTable.borderInsideHColor': 'drawn by `cellBorders` on each cell’s top and bottom, unless the cell sits on the table’s own edge',
        'bTable.borderInsideHWidth': 'drawn by `cellBorders` on each cell’s top and bottom, unless the cell sits on the table’s own edge',
        'bTable.borderInsideHSpace': 'part of the border `cellBorders` draws on each cell; a bare table has no cells to draw it on',
        'bTable.borderInsideVStyle': 'drawn by `cellBorders` on each cell’s sides, unless the cell sits on the table’s own edge',
        'bTable.borderInsideVColor': 'drawn by `cellBorders` on each cell’s sides, unless the cell sits on the table’s own edge',
        'bTable.borderInsideVWidth': 'drawn by `cellBorders` on each cell’s sides, unless the cell sits on the table’s own edge',
        'bTable.borderInsideVSpace': 'part of the border `cellBorders` draws on each cell; a bare table has no cells to draw it on',
        /*
         * **What of a table style this table wants** — `firstRow`, `lastColumn`, banded rows and the
         * rest, which `regionsAt` and `rowRegionsAt` read when a **cell** or a **row** is drawn.
         * `parseTableLook` takes both spellings a document can carry: the names a person writes and
         * the bitmask a `.docx` does. Rendering a bare `bTable` draws neither a row nor a cell, so
         * there is nothing for the value to change — the same shape as its neighbours here.
         */
        'bTable.look': 'read by `regionsAt` and `rowRegionsAt` when a cell or a row is drawn; a bare table has neither',

        /*
         * **Which of two stacked boxes is on top**, which only means something for a box that has
         * left the flow: two floats are ordered by where they are, and a `z-index` on them would say
         * something the document did not. `textBoxCss` reads it in the `behind` and `inFront`
         * branches only, and the probe fills `wrapType` with the first value it is told — `square`,
         * which floats. Telling it `behind` first would hide `horizontalAlign` instead: one filler,
         * one value, and this family has two switches that cannot both be on.
         */
        'textBox.zOrder': 'read by `textBoxCss` for a box that has left the flow; the probe fills `wrapType` with `square`, which has not',

        'bTable.cellMarginTop': 'becomes every cell’s `marginTop` through `cellMargins`, under the cell’s own',
        'bTable.cellMarginBottom': 'becomes every cell’s `marginBottom` through `cellMargins`, under the cell’s own',
        'bTable.cellMarginLeft': 'becomes every cell’s `marginLeft` through `cellMargins`, under the cell’s own',
        'bTable.cellMarginRight': 'becomes every cell’s `marginRight` through `cellMargins`, under the cell’s own',

        /*
         * ── Read by the page renderer, which a bare render cannot reach ────
         *
         * `renderers/page.ts` builds a `FurnitureBinding` out of these five and hands it to
         * `furnitureFor`, which picks the header or footer for each page in Word's order: the title
         * page's if this is the first and the section asks for one, the even one if the page number
         * is even and it asks for that, otherwise the ordinary one. It is read, drawn and covered by
         * `word-page-furniture.spec.ts`.
         *
         * The check cannot see it because the whole branch is behind `if (doc && layout)`: a header
         * repeats on every page, so choosing one needs a **paginated layout**, and rendering a
         * `surface` on its own has no pages to choose between. The same shape as the three `array`
         * attributes below — read somewhere a bare render cannot reach — and the same answer.
         *
         * This sat in the unread pile as *"five names nothing looks up"*, which was wrong. Reading
         * the list is what found it; counting it is what hid it.
         */
        /*
         * ── How the **contents** are set, which needs headings to set ──────
         *
         * A `tableOfContents` renders the headings of its section: `tocEntries` walks the document
         * and the layout says what page each landed on. A bare one draws an empty `nav`, so nothing
         * about how the *entries* are set can change what a probe sees — there are no entries.
         *
         * All three were genuinely unread until now and each in its own way. `leader` — Word's tab
         * leader, one of `dot`, `hyphen`, `underscore`, `middleDot` or `none` — lost to a stylesheet
         * that drew a dotted rule and called the leader *"a viewer concern"*, folding two decisions
         * into one: **which** leader is the document's, and how it is painted is the viewer's.
         * `rightAlignPageNumbers` was always on. `useHyperlinks` was always on, because the click
         * handler matched every `.w-toc-entry` there was.
         *
         * Covered by `word-outline.spec.ts`, which measures the drawn leader and where a press
         * actually takes the reader.
         */
        /*
         * ── A frame's arrangement, which needs a `layoutMode` to arrange by ─
         *
         * `frameCss` reads all four inside the `row`, `column` and `grid` branches and nowhere else,
         * which is right: CSS `align-items` on a box that is not a flex or grid container does
         * nothing, so emitting it would be the drawing claiming something the browser ignores.
         *
         * The probe cannot build that combination. It fills every *other* attribute from the
         * schema's own values and takes the first — and `layoutMode`'s first option is `none`, which
         * is the value that switches this family off. Deliberately the schema's order rather than
         * one arranged to suit the probe: `none` is what a frame means when it says nothing, and
         * documenting it second to make a check happy would be the schema describing the tool.
         *
         * `frame-layout.spec.ts` measures all four in a browser, which is where an arrangement is
         * either right or visibly not.
         */
        'frame.alignItems': 'read by `frameCss` inside its `row`, `column` and `grid` branches; the probe fills `layoutMode` with its first option, `none`',
        'frame.justifyContent': 'read by `frameCss` inside its `row`, `column` and `grid` branches; the probe fills `layoutMode` with `none`',
        'frame.gap': 'read by `frameCss` inside its `row`, `column` and `grid` branches; the probe fills `layoutMode` with `none`',
        'frame.columns': 'read by `frameCss` in its `grid` branch; the probe fills `layoutMode` with `none`',

        'tableOfContents.leader': 'drawn on each entry, and a bare table of contents has no entries — see `word-outline.spec.ts`',
        'tableOfContents.rightAlignPageNumbers': 'decides whether an entry’s leader grows; a bare table of contents has no entries',
        'tableOfContents.useHyperlinks': 'read by the entry’s drawing and by the app’s click handler; a bare table of contents has no entries',

        /*
         * And the **page border**, for the same reason one step over: it is drawn on each *sheet*,
         * because that is where a page border is — inside the paper's edge, once per page — and the
         * sheets come from the layout. A bare `surface` draws no sheets.
         *
         * `pageSetupAttrs` has carried `boxBorderAttrs()` since the schema was written and `pageCss`
         * has known how to draw them for just as long, and **nothing ever called `pageCss`** — it was
         * exported from `index.ts` and reachable from a console. `pageBorderCss` is the part a sheet
         * wants: handing a sheet the whole of `pageCss` puts a width and a padding on something that
         * already has both.
         */
        'surface.borderTopStyle': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderTopColor': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderTopWidth': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderTopSpace': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderBottomStyle': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderBottomColor': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderBottomWidth': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderBottomSpace': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderLeftStyle': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderLeftColor': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderLeftWidth': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderLeftSpace': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderRightStyle': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderRightColor': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderRightWidth': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',
        'surface.borderRightSpace': 'drawn on each sheet by `pageBorderCss`; a bare surface has no sheets',

        headerId: 'read by `renderers/page.ts` through `furnitureFor`, which needs a paginated layout a bare render has no pages for',
        footerId: 'read by `renderers/page.ts` through `furnitureFor`, which needs a paginated layout a bare render has no pages for',
        firstPageHeaderId: 'the title page’s header, chosen by `furnitureFor` when the section’s `titlePage` switch is on',
        firstPageFooterId: 'the title page’s footer, chosen by `furnitureFor` when the section’s `titlePage` switch is on',
        evenPageHeaderId: 'the even-page header, chosen by `furnitureFor` when `differentOddEven` is on',
        evenPageFooterId: 'the even-page footer, chosen by `furnitureFor` when `differentOddEven` is on',

        /**
         * **Word does not number a list by the node it sits in.**
         *
         * `list-commands.ts` writes `numId` on each block and puts the definition in `resources` —
         * which is Word's model, and the reason two lists can share a numbering and a third can
         * restart it. `type` on the `list` node is what the *shared* `toggleBulletList` /
         * `toggleOrderedList` write, and it is drawn as a fallback for a product with no numbering
         * definitions at all (see `listTypeOf`). Word has them, so its marker always comes from the
         * definition and a control for setting this would be a second, quieter answer to a question
         * the ribbon already answers.
         *
         * It arrived in front of this check the day the fallback existed, which is the check working:
         * an attribute that starts being drawn starts needing an answer to *who sets it*.
         */
        'list.type': 'Word numbers a list from a `numId` definition in `resources`; `type` is the shared toggles’ fallback for a product with none',

        // ── Marks read by something that is not a renderer ─────────────────
        /**
         * A comment's range, drawn by the **overlay** rather than by the text: the highlight follows
         * the pane's selection and has to sit above the page, not inside the run. `comments.ts`
         * collects them and `comment-commands.ts` resolves them; the mark is where they are.
         */
        commentRef: 'read by `comments.ts` and drawn by the overlay, which highlights a thread’s range above the page',
        /**
         * A place a cross-reference points at. The **anchor node** (`bookmarkAnchor`) is what is
         * drawn — an empty inert span the caret cannot sit in — and the mark is the range it names.
         * A bookmark that drew something would be a bookmark a reader could see, which is the one
         * thing a bookmark must not be.
         */
        bookmark: 'a range a cross-reference names; `bookmarkAnchor` is the thing that is drawn, deliberately invisibly',
        /**
         * "Do not spell-check this." There is nothing to draw and there must not be: the whole point
         * is that the words look exactly like the words around them.
         */
        noProof: 'tells a spell-checker to leave the run alone — a drawing would defeat it',
        /**
         * **"I have decided where this goes"**, which is a fact about editing rather than about
         * drawing — the deck's copy of this file says the same thing about the same attribute.
         *
         * Word read it nowhere: a shape a reader locked could still be dragged, nudged, resized,
         * aligned, spread and deleted. `_movable` in `canvas-shape-commands.ts` asks now, and every
         * one of those commands comes through it — `_resizable` calls it, `deleteShapes` calls it
         * with a distance of one, and the align and spread commands read the same list.
         *
         * A drawing that changed would be a shape that looks different from the one beside it for a
         * reason about editing. What *should* change is the overlay, which draws no handles on a
         * locked box — and Word's does not know yet. See BACKLOG.
         */
        /*
         * The other half of a content control's pair, and read the same way `locked` is: by a
         * command rather than by a drawing. `deleteNode` refuses a node inside a region the document
         * says may not be removed — the same walk `lockContent` got on the typing path, in
         * `editor-core` now because both layers need it and neither can reach the other.
         *
         * A drawing that changed would be a region that looks different for a reason about editing,
         * which is the same argument `locked` makes below.
         */
        lockDelete:
          '`deleteNode` refuses a node inside it — `insideLockedRegion(store, sid, \'lockDelete\')`, the same walk the typing gates make about `lockContent`',
        locked:
          'the canvas shape commands — `moveShapes`, `resizeShapes`, `deleteShapes` and the align and spread commands all refuse a locked shape, through `_movable`',

        /*
         * ── The three the probe could not ask about until it was taught their shape ──
         *
         * `array` attributes, all three, and all three read somewhere a bare render cannot reach.
         * Before the probe was taught what one looks like the check answered "cannot be asked" and
         * skipped them **without counting**, so `examined: 600` read as coverage over eleven
         * questions nobody had asked.
         */
        /**
         * Read by the **tab layout pass** (`tab-layout.ts`), which measures where each tab lands in
         * a laid-out line and puts the widths into the environment the renderer draws from — so the
         * renderer reads a `Map` on the env rather than the attribute. A bare paragraph has no line
         * to measure. The ruler reads the stops too, which is where a reader drags them.
         */
        tabs:
          'read by the tab layout pass, which measures a laid-out line and puts the widths on the env — and by the ruler, which draws the stops',
        /**
         * Read by `imageLayoutCss`, but **only when `wrap` is `tight`** — it becomes `shape-outside`,
         * and that is the whole difference between tight and square. The probe sets every other
         * attribute to one value each, so it cannot make the one combination in which this means
         * anything. Held in `office-text`'s `image-layout.test.ts`.
         */
        wrapPolygon:
          'read by `imageLayoutCss` as `shape-outside`, but only when `wrap` is `tight` — a combination the probe cannot make',
        /**
         * A **deck's** mechanism, declared in the canvas vocabulary Word inherits. Word installs no
         * variable resolution at all: a shape on a Word drawing takes its colours directly, and
         * there is nothing in a Word document for a binding to point at.
         */
        varBinds:
          'the deck’s: a shape binding an attribute to a document variable. Word has no document variables and installs no resolution for them',

        /*
         * What a child asks of the frame that arranges it. Read by `layoutChildren` in this
         * package — the canvas is Word's, and a frame is reachable through `canvasBlock` — and a
         * box with no arranging frame around it draws the same either way, which is what this
         * check measures.
         */
        /*
         * ── A button, for the product that shows a deck ────────────────────
         *
         * A shape a reader *presses* to be shown another page. Read by Slides' `jump.ts` and by
         * its show; a Word page is not presented, and a link in a document is the `link` mark on
         * words rather than a box you press. Declared on the shared canvas attributes because
         * the canvas is shared — the same reason the component bindings are here.
         */
        goTo: 'a deck’s button — the page it shows, read by Slides’ `jumpsOn`/`jumpTarget`; a Word page is not presented',
        goToKind: 'the same, for the presses with no page to name (다음/이전/처음/끝/돌아가기)',
        goToDeck: 'the same, for a button whose page is in another document',
        /*
         * How a deck is moved through — by pressing on, or by its links only. A Word document has
         * no show to advance, and the setting is on `document` because it cannot be answered per
         * page (a deck where half the pages advance and half do not is unpresentable).
         */
        'document.advance':
          'how a deck is moved through, read by Slides’ show, map and check; a Word document is not presented',
        'surface.id':
          'a page’s durable name, so a button can point at it across a save (`slideById`). Nothing in a Word document points at a page, and nothing in either product’s drawing reads it',
        layoutStretch: 'the arrangement — `layoutChildren` gives a stretched child the frame’s room across the axis',
        layoutGrow: 'the arrangement — the same, sharing what is left along the axis',
        slot:
          'components — where a reader’s own boxes go inside a placement, read by `componentApplyPlan` so apply does not take them out. Word has no library',

        // ── Attributes read by something that is not a renderer ────────────
        /**
         * `every-attribute-is-read` asks the drawing, because that is the answer it
         * can take from the product rather than from a claim about it. Word reaches
         * the page through more than its renderers — a paginator, a page-furniture
         * pass, an image-layout pass, three resolvers — and every one of those looks
         * like nothing to a check that renders a node twice.
         *
         * Keyed by the **attribute** rather than by the node (`Finding.family`), because
         * that is the size these decisions are: `keepNext` is the paginator's on a
         * paragraph, a heading and a list item alike. Each was verified by reading the
         * reader; the ones with no reader at all are in the ratchet above, not here.
         */

        // The paginator's, and the renderer says so: "pagination properties are not
        // emitted: they are instructions to a paginator, and a browser that honours
        // `break-inside` in a scrolling view would produce something that is neither
        // paginated nor continuous" (`css.ts`).
        keepNext: 'the paginator — `pagination.ts` and `measurement.ts`; deliberately not emitted as CSS',
        keepLines: 'the paginator — the same, for a block that may not be split across a page',
        pageBreakBefore: 'the paginator — the break it makes before measuring',
        widowControl: 'the paginator — never one line left behind or ahead',
        cantSplit: 'the paginator — `table-pagination.ts`, a row that may not be split',
        isHeader: 'the paginator — `table-pagination.ts` repeats it at the top of each page',
        contextualSpacing:
          'the space between two blocks of the same style, which `spacing.ts` answers and `blockStyle` applies the result of — the attribute is read one step away from the drawing',
        /*
         * Word's **fifth border**, and the same shape as `contextualSpacing` beside it: a run of
         * consecutive paragraphs asking for the same borders is one bordered box, so the line between
         * two of them is drawn instead of each one's own edge. `sharedBorders` answers whether this
         * block's neighbour is in the box and `blockStyle` applies the result — so the attribute is
         * read one step away from the drawing, and a probe rendering a **bare** paragraph has no
         * neighbour for it to share an edge with.
         *
         * It was genuinely unread until this: the comment over `betweenBorderAttrs` said *"Nothing
         * draws it here yet."* and it stayed true, so every bordered pair in the product had two
         * solid lines between it with the margin showing through. Word's sample had no bordered
         * paragraph at all, which is why nothing could see it.
         */
        borderBetweenStyle:
          'the line between two blocks in one bordered box, which `sharedBorders` answers and `blockStyle` applies — a bare paragraph has no neighbour to share an edge with',
        borderBetweenWidth:
          'the line between two blocks in one bordered box, which `sharedBorders` answers and `blockStyle` applies — a bare paragraph has no neighbour to share an edge with',
        borderBetweenColor:
          'the line between two blocks in one bordered box, which `sharedBorders` answers and `blockStyle` applies — a bare paragraph has no neighbour to share an edge with',
        borderBetweenSpace:
          'part of the between border `applyBorders` draws; a bare paragraph has no neighbour to share an edge with',
        mirrorIndents:
          '`css.ts`, but only once the layout says which page the block landed on: an inside indent is the binding edge, and that changes side every page. The probe renders no pages',
        suppressAutoHyphens:
          '`hyphenationCss`, and only when the *document* has hyphenation on — a paragraph saying no to something only the document can have said yes to. The probe renders against an empty document',

        /**
         * What the shared **canvas** attributes declare for components.
         *
         * A card's part carries its own durable name, which is what a binding names — read where a
         * placement's children are resolved (`instance-parts.ts` in the deck, `canvas-model.md`
         * §10b-2a). `partOf` and `appliedFrom` stood beside it and are gone with the copies they
         * were about, which is why this list is one line shorter than it was.
         *
         * Exempted here rather than moved out of the shared group, because Word's canvas is
         * the same canvas: the day it has components it reads this, and this claim goes
         * stale and says so.
         */
        partId:
          'the deck’s components — a definition part’s durable name, which a binding names. Word’s canvas has no components yet',

        // The gutter down the side of the page.
        suppressLineNumbers: 'the line-number gutter — `line-numbers.ts`',
        lineNumberingCountBy: 'the line-number gutter — `line-numbers.ts`',
        lineNumberingDistance: 'the line-number gutter — `line-numbers.ts`',
        lineNumberingRestart: 'the line-number gutter — `line-numbers.ts`',
        lineNumberingStart: 'the line-number gutter — `line-numbers.ts`',

        // The page itself. A surface draws its sheets from `layout.metrics`, so the
        // page geometry is read where the pages are computed.
        marginTop: 'the page the paginator measures — `layout.ts`',
        marginBottom: 'the page the paginator measures — `layout.ts`',
        marginGutter: 'the page the paginator measures — `layout.ts`, the room for the binding',
        orientation: 'the page the paginator measures — `layout.ts`',
        'surface.width': 'the page the paginator measures — `layout.ts`; the surface draws its sheets from `layout.metrics`',
        'surface.height': 'the page the paginator measures — `layout.ts`',
        marginHeader: 'the page furniture — `page-furniture.ts` places the header in it',
        marginFooter: 'the page furniture — `page-furniture.ts`',
        pageNumberStart: 'the page furniture — `page-furniture.ts` numbers the pages',
        pageNumberFormat: 'the page furniture — `page-furniture.ts` and `chapter-numbering.ts`',
        pageNumberChapterStyle: 'the page furniture — `chapter-numbering.ts` prefixes the chapter',
        pageNumberChapterSeparator: 'the page furniture — `chapter-numbering.ts`',
        titlePage: 'the page furniture — a first page with its own header',
        differentOddEven: 'the page furniture — odd and even pages with their own headers',

        // Where a floating image sits. The renderer draws the answer, not the question.
        distanceTop: 'the image-layout pass — `image-layout.ts` wraps the text around it',
        distanceBottom: 'the image-layout pass — `image-layout.ts`',
        distanceLeft: 'the image-layout pass — `image-layout.ts`',
        distanceRight: 'the image-layout pass — `image-layout.ts`',
        offsetX: 'the image-layout pass — `image-layout.ts`',
        offsetY: 'the image-layout pass — `image-layout.ts`',
        shapeMargin: 'the image-layout pass — `image-layout.ts`, the room CSS shape-outside leaves',
        side: 'the image-layout pass — `image-layout.ts`, which side of the text it floats to',

        // Resolved through a definition that lives in the document. The probe renders
        // against an empty one, so the resolver has nothing to resolve *with* — the
        // attribute is read, and the answer needs a document the check does not build.
        numId: 'the numbering resolver — `numbering-resolver.ts`; the definition is in the document',
        numLevel: 'the numbering resolver — how deep in the definition it is',
        styleId: 'the style cascade — `style-resolver.ts`; the definition is in the document',

        // The contents page is built *from* these, rather than drawn by the node.
        caption: 'the contents page — `toc.ts` builds it',
        levels: 'the contents page — which heading levels it lists',
        styleFilter: 'the contents page — which styles it collects',
        showPageNumbers: 'the contents page — `toc.ts`',
        outlineLevel:
          'the contents page and the outline pane — `toc.ts` and `outline-pane.tsx`, which is how a paragraph joins the contents without looking like a heading',

        // Table banding: read by the style resolver's table layers.
        columnBandSize: 'the table style — `table-style.ts` bands the columns',
        rowBandSize: 'the table style — `table-style.ts` bands the rows',

        /**
         * ── Enumerated attributes whose reader tolerates anything ──────────
         *
         * The probe cannot invent a legal value for a set nobody declares, and it must
         * not: a made-up `borderTopStyle` draws as solid — `BORDER_STYLE[style] ??
         * 'solid'` — so the drawing is the same as with no border style at all, and the
         * check calls it unread.
         *
         * Slides' half of this is fixed rather than exempted: `gradientKind` declares
         * `options` and the probe tries every one. That works because the set is
         * **closed**. These readers are deliberately open, and declaring a closed set
         * here would make the validator reject values the renderer draws — the schema
         * being stricter than the product is a worse fault than a check that cannot
         * see.
         */
        alignment:
          'read — `TEXT_ALIGN` in `css.ts` — but only for a value in the map, and the probe has no legal one to try. A table’s and a row’s have no per-row shape in CSS at all (`renderers.ts`)',
        textDirection: 'read — `css.ts` for `rtl`, `verticalTextCss` for Word’s `tbRl` family — and the probe has no legal value to try',
        widthType: 'read — `css.ts` and `table-format.ts` — where `pct` is the value that changes anything',
        'surface.borderTopStyle': 'read — `borderCss` — for a style in `BORDER_STYLE`; a page border is drawn from the same code as every other',
        'surface.borderBottomStyle': 'read — `borderCss` — for a style in `BORDER_STYLE`',
        'surface.borderLeftStyle': 'read — `borderCss` — for a style in `BORDER_STYLE`',
        'surface.borderRightStyle': 'read — `borderCss` — for a style in `BORDER_STYLE`',
        shadingPattern:
          'read — `shadingCss` — and Word’s stipple vocabulary is open: `pct5` to `pct95` and a dozen named patterns, too many to declare and wrong to close',
        shadingColor:
          'read — `shadingCss` — but only beside a pattern that is not `clear`, and the probe has no legal pattern to pair it with',

        // ── One node, not the attribute everywhere ─────────────────────────
        'bTableRow.cellSpacing':
          'read on the table (`table-format.ts`); a row has no per-row shape in CSS, which `renderers.ts` says where it draws one',

        // ── Commands that put no node in the document ──────────────────────
        // Named `insert…` because that is what they do to the *text*, which is
        // what the completeness check cannot tell from a name and why it asks.
        insertText: 'writes characters into a run; makes no node',
        insertMention: 'applies a mark over a range, not a node',
        insertFootnoteRef: 'a mark over a range, not a node',
        insertEndnoteRef: 'a mark over a range, not a node',
        insertFieldPageNumber: 'a mark over a range, not a node',
        insertFieldPageCount: 'a mark over a range, not a node',
        insertFieldDateTime: 'a mark over a range, not a node',
        insertFieldDocTitle: 'a mark over a range, not a node',
        insertFieldAuthor: 'a mark over a range, not a node',

        // ── Where the frame exemptions went ────────────────────────────────
        // Eight pairs used to be listed here — `frame > rectangle`, `group >
        // frame` and six more — each carrying one sentence: in Word a frame is a
        // `<div>` and a drawing is SVG, so neither can hold the other. Eight
        // copies of a fact about what a Word frame may contain, written in the
        // file that records things a check cannot know.
        //
        // A check could know it. `word-schema.ts` now declares `frame` as
        // `block+` and `group` as `scene+`, so the pairs no longer exist to be
        // exempted and a document that tries one is refused when it is written
        // rather than drawn as a blank space. An exemption that can be turned
        // back into a rule was never really an exemption.

        // ── The other half of a `surface` ──────────────────────────────────
        // `office-schema` declares `surface` as `block+ | scene*` — a page
        // holds blocks, a slide or a board holds scene nodes — and Word is the
        // product for the first half.
        //
        // These reasons used to read "Word has no canvas surface", which is true
        // and about the wrong thing: Word has a canvas *block*, `canvasBlock`
        // holds `scene*`, and every one of these is a scene node. A Word
        // document could hold a frame full of shapes and draw a blank space
        // where they were. `frame` and `group` are drawn now; what is left is
        // exempt for reasons that are actually about Word.
        // Six of these appeared the day `drawnTagFrom` started calling renderers
        // the way the DSL calls them — `(props, node, ctx)` rather than one
        // argument. Every component that reads its own node threw on `undefined`
        // and came back as "cannot say", so `surface` had no tag and none of its
        // pairs was ever examined. The check was not passing; it was abstaining,
        // and its `examined` count said so to nobody.
        'surface > group': 'a page holds blocks; the scene half of `surface` is a slide’s',
        'surface > rectangle': 'a page holds blocks; the scene half of `surface` is a slide’s',
        'surface > ellipse': 'a page holds blocks; the scene half of `surface` is a slide’s',
        'surface > line': 'a page holds blocks; the scene half of `surface` is a slide’s',
        'surface > picture': 'a page holds blocks; the scene half of `surface` is a slide’s',
        'surface > path': 'a page holds blocks; the scene half of `surface` is a slide’s',

        sticky: 'a board note, which is flow content on a canvas; see `textFrame`',
        connector: 'a board arrow between two nodes; Word has no board',
        textFrame:
          'rich text on a canvas needs a `foreignObject`, and caret placement, ' +
          'selection and IME inside one are unreliable across browsers — the same ' +
          'reason Slides draws its slides as HTML rather than as one SVG',
        instance: 'a placement of one; Word has no components',
        /**
         * ── The document's **library** ─────────────────────────────────────
         *
         * The office schema declares `components` beside `resources` because the component
         * model is the *suite's*: `component`, `instance` and the shared canvas attributes
         * were always in the schema both products read. Slides is the product that has one.
         *
         * A page could have one — a reusable figure, a bordered callout — and when it does
         * these come off, which is exactly what an exemption being a checked claim is for.
         */
        components: 'the document’s library of definitions; Word has none to keep',
        component: 'a definition; Word has no library',
        componentVar: 'what a placement of a definition can be asked for; Word has no definitions',
        componentValue: 'what one placement answers; the same',
        /**
         * ── The document's own **named values** ────────────────────────────
         *
         * Declared in the same shared schema and for the same reason: "this document's accent, its
         * company name, its quarter" is a sentence about a document rather than about a deck, so a
         * page will want them the day anything in Word can take a reference. The *model* is already
         * shared (`canvas-variable.ts` in this package); what Word has none of is a **drawing** —
         * these two nodes draw as nothing anywhere, and a product that never shows a panel of them
         * has nothing to hide.
         */
        variables: 'the document’s named values; Word draws none of them and offers no panel yet',
        variable: 'one named value; the same — and it is never drawn on a canvas either, only in a panel',
        /**
         * Which piece of a definition takes which variable.
         *
         * A **declaration node** rather than attributes on the parts, which is what took three
         * exemptions off this list: `bindText`, `bindFill` and `bindVisible` were on every canvas
         * node in the shared vocabulary and read by nothing here. A variable can now drive anything
         * a part declares, and Word exempts one node type instead of three attributes.
         */
        componentBind: 'which piece of a definition takes which variable; Word has no definitions',

        // ── Where the inherited write-offs went ────────────────────────────
        // Twenty-three lines used to sit here: thirteen marked `BUG:` — a
        // `callout` a reader could insert and nothing would draw, and twelve
        // more like it — and ten marked "inherited from the standard schema".
        //
        // Slides wrote the same twenty-three. Identical, measured: both products
        // draw exactly the same standard node types and write off exactly the
        // same ones. One product's list is an opinion; two identical lists are
        // the *schema* claiming things this domain does not offer.
        //
        // `OFFICE_STANDARD_NODES` names what an office document is made of, so
        // office no longer declares a callout, a description list, a video or a
        // disclosure block. They are still in the standard schema for a product
        // whose domain is the web. Nothing here needs a reason any more, because
        // there is nothing left to explain.

        // ── Drawn by something other than a renderer ───────────────────────
        // A footnote is drawn at the foot of the page its reference is on, by
        // the layout pass; a comment is drawn in the pane beside the document,
        // by the app. Both are `resource` nodes — declared out of the flow on
        // purpose — so the registry has nothing for them and should not.
        insertFootnote: 'the body is drawn at the foot of its page by the layout pass',
        insertComment: 'the thread is drawn in the comments pane by the app',
        /**
         * The two the office schema stopped declaring and Word kept.
         *
         * A page number is Word's alone — a slide has no page it is on — so they
         * moved into `word-schema.ts` when office stopped inheriting everything.
         * These two exemptions are what is left of the twenty-three, and unlike
         * the rest they are about how Word draws rather than what Word offers:
         * `page-furniture.ts` resolves both to text while drawing the footer,
         * because the answer depends on which page is being drawn and a renderer
         * is handed a node rather than a page.
         */
        fieldPageNumber: 'resolved to text by the furniture pass, which knows which page it is on',
        fieldPageCount: 'resolved to text by the furniture pass, which knows how many pages there are'
      }
    });

  it('draws what it declares, expects only what it says it expects', () => {
    // One call, every check. A check added to the harness applies here without
    // this file changing — which is the difference between a harness and a
    // thing every product has to remember to assert.
    held();
  });
});
