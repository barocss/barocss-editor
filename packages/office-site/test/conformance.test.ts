import { describe, it } from 'vitest';
import { assertConforms, attributeReadFrom, contentTagFrom, drawnTagFrom } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { getGlobalRegistry } from '@barocss/dsl';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSiteEditor, createSiteOwnExtensions } from '../src/site-kit';
import { siteKeyCommands } from '../src/keymap';
import { siteLayerIcons } from '../src/layer-icons';
import { SITE_TOOLBAR, siteToolbarCommands, siteToolbarIcons } from '../src/toolbar-model';
import { sitePanelAttrs, sitePanelCommands } from '../src/panel-model';
import { siteMenuCommands } from '../src/menu-model';

/** Every declared toolbar control, whichever group it is in. */
const siteToolbarControls = () => SITE_TOOLBAR;
import { kindOfBlock } from '../src/selection';
import { SITE_ENV_KEY, createSiteEnv } from '../src/breakpoints';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { iconNames } from '@barocss/office-icons';
import { markAttributes, markCss } from '@barocss/office-text';

/**
 * The site builder, held to what it declares.
 *
 * The third product's run through the harness, and the first one was a **report** on purpose: the
 * point was to find out what the product owed. It owed a lot — 16 undrawn node types, 80 unread
 * attributes, 7 commands a reader could not run — and four of those turned out to be real work
 * rather than exemptions:
 *
 * - `sizing` was declared on `heading`, `paragraph` and `textFrame` and read by nothing, because the
 *   renderer that would read it is `office-text`'s. The schema was **narrowed**: a reader who wants a
 *   hugging heading puts it in a stack that hugs, which is how every auto-layout tool works.
 * - `setOverride` and `clearOverride` were dead the day `setBlockFormat` took a width. Deleted.
 * - The canvas layout extension was installed for an arrangement pass a flow page can never use, and
 *   brought two more commands nobody could run. Removed.
 * - The key map lived in the app, where the check cannot look. It is data in the package now, which
 *   is the only reason `Delete` and `⌘D` count as reachable.
 *
 * Every exemption below is a decision on the record and a *claim*: if one of these grows a renderer
 * or a reader, this fails on the exemption rather than passing quietly.
 */
