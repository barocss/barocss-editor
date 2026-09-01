import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertConforms,
  attributeReadFrom,
  conformance,
  contentTagFrom,
  drawnTagFrom
} from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { getGlobalRegistry } from '@barocss/dsl';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSiteEditor, createSiteOwnExtensions } from '../src/site-kit';
import { siteKeyCommands } from '../src/keymap';
import { definitionsOf } from '../src/components';
import { siteLayerIcons } from '../src/layer-icons';
import { SITE_TOOLBAR, siteToolbarCommands, siteToolbarIcons } from '../src/toolbar-model';
import {
  SITE_PANEL,
  sitePanelAttrs,
  sitePanelCommands,
  sitePanelIcons,
  type SitePanelRow
} from '../src/panel-model';
import { siteMenuCommands } from '../src/menu-model';

/** Every declared toolbar control, whichever group it is in. */
const siteToolbarControls = () => SITE_TOOLBAR;
import { DataStore } from '@barocss/datastore';
import { createSampleSite } from '../src/sample-site';
import { SELECTABLE, blocksIn, kindOfBlock, pagesOf } from '../src/selection';
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
    /*
     * And the two compositions a visitor **opens**, both `frame` for the same reason: an accordion is
     * three boxes each holding a box that is not on the page yet, and a tab strip is the same three
     * with one attribute turned on. Neither is a node type and neither should be — the day the schema
     * grew an `accordion` node is the day a reader could no longer take one apart.
     */
    { command: 'insertAccordion', produces: 'frame' },
    { command: 'insertTabs', produces: 'frame' },
    /*
     * And the one that produces a node type of its own, which is what makes it the only genuinely
     * new thing in this product: a form is not a frame wearing a name, because what it does happens
     * after a visitor has used it.
     */
    { command: 'insertForm', produces: 'form' },
    /*
     * And the one insert that puts a **resource** in rather than a block: a file the document holds,
     * which a picture then names. Counted here for the same reason every other insert is — a command
     * named `insert*` that no check covers is a command that could quietly stop working.
     */
    { command: 'insertAsset', produces: 'asset' },
    /*
     * And the table's five, which are the shared extension's rather than this product's — registered
     * here because a comparison is tabular and a page has comparisons. Each says what it makes, which
     * is what keeps them inside the two command checks rather than outside both.
     */
    { command: 'insertTableBlock', produces: 'bTable' },
    { command: 'insertRowAbove', produces: 'bTableRow' },
    { command: 'insertRowBelow', produces: 'bTableRow' },
    { command: 'insertColumnLeft', produces: 'bTableCell' },
    { command: 'insertColumnRight', produces: 'bTableCell' },
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

  /**
   * And whether a command a surface offers **does anything when it runs**.
   *
   * The other command checks ask about a command's description — what the schema says it makes,
   * whether the product draws that, whether anything surfaces it. None can see the fault a reader
   * meets: a control that lights up, runs, and changes nothing. The engine's `find` was that for
   * months, and four `canExecute`s looser than their `execute` were the same shape.
   *
   * ## What a fresh editor and one gesture buys
   *
   * A command needs a **state**, and the state a page's commands need is short: a document, a page,
   * and something selected. So the probe builds one editor per command — the document is changed by
   * running it, and reusing one would be measuring a moving target — puts the first block of the
   * home page in the selection, and asks whether the document moved.
   *
   * One editor each is the expensive-looking choice and it is what makes the answer trustworthy:
   * undoing instead would test the undo as well, which is a different and worthy check, and a
   * command that does not undo would then read as a command that does nothing.
   */
  /** The eight a table has, which need a caret in a cell and nothing else does. */
  const TABLE_COMMANDS = [
    'insertRowAbove',
    'insertRowBelow',
    'deleteRow',
    'insertColumnLeft',
    'insertColumnRight',
    'deleteColumn',
    'mergeCells',
    'splitCell'
  ];

  const moved = new Map<string, boolean | null>();

  /** The first run of words on a page — what a range selection needs somewhere to be. */
  const firstRun = (store: DataStore, from: string): string | undefined => {
    const walk = (sid: string): string | undefined => {
      const node = store.getNode(sid) as any;
      if (!node) return undefined;
      if (typeof node.text === 'string' && node.text.length > 2) return sid;
      for (const child of node.content ?? []) {
        if (typeof child === 'string') {
          const hit = walk(child);
          if (hit) return hit;
        }
      }
      return undefined;
    };
    return walk(from);
  };

  /**
   * Run **before** the check, because a command is `async` and a check is not.
   *
   * Which is not a wrinkle worth hiding: measured the wrong way first, comparing the document on the
   * line after `executeCommand`, and **all 24** answers came back "changed nothing" — including
   * `insertSection`, which the browser suite watches work. A probe that is wrong in one direction
   * reports the whole product as broken, which at least fails loudly; wrong in the other it reports
   * a broken product as fine, and that is the failure this harness exists to prevent. So the answers
   * are awaited here and the check reads them.
   */
  beforeAll(async () => {
    for (const command of [...new Set(reachable)]) {
      const store = new DataStore(undefined as never, schema as never);
      const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
      editor.loadDocument(createSampleSite(), 'site');

      const rootId = editor.getRootId();
      const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
      const page = pagesOf(doc as never)[0]?.sid;
      const block = page ? blocksIn(doc as never, page)[0] : undefined;
      if (!page || !block) {
        moved.set(command, null);
        continue;
      }

      // The state a page's surfaces act from: one block held, and the page it is on named.
      await editor.executeCommand('setNode', { nodeIds: [block] });
      const payload: Record<string, unknown> = { nodeId: page, pageId: page, parentId: page };

      /**
       * **And what each of them needs beyond a selection.**
       *
       * Five commands write the *document* rather than a block — its address, its files, its type,
       * a page's name — and take neither a `nodeIds` nor any of the three ids above. They said no,
       * came back `null`, and sat in the silent column: five surfaces nothing was measuring, three
       * of which had been added that week.
       *
       * A payload per command rather than a union of every key, because a union is how a probe ends
       * up passing a `scale` to a command that wanted a `path` and reporting the refusal as a fault.
       */
      Object.assign(payload, {
        setSiteAddress: { address: 'https://barocss.test' },
        setSiteFiles: { noIndex: true },
        setSiteType: { scale: 'calm' },
        setPageInfo: { name: '시험 페이지' },
        setBlockFormat: { nodeIds: [block], gap: 480 },
        setOpens: { nodeIds: [block], nodeId: block },
        selectParent: { nodeIds: [block] }
      }[command] ?? {});

      /**
       * **A block with something above it**, for the one command that needs one.
       *
       * `moveBlockUp` on the first block of a page is correctly refused, and the probe held exactly
       * that block — so a command the browser suite watches work was counted as unaskable.
       */
      if (command === 'moveBlockUp') {
        const second = blocksIn(doc as never, page)[1];
        if (second) {
          await editor.executeCommand('setNode', { nodeIds: [second] });
          payload.nodeIds = [second];
        }
      }

      /**
       * **Something to take back**, for the two commands that are about time.
       *
       * `undo` and `redo` on a document nothing has happened to are correctly refused. So the probe
       * does one edit first and then asks — which measures exactly what it should: whether taking it
       * back moves the document.
       */
      if (command === 'undo' || command === 'redo') {
        await editor.executeCommand('setBlockFormat', { nodeIds: [block], gap: 600 });
        if (command === 'redo') await editor.executeCommand('undo', {});
      }

      /**
       * **Inside a definition**, which is the fourth state and the one five commands are about: a
       * part bound to a variable, the variable itself, what one placement answers. A page has
       * headings of its own, so the probe found one immediately and every one of the five was
       * refused — a state it was one step from building.
       */
      if (['bindPartText', 'setComponentVar', 'removeComponentVar'].includes(command)) {
        /*
         * And **a variable the definition already declares**, for the two of the three that are
         * about one that exists. `_varAt` looks the name up among the definition's own children and
         * answers nothing when it is not there, so a probe inventing 시험 변수 was asking both
         * commands to act on a variable no card has — refused, correctly, and counted as unaskable.
         */
        const found = ((): { part: string; declared?: string } | undefined => {
          const definitions = (store.getNode(rootId)?.content ?? []).filter(
            (sid: unknown) => typeof sid === 'string' && store.getNode(sid)?.stype === 'components'
          ) as string[];
          for (const box of definitions) {
            for (const one of (store.getNode(box)?.content ?? []) as unknown[]) {
              if (typeof one !== 'string') continue;
              const children = ((store.getNode(one) as any)?.content ?? []).filter(
                (sid: unknown) => typeof sid === 'string'
              ) as string[];
              const declared = children
                .map((sid) => store.getNode(sid) as any)
                .find((node) => node?.stype === 'componentVar')?.attributes?.name;
              let part: string | undefined;
              const look = (sid: string, depth = 0) => {
                if (depth > 40 || part) return;
                const node = store.getNode(sid) as any;
                if (!node) return;
                if (['heading', 'paragraph', 'listItem'].includes(String(node.stype))) part = sid;
                for (const child of node.content ?? []) if (typeof child === 'string') look(child, depth + 1);
              };
              look(one);
              if (part && (declared || command === 'bindPartText')) return { part, declared };
            }
          }
          return undefined;
        })();
        if (found) {
          await editor.executeCommand('setNode', { nodeIds: [found.part] });
          payload.nodeIds = [found.part];
          payload.nodeId = found.part;
          payload.var = found.declared ?? '시험 변수';
          payload.name = found.declared ?? '시험 변수';
          /*
           * And **something to say about it**. `_varPlan` refuses a payload that names a variable
           * and then asks for no change, which is right — a command that writes nothing is not a
           * command — and a probe that only named one was asking for exactly that.
           */
          payload.label = '시험 이름표';
        }
      }

      /**
       * **Two blocks at coordinates**, for the two commands that are about where a block *is*.
       *
       * A page is a stack, so nothing on it places itself until a reader says so — and both of these
       * refuse a stacked block on purpose: writing an inset onto one produces a number the drawing
       * ignores, which is a command that says it ran and changed nothing. So the probe says so
       * first, on two blocks, which is also what lining up needs.
       */
      if (command === 'nudgeBlock' || command === 'alignBlocks') {
        const two = blocksIn(doc as never, page).slice(0, 3);
        if (two.length > 2) {
          /*
           * At **three different places**, which is the trap the row probe already documents: three
           * blocks all at `insetLeft: 0` are already aligned left, so the command runs, writes the
           * number that was there, and reports itself as doing nothing. A probe that sets the state
           * it is about to ask for is not asking anything.
           */
          for (const [at, sid] of two.entries()) {
            await editor.executeCommand('setBlockFormat', {
              nodeIds: [sid],
              position: 'absolute',
              insetLeft: (at + 1) * 40 * 15,
              insetTop: (at + 1) * 30 * 15,
              maxWidth: (300 - at * 40) * 15,
              minHeight: 100 * 15
            });
          }
          await editor.executeCommand('setNode', { nodeIds: two });
          payload.nodeIds = two;
          payload.nodeId = two[0];
          payload.axis = 'x';
          payload.by = 15;
          payload.how = 'left';
        }
      }

      /*
       * **Something with a shape worth reusing**, for the command that turns a block into a card.
       *
       * It refuses a paragraph on purpose — one paragraph is not a component — and it refuses
       * anything already inside a definition, which is where the probe had been putting it. So it
       * gets what it actually asks for: a frame or a collection standing on a page.
       */
      if (command === 'createComponentFrom') {
        const reusable = ((): string | undefined => {
          for (const one of pagesOf(doc as never)) {
            let hit: string | undefined;
            const look = (sid: string, depth = 0) => {
              if (depth > 40 || hit) return;
              const node = store.getNode(sid) as any;
              if (!node) return;
              if (['frame', 'collection'].includes(String(node.stype))) hit = sid;
              for (const child of node.content ?? []) if (typeof child === 'string') look(child, depth + 1);
            };
            look(one.sid);
            if (hit) return hit;
          }
          return undefined;
        })();
        if (reusable) {
          await editor.executeCommand('setNode', { nodeIds: [reusable] });
          payload.nodeIds = [reusable];
          payload.nodeId = reusable;
          payload.name = '시험 카드';
        }
      }

      /*
       * **A block with something above it**, for the climb. The probe held the first block of the
       * page, whose parent is the page — which `selectParent` refuses on purpose, because a page is
       * the board rather than a block. One level in is the state the gesture is for.
       */
      /*
       * **A second block to open**, for the command whose key is `target`.
       *
       * The probe had been sending `opens`, which is the *attribute* the command writes rather than
       * the payload it takes — so it took the taking-it-back branch, wrote `opens: undefined` onto a
       * block that already opened nothing, and committed a transaction that changed not one word.
       * `canExecute` said yes to that, honestly: clearing something already clear is a legal no-op.
       */
      if (command === 'setOpens') {
        const second = blocksIn(doc as never, page)[1];
        if (second) payload.target = second;
      }

      if (command === 'selectParent') {
        const nested = ((): string | undefined => {
          for (const top of blocksIn(doc as never, page)) {
            const child = ((store.getNode(top) as any)?.content ?? []).find(
              (sid: unknown) => typeof sid === 'string' && store.getNode(sid)
            ) as string | undefined;
            if (child) return child;
          }
          return undefined;
        })();
        if (nested) {
          await editor.executeCommand('setNode', { nodeIds: [nested] });
          payload.nodeIds = [nested];
          payload.nodeId = nested;
        }
      }

      /*
       * **One of the two words a connection's method may be** — the same thing the row probe found.
       * A connection is named rather than selected, so this also names the one the sample carries.
       */
      if (command === 'setServiceInfo') {
        const service = (store.getNode(rootId)?.content ?? [])
          .filter((sid: unknown) => typeof sid === 'string')
          .flatMap((sid: string) => ((store.getNode(sid) as any)?.content ?? []) as unknown[])
          .map((sid: unknown) => (typeof sid === 'string' ? (store.getNode(sid) as any) : undefined))
          .find((node: any) => node?.stype === 'service');
        if (service?.attributes?.name) {
          payload.name = service.attributes.name;
          payload.method = String(service.attributes.method) === 'get' ? 'post' : 'get';
        }
      }

      /*
       * And **what one placement answers**, which is asked by the variable's name on a card that
       * actually declares one — the header asks nothing, and it is the first instance on the page.
       */
      if (command === 'setComponentValue') {
        const asking = definitionsOf(doc as never).filter((one) => (one.asks ?? []).length > 0);
        let placement: string | undefined;
        const look = (sid: string, depth = 0) => {
          if (depth > 40 || placement) return;
          const node = store.getNode(sid) as any;
          if (!node) return;
          if (
            node.stype === 'instance' &&
            asking.some((one) => one.id === node.attributes?.componentId)
          ) {
            placement = sid;
            return;
          }
          for (const child of node.content ?? []) if (typeof child === 'string') look(child, depth + 1);
        };
        for (const one of pagesOf(doc as never)) {
          look(one.sid);
          if (placement) break;
        }
        const wanted = asking.find(
          (one) => one.id === (store.getNode(String(placement)) as any)?.attributes?.componentId
        );
        if (placement && wanted?.asks?.[0]) {
          payload.nodeIds = [placement];
          payload.nodeId = placement;
          payload.name = wanted.asks[0];
          payload.value = '시험 값';
        }
      }

      /**
       * **A caret in a table cell**, which is the third state a builder acts from and the one that
       * left eight registered commands unmeasured.
       *
       * They were unaskable for a plainer reason than the state: the sample had **no table in it**,
       * so there was no cell to put a caret in. The document wears one now — a comparison on the
       * pricing page, which is what a table is for — and this puts the caret there.
       */
      /*
       * **Named, not matched.** `command.includes('Row')` also caught `insertRow`, which is the
       * site's 가로 스택 and has nothing to do with a table — so the probe put a caret in a cell and
       * then reported a working insert as dead. A glob over command names is a probe deciding what a
       * command is about from its spelling.
       */
      if (TABLE_COMMANDS.includes(command)) {
        const cell = ((): string | undefined => {
          for (const one of pagesOf(doc as never)) {
            const found: string[] = [];
            const walk = (sid: string, depth = 0) => {
              if (depth > 40 || found.length > 0) return;
              const node = store.getNode(sid) as any;
              if (!node) return;
              if (node.stype === 'bTableCell' || node.stype === 'bTableHeaderCell') found.push(sid);
              for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
            };
            walk(one.sid);
            if (found[0]) return found[0];
          }
          return undefined;
        })();
        /*
         * And for the two that act on **more than one cell**, the two ends of a range. A caret is
         * the state six of the eight act from; merging is by definition a second cell, and splitting
         * needs a cell that has already been merged — so the probe merges, then asks.
         */
        if (command === 'mergeCells' || command === 'splitCell') {
          const row = cell ? (store.getNode(cell) as any)?.parentId : undefined;
          const cells = ((store.getNode(String(row)) as any)?.content ?? []).filter(
            (sid: unknown) => typeof sid === 'string'
          ) as string[];
          if (cells.length > 1) {
            payload.fromCellId = cells[0];
            payload.toCellId = cells[1];
            payload.cellId = cells[0];
            if (command === 'splitCell') {
              await editor.executeCommand('mergeCells', {
                fromCellId: cells[0],
                toCellId: cells[1]
              });
            }
          }
        }

        const words = cell ? (store.getNode(cell) as any)?.content?.[0] : undefined;
        if (typeof words === 'string') {
          editor.selectionManager.setSelection({
            type: 'range',
            startNodeId: words,
            startOffset: 0,
            endNodeId: words,
            endOffset: 0,
            collapsed: true
          } as never);
        }
      }

      /**
       * **And the other state a page's surfaces act from**, which this probe did not have.
       *
       * A builder has two: a block selected, and **words** selected. Everything in the ribbon's link
       * group needs the second — a mark covers a range and a node selection is not one — so every
       * one of those commands refused, came back `null`, and was counted as *could not be asked*.
       * Honest, and it meant the check had nothing to say about a whole group of controls; the day
       * `linkToAddress` was added it went straight into that same silent column.
       *
       * So a command that cannot run over a block is offered a range over some words before being
       * given up on. `null` still means what it meant — neither state let it run.
       */
      if (editor.canExecuteCommand(command, payload) !== true) {
        /*
         * And for the one command that needs the words to already **wear** something, words that do.
         * `removeLink` asks whether the range carries a link, so any old run refuses it — and the
         * sample's navigation is made of links, which is where a reader would use this.
         */
        const linked = ((): string | undefined => {
          let hit: string | undefined;
          const walk = (sid: string, depth = 0) => {
            if (depth > 60 || hit) return;
            const node = store.getNode(sid) as any;
            if (!node) return;
            if (
              typeof node.text === 'string' &&
              ((node.marks ?? []) as any[]).some((mark) => mark?.stype === 'link')
            ) {
              hit = sid;
              return;
            }
            for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
          };
          walk(rootId);
          return hit;
        })();
        const words = (command === 'removeLink' ? linked : undefined) ?? firstRun(store, page);
        if (!words) {
          moved.set(command, null);
          continue;
        }
        editor.selectionManager.setSelection({
          type: 'range',
          startNodeId: words,
          startOffset: 0,
          endNodeId: words,
          endOffset: 2,
          collapsed: false
        } as never);
        /*
         * And what each needs **beyond** a selection, which is the same thing `nodeId`/`pageId` are
         * two lines up: a probe that offered a link command no destination would watch it decline and
         * report the command as one that says yes and does nothing — a finding about the probe.
         */
        payload.id = pagesOf(doc as never)[1]?.id ?? pagesOf(doc as never)[0]?.id;
        payload.href = 'barocss.com';
        payload.size = '48px';
        payload.color = '#0F7A5A';
        if (editor.canExecuteCommand(command, payload) !== true) {
          moved.set(command, null);
          continue;
        }
      }

      const before = JSON.stringify(editor.exportDocument?.(rootId) ?? '');
      await editor.executeCommand(command, payload);
      moved.set(command, JSON.stringify(editor.exportDocument?.(rootId) ?? '') !== before);
    }
  });

  const changes = (command: string): boolean | null => moved.get(command) ?? null;

  /**
   * **And the same question one level down**: does using a *row* write the attribute it names?
   *
   * The hole a browser found and this harness could not: `editable` says a row exists, a row names a
   * command, and the command decides what it accepts. Six attributes shipped declared, drawn and
   * offered, with `setBlockFormat`'s whitelist refusing every one — six controls that took a value
   * and threw it away, with every check green.
   *
   * Driven the way the panel drives it: select a node the row says it is `on`, run the row's own
   * command with the row's own attribute, and ask the document whether anything moved. A value the
   * node does not already hold, because writing the value that is there is measuring the probe.
   */
  const wrote = new Map<string, boolean | null>();

  beforeAll(async () => {
    /**
     * A value this row would actually send — **and one the node does not already hold**.
     *
     * The second half is not a detail: the first version picked the first option a choice offers,
     * the first block of the home page is a sticky header, and 배치 방식's first option is 고정. So
     * the probe wrote 고정 onto something already 고정, watched nothing change, and reported a
     * working control as dead. A sweep that writes the value already there is measuring itself —
     * which is the same lesson the browser's own sweep wrote down about 투명도, in almost the same
     * words, before this check existed.
     */
    const valueFor = (row: SitePanelRow, held: unknown): unknown => {
      if (row.control === 'toggle') return held === true ? false : true;
      if (row.control === 'colour') return held === '#123456' ? '#654321' : '#123456';
      if (row.control === 'choice') {
        /*
         * **Anything but what it already holds.** Preferring a value that is neither the fallback
         * nor the held one is right when a row has three options and wrong when it has two: 목록 종류
         * offers 글머리 and 번호, one of which is the fallback, and the sample's list is the other —
         * so the probe found nothing to send and filed a working control under *could not ask*. The
         * fallback is a legitimate thing to write; it is only the value already there that measures
         * the probe instead of the product.
         */
        const options = (row.options ?? []).map((one) => one.id).filter((id) => id !== '');
        return (
          options.find((id) => id !== row.fallback && id !== String(held ?? '')) ??
          options.find((id) => id !== String(held ?? ''))
        );
      }
      if (row.control === 'number') {
        const low = row.min ?? 0;
        const high = row.max ?? 999;
        const wanted = Math.min(high, Math.max(low, 7));
        return wanted === held ? Math.min(high, Math.max(low, wanted === low ? high : low)) : wanted;
      }
      return held === '시험' ? '시험 둘' : '시험';
    };

    for (const row of SITE_PANEL) {
      if (wrote.has(row.attr) || !row.command) continue;

      const store = new DataStore(undefined as never, schema as never);
      const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
      editor.loadDocument(createSampleSite(), 'site');
      const rootId = editor.getRootId();
      const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };

      /**
       * **Inside a definition**, for the rows that are about a card's own variables.
       *
       * Six rows and five commands are about what a *component* asks for — a part bound to a
       * variable, the variable's kind, the format it reads in, what one placement answers. None of
       * them applies to a block on a page, so all eleven sat in the silent column: the probe walked
       * the pages and a definition is not on one.
       *
       * Searched in the components box, which is where `definitionsOf` looks, and the part handed
       * over is the first **textual** one — `bindPartText` refuses anything else, correctly, because
       * a variable that drives a picture is a binding and not a caption.
       */
      const partInADefinition = (): string | undefined => {
        let found: string | undefined;
        const walk = (sid: string, depth = 0) => {
          if (depth > 40 || found) return;
          const node = store.getNode(sid) as any;
          if (!node) return;
          if (['heading', 'paragraph', 'listItem'].includes(String(node.stype))) {
            found = sid;
            return;
          }
          for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
        };
        for (const child of (store.getNode(rootId)?.content ?? []) as unknown[]) {
          if (typeof child !== 'string') continue;
          if (store.getNode(child)?.stype !== 'components') continue;
          for (const each of (store.getNode(child)?.content ?? []) as unknown[]) {
            if (typeof each === 'string') walk(each);
            if (found) return found;
          }
        }
        return found;
      };

      /**
       * A node of a type the row says it is offered on — searched across **every page**, and
       * including the pages themselves.
       *
       * The first version walked inside the home page only, and it left a third of the panel
       * unanswered: the form and its questions are on 소개, a code block is on 블로그, and twelve
       * rows are `on: ['surface']` — a page, which is never *inside* a page. Thirty-six rows the
       * check had nothing to say about, which is the quiet way a guard stops guarding.
       */
      const wants = row.on;
      const found: string[] = [];
      const walk = (sid: string, depth = 0) => {
        if (depth > 40 || found.length > 0) return;
        const node = store.getNode(sid) as any;
        if (!node) return;
        const kind = String(node.stype);
        if (!wants || wants.includes(kind)) found.push(sid);
        for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
      };
      /*
       * A card's variable rows look **inside a definition first**, and that is not a preference: the
       * command refuses a part that is not in one, and a page has headings and paragraphs of its own
       * — so the walk found one immediately, the command said no, and six rows were filed as *could
       * not ask* about a state the probe was one step from building.
       */
      const wantsAPart = row.attr === 'componentVar' || row.attr === 'componentBind';
      if (wantsAPart) {
        const inside = partInADefinition();
        if (inside) found.push(inside);
      }
      if (found.length === 0) {
        for (const page of pagesOf(doc as never)) {
          walk(page.sid);
          if (found.length > 0) break;
        }
      }

      const held = found[0] ? (store.getNode(found[0]) as any)?.attributes?.[row.attr] : undefined;
      const value = valueFor(row, held);
      if (found.length === 0 || value === undefined) {
        wrote.set(row.attr, null);
        continue;
      }

      /**
       * **What shape the schema wants**, which is the difference between a probe that measures the
       * product and one that measures itself.
       *
       * Two ways this went wrong before it went right, and both looked like a dead control:
       *
       * - a choice's ids are strings, because a `<select>`'s value is one, and 제목 단계 sent `'4'`
       *   into a `number` attribute — the validator threw the whole transaction away. (That one was
       *   a real fault as well: the panel had the same bug and now converts.)
       * - `choices` is an `array`, and a probe with no opinion about shape sent the word 시험.
       *
       * Asked of the schema rather than listed per attribute, for the reason everything else here is:
       * a list would be wrong the first time an attribute was added.
       */
      const declared = (schema as any).getNodeType?.(String((store.getNode(found[0]) as any)?.stype))
        ?.attrs?.[row.attr];
      const sent = ((): unknown => {
        if (declared?.type === 'number' && typeof value === 'string' && Number.isFinite(Number(value))) {
          return Number(value);
        }
        if (declared?.type === 'array') return ['하나', '둘'];
        if (declared?.type === 'boolean') return held !== true;
        return value;
      })();
      /**
       * The payload key is the **attribute**, except where the row already says otherwise.
       *
       * A mark's row is named by the mark it reads — `fontSize`, `fontColor` — and its command takes
       * `size` and `color`. The panel translates in one place and so does this; without it the two
       * mark rows came back unanswered for ever, which is the silent column a check goes to die in.
       */
      const payload: Record<string, unknown> = { nodeIds: found, nodeId: found[0], [row.attr]: sent };
      if (row.attr === 'fontSize') payload.size = '48px';
      if (row.attr === 'fontColor') payload.color = '#123456';
      /*
       * And **what a block opens**, which is a second block rather than a value: `setOpens` takes a
       * `target`, writes the opener's reference *and* a durable name on the thing opened, and reads
       * nothing called `opens` at all. Handed the row's own attribute it read that as *take it back*,
       * changed nothing, and the row was reported dead — a probe fault wearing the shape of a real
       * one. The sibling after the opener is a block that certainly exists.
       */
      /*
       * **What a card's variable rows send**, which is not the row's own attribute: `bindPartText`
       * takes a `var`, and `setComponentVar` is asked by the variable's `name`. The panel translates
       * in one place and so does this — handed the attribute they read, all six wrote nothing and
       * were filed as unaskable.
       */
      /*
       * **What one placement answers.** `setComponentValue` is asked by the *variable's* name, so a
       * probe handing it the row's attribute is naming nothing — and the placement has to be one
       * whose definition actually declares that variable, or the write is refused for a second
       * reason the finding would not distinguish.
       */
      if (row.attr === 'componentValue') {
        /*
         * And a placement **whose definition asks something**. The first instance on the home page is
         * the header, which asks nothing, so the probe named no variable and filed two working rows
         * as unaskable — a walk that takes the first match is measuring where the document happens
         * to put things rather than what the row is about.
         */
        const asking = definitionsOf(doc as never).filter((one) => (one.asks ?? []).length > 0);
        const wanted = found
          .concat(
            pagesOf(doc as never).flatMap((page) => {
              const seen: string[] = [];
              const look = (sid: string, depth = 0) => {
                if (depth > 40) return;
                const node = store.getNode(sid) as any;
                if (!node) return;
                if (node.stype === 'instance') seen.push(sid);
                for (const child of node.content ?? []) if (typeof child === 'string') look(child, depth + 1);
              };
              look(page.sid);
              return seen;
            })
          )
          .find((sid) =>
            asking.some((one) => one.id === (store.getNode(sid) as any)?.attributes?.componentId)
          );
        const variable = asking.find(
          (one) => one.id === (store.getNode(String(wanted)) as any)?.attributes?.componentId
        )?.asks?.[0];
        if (!wanted || !variable) {
          wrote.set(row.attr, null);
          continue;
        }
        payload.nodeIds = [wanted];
        payload.nodeId = wanted;
        payload.name = variable;
        payload.value = '시험 값';
      }

      if (row.attr === 'componentVar' || row.attr === 'componentBind') {
        payload.var = '시험 변수';
        payload.name = '시험 변수';
        if (row.control === 'varKind') payload.kind = 'number';
        if (row.control === 'varFormat') payload.format = '#,##0원';
        if (row.control === 'variable') payload.rename = '바뀐 변수';
      }

      if (row.attr === 'opens') {
        const parent = (store.getNode(found[0]) as any)?.parentId;
        const siblings = ((store.getNode(String(parent)) as any)?.content ?? []) as string[];
        const next = siblings.find((sid) => sid !== found[0]);
        if (!next) {
          wrote.set(row.attr, null);
          continue;
        }
        payload.target = next;
      }

      /**
       * **A row that writes a *resource*, named from the block that uses it.**
       *
       * Five rows on a form edit the **connection** it sends through, not the form — a shared thing
       * edited from the panel of one of its users, which the panel says out loud by counting how many
       * forms it reaches. `setServiceInfo` is asked by that connection's `name`, and the probe was
       * handing it the form's sid, so all five came back *could not ask*: a whole group of controls
       * this check had nothing to say about.
       *
       * Resolved the way the panel resolves it — from the block's own reference — rather than by
       * finding any service, because a probe that edited a different connection from the one the
       * form uses would be measuring something no reader can reach.
       */
      if (row.of === 'service') {
        const said = (store.getNode(found[0]) as any)?.attributes?.sends;
        if (typeof said === 'string' && said) payload.name = said;
        /*
         * And **one of the two words** a connection's method may be. The control is its own kind and
         * declares no `options`, so a probe with no opinion sent 시험 — which `setServiceInfo`
         * refuses, correctly, and the refusal read as a state that could not be built.
         */
        if (row.attr === 'method') {
          payload.method =
            String((store.getNode(found[0]) as any)?.attributes?.method) === 'get' ? 'post' : 'get';
        }
      }

      /**
       * **"It said no" is two different answers, and telling them apart is the check.**
       *
       * A refusal means either *I could not put the product in a state where this row applies* — not
       * a fault, counted as unanswered — or *the command will not accept this field at all*, which is
       * a control that takes a value and throws it away and is the exact fault this check exists for.
       * Filed as one, the second hides inside the first: 보낼 곳 연결 sat in the silent column for as
       * long as this check has existed, because `sends` is not in `setBlockFormat`'s list and the
       * refusal read as a state the probe could not build.
       *
       * They are told apart by asking the same command for something it certainly takes. Every block
       * has a `name`, so if the command says yes to *that* on this selection and no to the row's own
       * attribute, the state was never the problem.
       */
      const refuses = () => editor.canExecuteCommand(row.command, payload) !== true;
      const stateIsFine = () =>
        row.command === 'setBlockFormat' &&
        editor.canExecuteCommand('setBlockFormat', { nodeIds: found, nodeId: found[0], name: '시험' }) === true;

      if (refuses() && stateIsFine()) {
        // A selection this command can act on, and it still will not take this field.
        wrote.set(row.attr, false);
        continue;
      }

      if (editor.canExecuteCommand(row.command, payload) !== true) {
        /*
         * And **the other state a panel acts from**: words selected rather than a block. A mark
         * covers a range and a node selection is not one, so the two mark rows refuse everything
         * until there is a caret in some text. `every-command-does-something`'s probe learned this
         * first, in the same file, for the same rows.
         */
        const words = firstRun(store, pagesOf(doc as never)[0]?.sid ?? rootId);
        if (!words) {
          wrote.set(row.attr, null);
          continue;
        }
        editor.selectionManager.setSelection({
          type: 'range',
          startNodeId: words,
          startOffset: 0,
          endNodeId: words,
          endOffset: 2,
          collapsed: false
        } as never);
        if (editor.canExecuteCommand(row.command, payload) !== true) {
          wrote.set(row.attr, null);
          continue;
        }
      }

      const before = JSON.stringify(editor.exportDocument?.(rootId) ?? '');
      await editor.executeCommand(row.command, payload);
      wrote.set(row.attr, JSON.stringify(editor.exportDocument?.(rootId) ?? '') !== before);
    }
  });

  /**
   * What the row probe could **not** ask about, printed rather than hidden.
   *
   * A check's unanswered count is the number the harness prints beside `examined`, and it is the one
   * a reader has to look at to know whether a guard is still guarding: it went from 38 to 14 the day
   * the probe learned to walk every page, and 24 rows silently stopped being checked the day before
   * that would look exactly the same. This lists them by name so the number is actionable.
   */
  it('says which commands it could not put itself in a state to try', () => {
    const silent = [...new Set(reachable)].filter((one) => moved.get(one) === null).sort();
    // eslint-disable-next-line no-console
    console.log(`명령 프로브가 답하지 못한 것 — ${silent.length}\n  ${silent.join('\n  ')}`);
    /*
     * **Zero**, from 25, and every step down was the probe learning a state a reader is already in
     * rather than the product losing a command: a caret in a table cell, a part inside a definition,
     * a second cell to merge with, words that already wear a link. Two of the steps found real
     * things — `setOpens` was being sent the attribute it writes instead of the payload it takes,
     * and `setComponentVar` was being asked to change a variable without being told what to change.
     *
     * A ratchet rather than a target: the day a command arrives whose state this cannot build, this
     * fails, and somebody decides whether to teach the probe or to name the gap in an exemption.
     */
    expect(silent.length).toBeLessThanOrEqual(0);
  });

  it('says which rows it could not put itself in a state to try', () => {
    const silent = SITE_PANEL.filter((row) => row.command && wrote.get(row.attr) === null)
      .map((row) => `${row.ariaLabel} (${row.attr})`)
      .filter((one, at, all) => all.indexOf(one) === at);
    // eslint-disable-next-line no-console
    console.log(`행 프로브가 답하지 못한 것 — ${silent.length}\n  ${silent.join('\n  ')}`);
    /*
     * **Zero**, and it earned the number: it was 38, then 14, then 8, then 1, as the probe learned
     * the states a panel actually acts from — a part inside a definition, a placement whose card asks
     * something, one of the two words a connection's method may be. Every row this product declares
     * is now measured.
     *
     * A ratchet rather than a target, still: the day a row arrives whose state this cannot build,
     * this fails and somebody decides whether to teach the probe or to admit the gap by name.
     */
    expect(silent.length).toBeLessThanOrEqual(0);
  });

  it('draws what it declares, expects only what it says it expects', () => {
    const input: Parameters<typeof assertConforms>[0] = {
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
      /**
       * And **what a reader can select**, which is the other half of what is in the layer list.
       *
       * The check derives its list from the `scene` group — a canvas's answer, written on the deck.
       * Half of a page is flow: a quotation, a code block, a rule and a list item are all things a
       * click can land on and all things the list draws a row for, and none of them is a scene node.
       * So the check passed over four rows that showed their stype in English.
       *
       * `SELECTABLE` rather than a list written here, because that *is* the product's selection rule
       * — the one a click already consults. Two lists would drift; one cannot.
       */
      nameable: [...SELECTABLE],
      /*
       * The toolbar's **and the layer list's** — a row in that list asks for a picture the same way
       * a button does, and an icon the suite does not draw comes out as its own name in a 240px
       * column. A product can only be checked on what it writes down.
       */
      iconsAsked: [...siteToolbarIcons(), ...siteLayerIcons(), ...sitePanelIcons()],
      iconDrawn: (name: string) => iconNames().includes(name),
      commandChanges: changes,
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
              : /*
                 * And the two `object`/`array` shapes this product's own vocabulary is made of,
                 * which sat in the blind column until the harness started naming what it could not
                 * ask about. Both become **answers** rather than skips, and the answers differ:
                 *
                 * `choices` is drawn — a `choice` field is a `<select>` and these are its options —
                 * so it comes back read. `states` is not, on purpose, and the exemption below is
                 * that reason written down where the check can find it stale.
                 */
                attr === 'states'
                ? [{ hover: { fill: '#D6341A' } }]
                : attr === 'choices'
                  ? [['첫째', '둘째']]
                  : /*
                     * And **the switch that turns `choices` on**, which is the trap `attributeReadFrom`
                     * documents at length: a field draws its options only when its `kind` says
                     * `choice`, the schema's first value is `text`, and so the filler was setting the
                     * one attribute that made the answer impossible. A taught scalar joins every
                     * render, which is exactly what this is for.
                     */
                    attr === 'kind' && _type === 'field'
                    ? ['choice']
                    : undefined
      ),
      produces,
      commands,
      own,
      reachable,
      editable,
      /** Every row, and whether using it moves the document — see `wrote` above. */
      rows: SITE_PANEL.map((row) => ({ attr: row.attr, label: row.ariaLabel, command: row.command })),
      rowChanges: (row) => wrote.get(row.attr) ?? null,
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
        /*
         * ── Commands that change the **application** rather than the document ──
         *
         * `every-command-does-something` found exactly the three kinds its own header predicts, and
         * nothing else — which is the useful result: the surfaces offer 24 commands that can run in
         * this state and 20 of them move the document.
         *
         * Each of these is a claim. The day one of them starts writing to the document — a paste
         * history, an export that stamps the file — this fails on the exemption rather than passing.
         */
        copyBlocks: 'puts blocks on a clipboard, which is a property of the reader and not of the site',
        /**
         * **A gesture, not a control** — and the distinction is the exemption.
         *
         * Every other command here is reached by pressing something: a button, a menu entry, a key.
         * This one is reached by *pasting into a cell of the data grid*, which is an event the
         * browser delivers and not a surface a product declares. A button labelled 붙여넣기 beside
         * the grid would be a control that cannot read the clipboard without a permission and a
         * gesture, which is the same wall `pasteBlocks` describes at length.
         *
         * The claim, so it fails rather than rots: the day this is reachable any other way, or the
         * day a data grid grows a real toolbar, it comes off.
         */
        setDatasetCells: {
          reason:
            'pasted into a cell of the data grid — an event rather than a control; held in `data-commands.test.ts`',
          covers: ['every-command-can-be-reached', 'every-command-can-be-seen']
        },
        /*
         * The one exemption here that is a **deliberately looser** `canExecute` rather than a
         * command that changes the application, and the reason is the browser's:
         *
         * Reading the system clipboard is asynchronous and may prompt, so nothing can be asked
         * *now* whether it holds a block. The tight answer — enabled only when this window is the
         * one that copied — is what the command used to say, and it made pasting a block from one
         * site into another **impossible**: a second window has its own extension and its own empty
         * hand, so ⌘V was refused before it ever reached the clipboard the copy actually went to.
         *
         * So it answers whether there is anywhere to paste, and a paste that finds prose does
         * nothing — which is what every editor's Paste does. The claim: if the platform ever offers
         * a synchronous *has a block* the loose answer stops being the honest one and this comes off.
         */
        pasteBlocks:
          'enabled wherever a paste could land, because whether the system clipboard holds a block cannot be asked without awaiting it — and the tight answer made cross-document paste impossible',
        selectAllBlocks: 'moves the selection, which is what a reader is *looking at* rather than what they wrote',
        selectParent: 'climbs the selection one level, which moves what a reader is looking at rather than what they wrote',
        exportSite: 'reads the document out as files; a publish that edited the document would be a bug',
        exportPage: 'the same, for one page',

        // ── A page has no canvas ───────────────────────────────────────────
        /*
         * Eight node types a *slide* is made of and a page has none of. The office schema is one
         * vocabulary for every product, so a site declares them by inheriting them — and a page has
         * no coordinates to put them at. The day a page can hold a canvas, this fails first.
         */
        rectangle: {
          reason: 'a page has no coordinates: a shape is placed on a canvas, and a page stacks',
          covers: ['every-node-is-drawn', 'every-drawing-can-be-named']
        },
        ellipse: {
          reason: 'a page has no coordinates: a shape is placed on a canvas, and a page stacks',
          covers: ['every-node-is-drawn', 'every-drawing-can-be-named']
        },
        line: {
          reason: 'a page has no coordinates: a shape is placed on a canvas, and a page stacks',
          covers: ['every-node-is-drawn', 'every-drawing-can-be-named']
        },
        path: {
          reason: 'a page has no coordinates: a shape is placed on a canvas, and a page stacks',
          covers: ['every-node-is-drawn', 'every-drawing-can-be-named']
        },
        connector: {
          reason: 'a connector joins two placed shapes, and a page places nothing',
          covers: ['every-node-is-drawn', 'every-drawing-can-be-named']
        },
        sticky: {
          reason: 'a note stuck to a board; a page has no board',
          covers: ['every-node-is-drawn', 'every-drawing-can-be-named']
        },
        group: {
          reason: 'a group is a z-order over placed shapes, and a page has neither',
          covers: ['every-node-is-drawn', 'every-drawing-can-be-named']
        },
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
        componentValue: {
          reason: 'a placement’s answer, read by the resolver and put into the part it names',
          covers: ['every-node-is-drawn', 'every-drawing-can-be-named']
        },
        variables: 'named values, read where they are referenced (`var:이름`) and never drawn',
        variable: 'named values, read where they are referenced (`var:이름`) and never drawn',

        // ── Attributes a page has no coordinates for ───────────────────────
        x: {
          reason: 'a page has no coordinates; the browser lays a stack out',
          covers: ['every-attribute-is-read', 'every-property-can-be-edited']
        },
        y: {
          reason: 'a page has no coordinates; the browser lays a stack out',
          covers: ['every-attribute-is-read', 'every-property-can-be-edited']
        },
        width: {
          reason: 'a block is as wide as the column it is in — `sizing` is what a page says instead',
          covers: ['every-attribute-is-read', 'every-property-can-be-edited']
        },
        height: {
          reason: 'a page is as tall as it turns out, which is the whole difference from a sheet',
          covers: ['every-attribute-is-read', 'every-property-can-be-edited']
        },
        rotation: {
          reason: 'nothing on a page is at an angle',
          covers: ['every-attribute-is-read', 'every-property-can-be-edited']
        },
        /*
         * `visible` was *"a canvas idea; a page shows what it holds"* and it is not any more — a page
         * hides a block a reader is drafting, which is the commonest reason anybody opens a layer
         * list. It is read by `presenceCss`, so the exemption is gone and the probe answers.
         *
         * `locked` stays, with a truer sentence than it had: a page has no grabbing, but it does have
         * *selecting*, and that is what a lock refuses. Read by the overlay rather than by a renderer,
         * which is a place this probe cannot reach — it renders a node and compares drawings.
         */
        locked:
          'read by the overlay, which refuses to hand back a locked block — a fact about selection, not about the drawing this probe compares',
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
         * And the **gesture** half of the same thing, which is even further from a drawing: `opens`
         * does not change how this block looks at all. It changes what a *different* block looks
         * like, and only after a visitor has pressed — so what it produces is a checkbox and a label
         * in the published markup, and the editor draws neither on purpose (`openSwitches`).
         *
         * A block whose `opens` names nothing on the page publishes as an ordinary block, which is
         * the same drawing and a different document — exactly the shape the probe cannot see.
         */
        opens:
          'a gesture rather than a look: read by `openSwitches`, which puts a switch and a label in the exported page — held in `states.test.ts`',
        /*
         * And its **sibling**, exempt for the same reason and reported the same way: `goes` does not
         * change how the block looks either. It publishes an `<a>` of `display: contents` around it,
         * so the drawing is byte-for-byte the drawing and the block is a control a Tab key reaches.
         *
         * The editor draws no wrapper for the same reason it draws no switch: a link a designer
         * cannot click past is a link in the way of every drag. What the board shows is the panel
         * row, which is where the reader wrote it.
         */
        goes:
          'a gesture rather than a look: read by `goesLinks`, which wraps the block in a link in the exported page — held in `press.test.ts`',
        /*
         * And the two that qualify the gesture, exempt for the same reason and no further one. Both
         * change the **control** the export writes rather than anything about the drawing:
         * `openAtRest` ships the switch already `checked`, and `opensOne` makes the switches under a
         * block radios that share a name — which is the whole of what a tab strip is.
         */
        openAtRest:
          'ships the switch already pressed: read by `openSwitches` — held in `states.test.ts` and in the browser at 390',
        opensOne:
          'a checkbox or a radio, which is a fact about a set: read by `openSwitches` — held in `states.test.ts` and in the browser',
        /*
         * A form's two, and they are the only attributes in this product that are drawn **on the
         * published page and deliberately not on a board**.
         *
         * Every other difference between the two drawings is a removal the export makes afterwards.
         * These are the exception and the reason is not neatness: a designer pressing Enter in a
         * field they are arranging must not send a stranger a message, so the board's `<form>` has no
         * address and no method to send it with. `SiteEnv.published` is the one flag, read in one
         * place, and `form.test.ts` holds both sides of it.
         */
        /*
         * Which connection a form sends through — a **name**, resolved to an address at the moment
         * the page is published, and drawn on a board as nothing at all: a designer pressing Enter in
         * a field they are arranging must not send a stranger a message. So the probe, which draws a
         * board, correctly sees nothing change.
         */
        sends: 'the connection a form sends through, resolved to an `action` only on the published page — held in `form.test.ts`',
        /*
         * And **when a picture is fetched**, which is a published page's question and a board's not at
         * all: a board draws bytes it already has, so there is nothing to defer. The probe draws a
         * board and correctly sees nothing change.
         */
        defer: 'drawn only on the published page — a board has the bytes already; held in `assets.test.ts`',
        /*
         * Where a visitor lands after sending, which is a **hidden field** on the published page and
         * nothing at all on a board: a board has no address to return to and submitting means nothing
         * there. The probe draws a board and correctly sees no change.
         */
        thanks: 'a hidden field on the published page, named by the connection — held in `form.test.ts`',
        /*
         * And how many lines a **paragraph** field shows, which the probe cannot reach: it draws a
         * field with the default `kind`, which is one line, and a one-line field has no rows. Read by
         * the `textarea` branch and held in `form.test.ts`.
         */
        lines: 'the rows of a paragraph field; the probe draws the default one-line field — held in `form.test.ts`',
        /*
         * The third, and the clearest of the three: there is no moment at which a document is *being
         * scrolled to*. A width is known before the drawing, a pointer is the visitor's, and a scroll
         * position is the visitor's **and keeps changing** — so this leaves the model as a keyframe
         * animation whose clock is the scroll, and a renderer is right not to read it.
         */
        /*
         * And what the page is **about**, which no renderer can read because it is not on the page:
         * it is what the `<head>` says to a crawler and to a chat that unfurls the address. `image`
         * is the same thing one step further — the picture that card shows, which is the half of an
         * unfurl anybody actually looks at and which nothing on the page itself ever draws.
         */
        description:
          'published in the document’s head, not drawn: read by `exportPage` — held in `reveal.test.ts`',
        image:
          'the picture a shared link shows: written into the `<head>` by `document_`, joined onto the site address when it is relative — held in `export.test.ts`',
        /*
         * And where the **site** lives, which no renderer can read for a stronger reason than the
         * description's: it is not on any page. It is what `og:url`, the canonical link and every
         * `<loc>` in the sitemap are made of, and all three of those are absolute by definition.
         */
        address:
          'published in the head and in the sitemap, not drawn: read by `exportPage` and `sitemapFor` — held in `reveal.test.ts`',
        /*
         * **What the site is set in**, which is a rule rather than a value on a node — the fourth
         * thing here published that way, after a state, a reveal and a transition. `typeRule` writes
         * four custom properties and `PAGE_CSS` names them, so no one block's drawing changes and the
         * whole page is set differently.
         *
         * The probe draws a *block*, so it correctly sees nothing: there is no block whose own style
         * says what face the site is in.
         */
        bodyFace:
          'published as a rule on the page, not folded into a block: read by `typeRule` — held in `type.test.ts`',
        headingFace: 'published as a rule on the page — see `bodyFace`; held in `type.test.ts`',
        baseSize: 'published as a rule on the page — see `bodyFace`; held in `type.test.ts`',
        scale: 'published as a rule on the page — see `bodyFace`; held in `type.test.ts`',
        /*
         * The four that are about the **published folder** rather than about a drawing: the picture
         * in a browser tab, what a crawler is told, and which page a host serves for an address it
         * cannot match. A board has no tab, no crawler and no host, so the probe correctly sees
         * nothing change.
         */
        /**
         * **Scoped**, and it had to be: an icon that has no picture is reported with the family
         * `icon`, and this key — written about the *favicon attribute* — was excusing every one of
         * them. Three of the toolbar's icons name a glyph this suite does not draw, so 아코디언, 탭
         * and 폼 have been rendering **as the words `accordion`, `tabs` and `form`** in the left rail
         * since the day they were added, and the check that exists to catch exactly that was green.
         *
         * Found by the `+` dialog putting the same declaration on screen somewhere a person was
         * looking at it — which is the argument for a second doorway onto one list.
         */
        icon: {
          reason:
            'the picture in a browser tab: written into the head by `exportPage` — held in `site-files.test.ts`',
          covers: ['every-attribute-is-read']
        },
        noIndex: 'what a crawler is told: read by `robotsFor` and written into the head — held in `site-files.test.ts`',
        notFound: 'which page a host serves for an address it cannot match: read by the publish as `404.html` — held in `site-files.test.ts`',
        reveal: 'published as a rule, not folded into a drawing: read by `revealRules` — held in `reveal.test.ts`',
        /*
         * And whose arrival it is, which is the same fact one level down: a container that stagger
         * its children writes **their** rules instead of its own, so nothing about the container's
         * own drawing changes and a renderer is right not to read it.
         */
        revealStagger:
          'published as a rule, not folded into a drawing: read by `revealRules` — held in `reveal.test.ts`',

        // ── The office schema’s, for products that are not this one ────────
        /*
         * `placeholder` was here — *"a page has no forms yet"* — and the harness struck it out the
         * hour a page had one. It is the exemption doing what an exemption is for: a claim that goes
         * stale loudly, on the day it stops being true, rather than a comment nobody re-reads.
         *
         * A field's `placeholder` is drawn by `field` and set from 안내글; the paragraph's, which
         * Word draws as a prompt in an empty block, is still office-text's.
         */
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
        /*
         * These two went to 삽입 as commands and came **back** here, which is the record worth
         * keeping: a menu entry cannot run either of them. `insertPlacement` answers `canExecute`
         * against a `componentId` and `insertDataList` against a dataset *and* a definition, and a
         * menubar has neither to give — measured by pressing all 33 entries, where both were greyed
         * and always would be.
         *
         * 삽입 points at the rail instead, which is where the choice can be made. So the exemption
         * is true again and says something sharper than it did: not merely *where* they are reached
         * but *why they cannot be reached anywhere else*.
         */
        /*
         * The shared kit's table, which puts one **at the caret** — Word's gesture, and one a page's
         * rail has no way to make: an insert here lands after what is selected or at the end of the
         * page, and with nothing selected there is no caret at all. `insertTableBlock` is this
         * product's, named for what it makes, exactly as `insertBodyText` is beside `insertText`.
         */
        insertTable: 'the shared kit’s: a table at the caret; a page’s rail makes one with `insertTableBlock`',
        insertPlacement:
          'the left rail — 컴포넌트, which offers the definitions this document holds; a menu has no definition to name',
        insertDataList:
          'the left rail — 데이터, which offers a dataset and a definition together; a menu has neither to name',
        insertDataset: {
          reason: 'the left rail — 데이터 › 새 데이터, which names it and opens its grid',
          covers: ['every-command-can-be-reached', 'every-command-can-be-seen']
        },
        /*
         * A button in the dataset's own editor, and only on a `url` dataset — which is why it is not
         * on a toolbar: it is meaningless on the inline dataset a reader typed by hand, and a control
         * that is greyed out nine times out of ten is a control nobody presses the tenth.
         */
        refreshDataset: 'the dataset editor — 새로 가져오기, drawn only for a dataset that has an address',
        /*
         * The picture row's 파일 넣기, which is a **file input** rather than a button — a toolbar
         * cannot hold one, and a command that opened a file dialog by itself would be a model package
         * reaching for the DOM. The app reads the file and runs this with the bytes.
         */
        insertAsset: {
          reason: 'the picture row — 파일 넣기, a file input the app reads before running it',
          covers: ['every-command-can-be-reached', 'every-command-can-be-seen']
        },

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
        /*
         * The same argument one list over. A definition is not a selection either — nothing on the
         * canvas *is* one — so the list that gives it a row is the only honest home for renaming it
         * and taking it away.
         *
         * Worth recording why these existed at all: measured against the other two lists this rail
         * draws, a page could be made, renamed, duplicated and removed and a dataset made, renamed
         * and removed, while a component could **only be made**. One shape, three answers, and the
         * library was the list that only grew.
         */
        duplicateDataset: 'the left rail — 데이터, the ⧉ on a dataset’s row',
        setComponentInfo: 'the left rail — 컴포넌트, the ✎ on a definition’s row, which becomes a field in place',
        removeComponent:
          'the left rail — 컴포넌트, the ␡ on a definition’s row, refused while anything places it and saying how many',

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
        /*
         * `kind` was one word for two things and the harness said so the day a `field` had one. A
         * surface's is what shape of page it is — set when it is made, never edited. A field's is
         * which control it draws, and is a row in the panel. Nothing shared but the spelling, which
         * is the seam fault this repository keeps finding; both are read.
         */

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

        /**
         * **A rule, not a drawing** — and the six findings behind this one reason are six node types
         * saying the same true thing.
         *
         * `:hover` and `:focus-visible` cannot be folded into a node's own attributes, because the
         * browser is the thing that decides when they apply and it decides after the page is drawn.
         * So a state is *published*: `export-html`'s `stateRules` writes one CSS rule per state per
         * block, keyed by the class the lifted stylesheet gave it, and a `frame` drawn with states
         * and a `frame` drawn without them are — correctly — the same element.
         *
         * Which is the one case where this check's question is the wrong question, and the reason is
         * worth stating rather than probing around: the drawing is not where the answer lives. It is
         * held where it is made, in `states.test.ts` and in `export-html`'s own tests, and a reader
         * sees it work in `apps/site/tests/site.spec.ts`.
         *
         * The claim, so it fails rather than rots: the day a renderer starts folding a state into the
         * node — an inline `:hover` a board can preview, say — this stops being true and comes off.
         */
        states: {
          reason:
            'published as a CSS rule by `export-html`’s `stateRules`, because the browser decides when a state applies and it decides after the drawing — held in `states.test.ts`',
          covers: ['every-attribute-is-read']
        },

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
    };

    assertConforms(input);

    /**
     * And **what it could not ask about, by name**.
     *
     * Four checks count a question they could not put the product into a state to ask, and a count
     * is not a work list: `7 unanswered` says a guard has seven holes and nothing about where. The
     * harness now says which, so this reads them back and holds them at the number they are.
     *
     * All four are at **zero**, and the last seven came out the day they got names: six `states` and
     * a `field`'s `choices`, which the probe had no value to invent for. Teaching it two shapes
     * turned both into answers — and the answers differed, which is the whole reason a skip is not a
     * pass. `choices` is drawn and came back read once the probe stopped setting the `kind` that made
     * it impossible; `states` is not drawn at all, on purpose, and that is an exemption with a reason
     * rather than a hole.
     */
    const report = conformance(input);
    for (const [check, blind] of Object.entries(report.unanswered)) {
      // eslint-disable-next-line no-console
      console.log(`${check} 이(가) 묻지 못한 것 — ${blind.length}\n  ${blind.join('\n  ')}`);
    }
    expect(report.unanswered).toEqual({});
  });
});
