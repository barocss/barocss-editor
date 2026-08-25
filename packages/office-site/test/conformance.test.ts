import { describe, it } from 'vitest';
import { assertConforms, attributeReadFrom, contentTagFrom, drawnTagFrom } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { getGlobalRegistry } from '@barocss/dsl';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSiteEditor, createSiteOwnExtensions } from '../src/site-kit';
import { siteKeyCommands } from '../src/keymap';
import { siteToolbarCommands, siteToolbarIcons } from '../src/toolbar-model';
import { kindOfBlock } from '../src/selection';
import { iconNames } from '@barocss/office-icons';

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
    { command: 'insertPlacement', produces: 'instance' },
    { command: 'insertDataList', produces: 'collection' }
  ];

  /**
   * What a reader can reach, from the product's **own declarations**: the toolbar and the keys.
   *
   * The property panel is a third surface and the harness has no notion of one — it can read a
   * toolbar model and a key map, and a panel is a React tree. So a panel-only command is an
   * exemption that names the row it is on, which is the deck's own practice: an exemption is a claim,
   * and "the properties panel — 배치 › 방향" is a claim a reader can check in ten seconds.
   */
  const reachable = [...siteToolbarCommands(), ...siteKeyCommands()];

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
      iconsAsked: siteToolbarIcons(),
      iconDrawn: (name: string) => iconNames().includes(name),
      attributeRead: attributeReadFrom(registry as never, (type: string) =>
        (schema.nodes.get(type) as { attrs?: Record<string, never> } | undefined)?.attrs
      ),
      produces,
      commands,
      own,
      reachable,
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
        columns: 'read by `frameCss` for a grid; on a bare node there is no grid to have columns',
        limit: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',
        sortBy: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',
        sortDir: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',
        where: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',
        equals: 'read by `rowsOf` when the list has data — held in `collection.test.ts`',

        // ── The office schema’s, for products that are not this one ────────
        placeholder: 'Word draws a prompt in an empty paragraph; a page has no forms yet',
        type: 'a list’s numbering, `office-text`’s to draw',
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

        // ── The property panel ─────────────────────────────────────────────
        setBlockFormat:
          'the properties panel — 배치, 크기, 모양, and the data group, all of it at the width being edited',
        setSizing: 'the properties panel — 크기 › 폭, which `setBlockFormat` also writes',
        setComponentValue: 'the properties panel — 값, a placement’s answers to its definition’s questions',
        setPageInfo:
          'the properties panel — 페이지 › 이름 and 주소, shown when nothing is selected because a page is the board rather than a block',

        moveBlockInto:
          'reached by **dragging a block**, which is neither a button nor a key. The gesture is held ' +
          'in `apps/site/tests/site.spec.ts`; the arithmetic is held in `landing.test.ts`'
      }
    });
  });
});
