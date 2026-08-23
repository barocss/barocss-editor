import { describe, it } from 'vitest';
import { assertConforms, attributeReadFrom, contentTagFrom, drawnTagFrom } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { iconNames } from '@barocss/office-icons';
import { nameOfNode } from '@barocss/office-controls';
import { WORD_ENV_KEY, createWordEnv } from '../src/render-context';
import { getWordSchemaDefinition } from '../src/word-schema';
import { createWordEditor } from '../src/word-kit';
import { toolbarIcons } from '../src/toolbar-model';
import { getGlobalRegistry } from '@barocss/dsl';
import { registerWordRenderers } from '../src/renderers';

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
    { command: 'insertRowAbove', produces: 'bTableRow' },
    { command: 'insertRowBelow', produces: 'bTableRow' },
    { command: 'insertColumnLeft', produces: 'bTableCell' },
    { command: 'insertColumnRight', produces: 'bTableCell' },
    { command: 'insertBookmark', produces: 'bookmarkAnchor' },
    { command: 'insertFootnote', produces: 'footnoteDef' },
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
       *   - **44: block revisions are recorded and never shown.** `revisionId`,
       *     `revisionType`, `revisionAuthor`, `revisionDate` on eleven node types.
       *     `revision-record.ts` writes all four; the only thing that reads any of them
       *     is `recordParagraphMerge`, checking whether it already proposed one.
       *     Nothing draws a tracked change on a block and nothing accepts or rejects
       *     one — a whole feature written down and invisible.
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
      ratchet: { 'every-attribute-is-read': 184 },

      exempt: {
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
        mirrorIndents:
          '`css.ts`, but only once the layout says which page the block landed on: an inside indent is the binding edge, and that changes side every page. The probe renders no pages',
        suppressAutoHyphens:
          '`hyphenationCss`, and only when the *document* has hyphenation on — a paragraph saying no to something only the document can have said yes to. The probe renders against an empty document',

        /**
         * The two the shared **canvas** attributes declare for components.
         *
         * A placement of a component holds real nodes and each remembers the definition part
         * it came from (`partOf`), and the placement remembers what the definition said when
         * it last took them (`appliedFrom`) — see `canvas-model.md` §10. Both are read by the
         * deck's component apply, and Word's canvas has no components today.
         *
         * Exempted here rather than moved out of the shared group, because Word's canvas is
         * the same canvas: the day it has components it reads these, and this claim goes
         * stale and says so.
         */
        partId:
          'the deck’s component apply — a definition part’s durable name. Word’s canvas has no components yet',
        partOf:
          'the deck’s component apply — a placement’s part remembers the definition part it was copied from. Word’s canvas has no components yet',
        appliedFrom:
          'the deck’s component apply — what the definition said when a placement last took its parts. Word’s canvas has no components yet',

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