describe('the site builder draws what it declares', () => {
  registerSiteRenderers();

  const schema = createSchema('site', getSiteSchemaDefinition());
  const registry = getGlobalRegistry();

  const commands = createSiteEditor().commandNames();

  /** The commands *this product* adds, measured rather than listed. */
  const own = (() => {
    const bare = new Set(createSiteEditor({ kit: [] }).commandNames());
    const mine = createSiteEditor({ kit: createSiteOwnExtensions() }).commandNames();
    return mine.filter((name: string) => !bare.has(name));
  })();

  /**
   * What each of the site's insert commands puts in the document.
   *
   * Three, where a deck has eleven and Word twenty-three — a kit is a product's answer to "what can
   * be done here", and a page's answer is short because a page is stacks and text.
   */
  const produces = [
    // The three kinds of stack. One command per shape rather than `insertStack({ layoutMode })`,
    // because a toolbar draws one button per shape and a key map can be read.
    { command: 'insertSection', produces: 'frame' },
    { command: 'insertRow', produces: 'frame' },
    { command: 'insertGrid', produces: 'frame' },
    // And the things that go in one. The product could make three kinds of container and nothing to
    // put in them until these existed.
    { command: 'insertHeading', produces: 'heading' },
    // Not `insertText`, which is the shared kit's name for typing: two commands with one name is one
    // of them unreachable, and this check could not have said which.
    { command: 'insertBodyText', produces: 'paragraph' },
    { command: 'insertPicture', produces: 'picture' },
    { command: 'insertBulletList', produces: 'list' },
    { command: 'insertNumberList', produces: 'list' },
    { command: 'insertQuote', produces: 'blockQuote' },
    { command: 'insertRule', produces: 'horizontalRule' },
    { command: 'insertCode', produces: 'codeBlock' },
    /*
     * A **composition**, and it produces a `frame` — which is the honest answer rather than a
     * shrug. There is no `button` node in this schema and there should not be: a button is a box
     * with a word in it, a colour, a radius, a hit area and an answer to the pointer, and every one
     * of those is something a frame already says. What the command carries is the *arrangement*,
     * which is where a product's taste lives.
     */
    { command: 'insertButton', produces: 'frame' },
    { command: 'insertPlacement', produces: 'instance' },
    { command: 'insertDataList', produces: 'collection' },
    // And the data a list draws, which nothing but TypeScript could make until now.
    { command: 'insertDataset', produces: 'dataset' },
    /*
     * And a **page**, which was in the same position for longer and was less visible for being more
     * obvious: the sample's five pages are five pages because `sample-site.ts` says so. A page is a
     * `surface`, the same node a document's page is — the product decides what it means.
     */
    { command: 'insertPage', produces: 'surface' }
  ];

  /**
   * What a reader can reach, from the product's **own declarations**.
   *
   */
  /*
   * Four surfaces now, and the fourth is why this line is worth reading.
   *
   * `every-command-can-be-reached` reported `exportSite` and `exportPage` the minute they became
   * commands — correctly, because a menubar the harness has not been told about is a menubar that
   * does not exist as far as it is concerned. That is the same finding this file has now had four
   * times: a surface that declares nothing cannot be asked.
   *
   * Which is also what made publishing reachable-by-nothing for weeks and invisible: it was a
   * *function*, and this check counts commands.
   */
  const reachable = [
    ...siteToolbarCommands(),
    ...siteKeyCommands(),
    ...sitePanelCommands(),
    ...siteMenuCommands()
  ];

  /**
   * And every attribute those surfaces can **write**.
   *
   * The other half of the same question, and the one nothing could ask before the panel was a
   * declaration: `setBlockFormat` is reachable and writes 24 fields, so "the command has a control"
   * says nothing about whether all 24 have a row.
   */
  const editable = [
    ...sitePanelAttrs(),
    // What a toolbar control writes directly, rather than through a panel row.
    ...siteToolbarControls().flatMap((control) => Object.keys(control.payload ?? {}))
  ];

  it('draws what it declares, expects only what it says it expects', () => {
    assertConforms({
      schema: schema as never,
      hasRenderer: (nodeType) => registry.has(nodeType),
      drawnAs: drawnTagFrom(registry as never),
      holdsIn: contentTagFrom(registry as never),
      /**
       * What this product calls a node type in a list — the layer panel's rows.
       *
       * `kindOfBlock` and nothing else: it answers nothing for a type it has no word for, which is
       * what lets the check see a missing name. `labelOfBlock` falls back to the stype, and a
       * fallback makes a missing name look like a name.
       */
      nameOf: (type: string) => kindOfBlock(type),
      /*
       * The toolbar's **and the layer list's** — a row in that list asks for a picture the same way
       * a button does, and an icon the suite does not draw comes out as its own name in a 240px
       * column. A product can only be checked on what it writes down.
       */
      iconsAsked: [...siteToolbarIcons(), ...siteLayerIcons()],
      iconDrawn: (name: string) => iconNames().includes(name),
      attributeRead: attributeReadFrom(
        registry as never,
        (type: string) => (schema.nodes.get(type) as { attrs?: Record<string, never> } | undefined)?.attrs,
        /**
         * **At a narrow width**, which is the only environment in which half of this product exists.
         *
         * The probe was handed no environment at all, so every renderer resolved at the base and
         * `overrides` — the whole responsive mechanism — could not change a drawing however it was
         * set. Word learned this first and its comment in `attributeReadFrom` says it: a product
         * hands over what it renders with. The site's is a breakpoint.
         */
        { [SITE_ENV_KEY]: createSiteEnv('mobile'), [WORD_ENV_KEY]: createTextEnv({ rootId: '', getNode: () => undefined } as never) },
        /**
         * And what its `array` values look like.
         *
         * The probe has nothing to invent for an `array`, so it answers "cannot be asked" and the
         * check skips it — right, because a wrong finding costs an afternoon. But the count was
         * nowhere, and `examined: 127` read as coverage over a product with **8** unaskable slots in
         * it, four of them `overrides`.
         */
        (_type: string, attr: string) =>
          attr === 'overrides'
            ? /*
               * `sizing`, and it had to be **something the node type actually draws**.
               *
               * The first probe overrode a `gap`, which is a stack's word: a picture and a placement
               * draw no gap, so the override changed nothing and the check reported two findings
               * about a mechanism that works. A probe value that the node cannot express is a
               * question about the value rather than about the attribute — the same trap the number
               * probe already documents, where four crops near the top of the range crop the picture
               * out of existence and all four look unread.
               *
               * `sizing` is the one thing all four of these draw (`sizingCss`), and `hug` is not the
               * default, so a narrow width saying it is a drawing that differs.
               */
              [{ mobile: { sizing: 'hug' } }]
            : attr === 'varBinds'
              ? // `office-canvas`'s shape — `{ attr, var }`. Given so this becomes an **answer**
                // rather than a skip; the answer is no, and the exemption below says why.
                [[{ attr: 'fill', var: '강조' }]]
              : undefined
      ),
      produces,
      commands,
      own,
      reachable,
      editable,
      /**
       * Whether the product draws anything for a mark — the vocabulary no check could see.
       *
       * Asked the same way `every-attribute-is-read` asks about a node: render text under the mark
       * and again without it, and compare. A mark that contributes nothing to either is one a reader
       * can apply to no effect.
       */
      /**
       * Whether the product draws anything for a mark.
       *
       * Two ways a mark can draw, and the check has to know both: a **template** registered as
       * `mark:<type>` (a link is an `<a>`, and only an element can be one), or an entry in
       * `office-text`'s format tables, which is what turns a `<span class="mark-bold">` into
       * something bold. A mark in neither is a mark a reader applies to no effect — eleven of them
       * were, until this asked.
       */
      markDrawn: (mark: string) =>
        registry.has(`mark:${mark}`) ||
        Object.keys(markCss(mark, { color: '#f00', size: 22, href: '#x' }, undefined)).length > 0 ||
        Object.keys(markAttributes(mark, { lang: 'ko' })).length > 0,
      exempt: {
        // ── A page has no canvas ───────────────────────────────────────────
        /*
         * Eight node types a *slide* is made of and a page has none of. The office schema is one
         * vocabulary for every product, so a site declares them by inheriting them — and a page has
         * no coordinates to put them at. The day a page can hold a canvas, this fails first.
         */
        rectangle: 'a page has no coordinates: a shape is placed on a canvas, and a page stacks',
        ellipse: 'a page has no coordinates: a shape is placed on a canvas, and a page stacks',
        line: 'a page has no coordinates: a shape is placed on a canvas, and a page stacks',
        path: 'a page has no coordinates: a shape is placed on a canvas, and a page stacks',
        connector: 'a connector joins two placed shapes, and a page places nothing',
        sticky: 'a note stuck to a board; a page has no board',
        group: 'a group is a z-order over placed shapes, and a page has neither',
        canvasBlock: 'a canvas embedded in the flow — the one node that would bring the rest back',
        textFrame: 'a text box is a placed box; on a page, text is a block in the column',

        /*
         * A `listItem` directly inside a `listItem`, which the schema permits and no document holds.
         *
         * The permission is `listItem: content 'block+'` and a `listItem` is in the `block` group —
         * so the schema says yes to something a list never does: a nested list goes through a
         * `list`, which draws `<ul>`, and `<li><ul><li>` is exactly what the parser wants. The pair
         * only became visible when the site started drawing real `<li>`s instead of `<div>`s, which
         * is the check working: `<div>` inside `<div>` hid it for as long as a list was not a list.
         */
        'listItem > listItem':
          'a nested list goes through a `list` — `<li><ul><li>` — and a document never holds one `listItem` directly inside another',

        // ── A definition is never drawn; a placement draws it ──────────────
        /*
         * The resources. `installSiteResolution` turns a placement into its definition's parts at
         * draw time, so the definition itself is read and never rendered — and a renderer for one
         * would draw the library on the page, which is the fault the deck's own comment calls "a
         * page of furniture belonging to no design".
         */
        components: 'a library is not on the page: a placement draws the definition (canvas-instance)',
        component: 'a definition is resolved into a placement’s parts, never drawn where it is kept',
        componentVar: 'a question a definition asks; the answer is drawn, the question is not',
        componentBind: 'which part takes which answer — read by the resolver, drawn by nothing',
        componentValue: 'a placement’s answer, read by the resolver and put into the part it names',
        variables: 'named values, read where they are referenced (`var:이름`) and never drawn',
        variable: 'named values, read where they are referenced (`var:이름`) and never drawn',

        // ── Attributes a page has no coordinates for ───────────────────────
        x: 'a page has no coordinates; the browser lays a stack out',
        y: 'a page has no coordinates; the browser lays a stack out',
        width: 'a block is as wide as the column it is in — `sizing` is what a page says instead',
        height: 'a page is as tall as it turns out, which is the whole difference from a sheet',
        rotation: 'nothing on a page is at an angle',
        opacity: 'a canvas idea; a page has no z-order to see through',
        locked: 'a canvas idea: a placed shape a reader cannot grab. A page has no grabbing',
        visible: 'a canvas idea; a page shows what it holds',
        /*
         * A page already has **two** ways to say "this value comes from somewhere else", and this is
         * a canvas's third.
         *
         * - `var:이름` in the attribute itself, resolved at draw time by `office-canvas`'s
         *   `isVarRef` / `resolveVarValue`. That is how every colour on a page follows a token.
         * - `componentBind`, a node inside a definition saying which part takes which of the
         *   definition's answers. That is how a card's title comes from its placement.
         *
         * `varBinds` is the shape's own list, and it exists because a *canvas* has shapes a reader
         * places by hand and binds one at a time — a deck's shape can take its `width` or even its
         * `text` from a variable, which a page never needs: a page's text is text in the flow and a
         * page's width is the column's.
         *
         * So a third mechanism would be a third thing to learn and a third place a value can come
         * from, for nothing a reader could not already say. Written down here rather than left
         * unasked: the check could not ask at all until the probe was handed the shape of a
         * `varBinds`, and an unasked question reads exactly like an answered one.
         */
        varBinds:
          'a page says it with `var:이름` in the attribute, or with `componentBind`; the shape’s own list is the canvas’s third way',
        partId: 'a durable name for a piece of a component definition, read by the binding',
        slot: 'where a placement’s own children go, read by the resolver',
        layoutStretch: 'the canvas’s way of saying `fill`; a page says `sizing`',
        layoutGrow: 'the canvas’s way of saying `fill`; a page says `sizing`',
        goTo: 'a deck’s non-linear jump; a page links with an address (`path`)',
        goToKind: 'a deck’s non-linear jump; a page links with an address (`path`)',
        goToDeck: 'a deck’s non-linear jump; a page links with an address (`path`)',

        // ── Read, but not by a renderer looking at one bare node ───────────
        /*
         * The probe sets one attribute on an otherwise empty node and asks whether the drawing
         * changed. These four are read and the probe cannot see it, which is a limit of the
         * instrument rather than a gap in the product — and each says where the reading is held.
         */
        gap: 'read by `frameCss`, but only with an arrangement: a gap without one is not a length',
        justifyContent:
          'read by `frameCss` for a row or a column; on a bare node there is no axis to distribute along',
        columns: 'read by `frameCss` for a grid; on a bare node there is no grid to have columns',
        limit: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',
        sortBy: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',
        sortDir: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',
        where: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',
        equals: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',
        /*
         * And one that is not a limit of the instrument at all: it is the second thing on a page
         * that is **published as a rule** rather than folded into a drawing, and it is right that a
         * renderer does not read it.
         *
         * A width is resolved before a page is drawn; a pointer never is (`states.ts`). So neither a
         * state nor the time it takes can be part of an element's own style, and asking the probe
         * "did the drawing change" is asking the wrong element. `states` itself never appeared here
         * only because an `object` attribute is unaskable — this one is a number, so the check could
         * ask, and got the honest answer.
         *
         * Where the reading is held is named, and that is what makes this fail the day it stops
         * being true.
         */
        transitionMs:
          'published as a rule, not folded into a drawing: read by `stateRules` and `editorStateCss` — held in `states.test.ts`',
        /*
         * The third, and the clearest of the three: there is no moment at which a document is *being
         * scrolled to*. A width is known before the drawing, a pointer is the visitor's, and a scroll
         * position is the visitor's **and keeps changing** — so this leaves the model as a keyframe
         * animation whose clock is the scroll, and a renderer is right not to read it.
         */
        reveal: 'published as a rule, not folded into a drawing: read by `revealRules` — held in `reveal.test.ts`',

        // ── The office schema’s, for products that are not this one ────────
        placeholder: 'Word draws a prompt in an empty paragraph; a page has no forms yet',
        /*
         * `type` was here — *"a list's numbering, office-text's to draw"* — and it was true right up
         * until a site drew `<ul>` and `<ol>` instead of two identical `<div>`s. The harness reported
         * it stale the same minute, which is what an exemption is for: a claim that fails when it
         * stops being true, rather than a note that quietly outlives it.
         */
        format: 'a date field’s format, `office-text`’s to draw',
        advance: 'how a deck moves to the next slide; a page does not advance',

        // ── Commands ───────────────────────────────────────────────────────
        /*
         * The shared editing kit's, which a page uses through the text stack: typing, Enter, a
         * hard break, an inline image. They put nodes in the document and no *site* control offers
         * them, because the keyboard already does.
         */
        insertText: 'the shared kit’s: typing, which needs no button',
        insertParagraph: 'the shared kit’s: Enter, which needs no button',
        insertHardBreak: 'the shared kit’s: Shift+Enter, which needs no button',
        insertImage: 'the shared kit’s inline image — a page’s own `picture` insert is still owed',

        // ── The rail ───────────────────────────────────────────────────────
        /*
         * A placement and a data list are chosen from the **rail**, not from the toolbar, and they
         * are the two inserts that take an argument: a placement of nothing is an empty box, and a
         * list with no data draws nothing. So the rail offers the definitions and the datasets the
         * document actually holds, and the command refuses anything else.
         */
        insertPlacement: 'the left rail — 컴포넌트, which offers the definitions this document holds',
        insertDataList: 'the left rail — 데이터, which offers a dataset and a definition together',
        insertDataset: 'the left rail — 데이터 › 새 데이터, which names it and opens its grid',

        // ── The rail's list of pages ──────────────────────────────────────────────────────
        /*
         * A page is **not a selection**. Nothing on the canvas is one — the boards draw a page, and
         * the panel describes the page being drawn when nothing is selected — so a toolbar button
         * acting on "the page" would act on something a reader cannot point at. The rail's list is
         * where a page is a thing with a row, which makes it the only honest home for these four.
         *
         * The same argument the data grid makes about a dataset and the deck's strip about a slide.
         */
        /*
         * Three of these four stopped needing an exemption the minute 파일 existed, and the harness
         * said so the same minute — *stale*, which is what an exemption is for. They are still on the
         * rail as well; what changed is that a *declaration* now says they are reachable, so the
         * prose claim is one more thing that could quietly stop being true.
         *
         * `movePage` is still the rail's alone, and honestly so: it acts on a page's **position in a
         * list**, which is a thing only a list has.
         */
        movePage: 'the left rail — the ↑ on a page’s row; the order of five pages changes twice in a site’s life, so it is a button rather than a drag',

        // ── The data grid ──────────────────────────────────────────────────
        /*
         * A dataset is not a block: no selection names it, nothing on the page is it, and what it
         * needs to be edited in is width — five columns by twenty rows. So it opens over the page
         * from the rail's 데이터 panel, and every one of these is a control in that grid.
         *
         * Named row by row rather than as one exemption, because an exemption is a claim a reader
         * can check in ten seconds, and "somewhere in the data editor" is not one.
         */
        setDatasetInfo: 'the data grid — 이름, 출처, and 주소 when the source is an address',
        setDatasetField: 'the data grid — a column heading is the control: typed to rename, ␡ to remove, ＋ to add',
        setDatasetCell: 'the data grid — a cell',
        addDatasetRow: 'the data grid — 행 추가',
        removeDatasetRow: 'the data grid — the ␡ at the end of a row',
        removeDataset: 'the data grid — 데이터 삭제, refused while a list draws it',

        // ── Set by every row rather than by one ────────────────────────────
        /**
         * **Every** panel row writes this, which is why no row is named after it.
         *
         * A row hands `setBlockFormat` the width being edited, and the command decides where the
         * value lands: the widest width *is* the node, so it writes attributes; a narrower one
         * writes only the difference into `overrides` (`responsive.ts`). So a reader sets it
         * constantly and never chooses it — the panel says so in a sentence at the top instead,
         * which is the `note` row.
         *
         * The check is right to ask. A mechanism nothing names is a mechanism nobody can find, and
         * the answer being "all of them" is worth writing down once.
         */
        overrides:
          'written by every row: `setBlockFormat` takes the width being edited and puts the difference here when it is not the widest',

        // ── A durable name, which a reader must not type ───────────────────
        /*
         * `id` is how one node refers to another — a link names a page, a placement names a
         * definition — and `forFile` strips sids precisely so that a reference is never one. A
         * reader renaming an id by hand breaks every reference to it silently, which is why the
         * panel offers a **label** and keeps the name.
         */
        id: 'a durable reference target: a link names a page by it. The panel offers 이름 instead, and the id is never typed',
        kind: 'what shape of surface a page is — set when it is made, and a page that changed kind would be a different page',

        // ── Word's vocabulary, drawn on a page and not yet editable here ───
        /**
         * The shared text kit draws these, so a page that *holds* one draws it correctly — a
         * document opened here, or a table pasted in. This product has no table or code UI yet, and
         * that is a gap on the record rather than a decision: see `docs/BACKLOG.md`.
         *
         * Worth the distinction: these are not exempt because nothing should set them. They are
         * exempt because **nothing does yet**, and the day a site grows a table panel the claim goes
         * stale and this fails on it.
         */
        caption: 'the shared text kit draws it; a site has no table panel yet — owed, in BACKLOG.md',
        colspan: 'the shared text kit draws it; a site has no table panel yet — owed, in BACKLOG.md',
        rowspan: 'the shared text kit draws it; a site has no table panel yet — owed, in BACKLOG.md',
        // `language` was here on the same terms, and the debt is paid: 코드 › 언어 writes it.

        // ── Deliberately not offered ───────────────────────────────────────
        /**
         * Swapping which definition a placement draws.
         *
         * Deferred with variants and document-wide variables rather than forgotten — the three are
         * one feature in every tool that has them, and taking one without the others gives a reader
         * a swap that cannot be undone into anything meaningful. Written in `docs/BACKLOG.md`.
         */
        componentId: 'instance swap, deferred with variants — a placement is made from a definition and points at it for life, for now',

        // ── The property panel ─────────────────────────────────────────────
        /*
         * Three exemptions used to be here, and the harness deleted them: `setBlockFormat`,
         * `setComponentValue` and `setPageInfo` were prose claims about rows in a React tree, and the
         * day the panel became a declaration (`panel-model.ts`) they stopped exempting anything and
         * were reported as **stale** — which is the shape of every good thing this harness does.
         *
         * `setSizing` stays, and the difference is the point: no row runs it. The 폭 row writes
         * `sizing` through `setBlockFormat`, which knows about widths as well, so this command is
         * reachable only as the older way of saying the same thing.
         */
        setSizing: 'nothing runs it: the panel’s 크기 › 폭 writes `sizing` through `setBlockFormat`, which also knows the width being edited',

        moveBlockInto:
          'reached by **dragging a block**, which is neither a button nor a key. The gesture is held ' +
          'in `apps/site/tests/site.spec.ts`; the arithmetic is held in `landing.test.ts`'
      }
    });
  });
});
