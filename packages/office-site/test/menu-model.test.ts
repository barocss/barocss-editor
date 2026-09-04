import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { registerSiteRenderers } from '../src/renderers';
import { SITE_MENUS, siteMenuCommands, siteMenuEntry, siteMenuId, SITE_CONTEXT } from '../src/menu-model';
import { pagesOf } from '../src/selection';

/**
 * What the **menubar** offers, held to what the product can actually do.
 *
 * The menubar is the fourth surface a reader can reach a command from, after the toolbar, the
 * keyboard and the panel — and it arrived carrying the one gesture this product exists for.
 * `exportSite` rendered every page of a site for weeks and was reachable from `window.exportSite`
 * and from tests and from **no control at all**, because `every-command-can-be-reached` counts
 * commands and it was a function.
 *
 * So the first test here is the one that would have caught that, generalised: every command this
 * model names must be a command the editor registers. A menu is a promise about what a product can
 * do, and a promise nothing checks is the hand-kept list this whole harness replaced.
 */
describe('what the menubar offers', () => {
  let editor: any;
  let store: DataStore;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
  });

  it('names only commands the product registers', () => {
    const registered = new Set<string>(editor.commandNames() as string[]);
    expect(siteMenuCommands().filter((name) => !registered.has(name))).toEqual([]);
  });

  it('separates what changes a document from what changes a view', () => {
    /*
     * Every entry says exactly one of the two, and that is load-bearing rather than tidy: how many
     * boards a reader has open is not a fact about their site, so it is not a command — and an entry
     * that declared one would be telling the harness a command exists which does not.
     */
    for (const menu of SITE_MENUS) {
      for (const block of menu.blocks) {
        for (const item of block.items) {
          expect(
            Boolean(item.command) !== Boolean(item.view),
            `${menu.label} › ${item.label}`
          ).toBe(true);
        }
      }
    }
  });

  it('holds what acts on the document, and nothing that acts on one block’s look', () => {
    /*
     * The division the whole file is for: a menubar holds what acts on the *document and the
     * application*, a toolbar and a panel hold what acts on the *selection*. `setBlockFormat` is the
     * panel's 24-field command and the moment it appears here the menubar has started becoming a
     * second panel — which is exactly how every toolbar in this suite grew to 60 controls.
     */
    expect(siteMenuCommands()).not.toContain('setBlockFormat');
    expect(siteMenuCommands()).not.toContain('setSizing');
    expect(siteMenuCommands()).not.toContain('bindPartText');
  });

  it('says which entries act on the page a reader is on', () => {
    /*
     * Measured, and it was a dead menu entry: `duplicatePage` and `removePage` answer `canExecute`
     * against a `nodeId` and return false without one, so from a menubar with no payload they were
     * greyed **forever**. An entry that can never be enabled is worse than one that is not there.
     *
     * Declared rather than left to the app to guess — which page is open is genuinely the app's, and
     * `needs` is the model asking for it rather than the app knowing something the model does not.
     */
    const needing = SITE_MENUS.flatMap((menu) =>
      menu.blocks.flatMap((block) => block.items.filter((one) => one.needs === 'page').map((one) => one.command))
    );
    /*
     * …and **every insert**, which is the same fact once more and the one that had been missed.
     * Measured on a freshly opened site with nothing selected: twelve entries in 삽입, twelve greyed.
     * An insert lands after what is selected, and with nothing selected it lands at the end of the
     * page a reader is looking at — which the model has no notion of and the app does. The rail's
     * 추가 had been saying it since the day it was written.
     *
     * Written out rather than counted, because the list is the claim: an entry that needs the page
     * and does not say so is greyed forever, and an entry that says so and does not need it sends a
     * `nodeId` to a command that will use it for something else.
     */
    expect(needing).toEqual([
      'exportPage',
      'duplicatePage',
      'removePage',
      'pasteBlocks',
      'selectAllBlocks',
      'insertSection',
      'insertRow',
      'insertGrid',
      /*
       * Three **shapes** — a two-up, a row of cards, a numbered column — which are frames and text
       * rather than new nodes, and which a reader had been assembling by hand every time. They need
       * the page for the same reason every other insert does: with nothing selected they land at the
       * end of the page a reader is looking at, which the model has no notion of.
       */
      'insertSplit',
      'insertCards',
      'insertSteps',
      'insertAccordion',
      'insertTabs',
      'insertForm',
      'insertHeading',
      'insertBodyText',
      'insertPicture',
      'insertBulletList',
      'insertNumberList',
      'insertQuote',
      /* **본문 글** — the same node a 서식 있는 글 cell's value is, placed rather than named. */
      'insertRichText',
      'insertCode',
      'insertRule',
      'insertTableBlock',
      'insertButton',
      /* Two things a page has and a printed document cannot — see `docs/specs/site-blocks.md`. */
      'insertVideo',
      'insertEmbed'
    ]);
  });

  it('gives every entry a name a reader can find it by', () => {
    const labels = SITE_MENUS.flatMap((menu) => menu.blocks.flatMap((block) => block.items.map((one) => one.label)));
    expect(labels.every((one) => one.trim().length > 0)).toBe(true);
    // Unique within the whole bar: two entries called 삭제 in different menus is a reader asking
    // "which one did I use last time".
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('is addressable by the id the menubar hands back', () => {
    const [menu] = SITE_MENUS;
    const [block] = menu.blocks;
    const id = siteMenuId(menu, block, 0);
    expect(id).toBe('file.publish.0');
    expect(siteMenuEntry(id)?.command).toBe('exportPage');
    expect(siteMenuEntry('nothing.at.all')).toBeUndefined();
  });

  it('puts publishing first, where a reader looks for it', () => {
    expect(SITE_MENUS[0].label).toBe('파일');
    /*
     * And **발행하기** with them, which is a third gesture rather than a third name for one: 내보내기
     * is *give me the files*, and 발행 is *this is now the site* — only the second is worth
     * remembering, and only the second can answer whether what is live is what the reader has.
     */
    expect(SITE_MENUS[0].blocks[0].items.map((one) => one.command)).toEqual([
      'exportPage',
      'exportSite',
      'publishSite'
    ]);
  });
});

/**
 * And **publishing itself**, which is the command the menubar was built to carry.
 *
 * It hands back what to write and writes nothing: a package that reached for `document.createElement`
 * to start a download would be a model package that only runs in a browser, and the export is
 * already used by a test with no download in it. What a *file* is — a download, a zip, a POST to a
 * host — is the app's question, and the day this grows a deploy target it is a different answer
 * behind the same command.
 */
/**
 * **The context menu offers nothing the menubar does not.**
 *
 * A press of the right button is the gesture every builder has, and the temptation is to write it
 * into the board's JSX where it is needed — which is a second place to keep the truth about what this
 * product does, and the reason `menu-model.ts` exists at all. So it is declared, and this holds the
 * one property that keeps it from drifting: every command in it is a command the menubar already
 * offers.
 *
 * The other direction is deliberately **not** asserted. A context menu that offered everything would
 * be the menubar drawn over the page, which is what makes most of them useless: this is the same list
 * cut down to what somebody pointing at a block wants.
 */
describe('what a press of the right button offers', () => {
  it('offers nothing the menubar does not', () => {
    const menubar = new Set(siteMenuCommands());
    const stray = SITE_CONTEXT.flatMap((block) =>
      block.items.map((one) => one.command).filter((one) => one && !menubar.has(one))
    );
    expect(stray).toEqual([]);
  });

  it('is shorter than the menubar, because a shortened list is the whole point', () => {
    const mine = SITE_CONTEXT.flatMap((block) => block.items).length;
    expect(mine).toBeGreaterThan(4);
    expect(mine).toBeLessThan(siteMenuCommands().length);
  });

  it('names a command for every item, so nothing draws as a dead row', () => {
    for (const block of SITE_CONTEXT) {
      expect(block.items.length).toBeGreaterThan(0);
      for (const one of block.items) {
        expect(one.command, `${one.label}에 명령이 없습니다`).toBeTruthy();
        expect(one.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('publishing', () => {
  let editor: any;
  let store: DataStore;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);

  beforeEach(() => {
    // Publishing **renders** — the same renderers the editor draws with, into a detached element —
    // so a document with no renderers registered exports nothing. That is the design rather than a
    // limitation: there is no second implementation to disagree with.
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
  });

  it('is a command, which is what makes it visible to every check here', () => {
    expect(editor.canExecuteCommand('exportSite')).toBe(true);
    expect(editor.canExecuteCommand('exportPage')).toBe(true);
  });

  it('hands back every page of the site, as whole documents', async () => {
    let held: any;
    expect(await run('exportSite', { write: (result: unknown) => (held = result) })).toBe(true);

    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    expect(held.pages).toHaveLength(pagesOf(doc as never).length);
    expect(held.pages[0].html).toMatch(/^<!doctype html>/);
    expect(held.pages.map((one: any) => one.path)).toContain('/');
  });

  it('hands back one page when that is what was asked', async () => {
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const second = pagesOf(doc as never)[1];

    let held: any;
    await run('exportPage', { pageId: second.sid, write: (result: unknown) => (held = result) });
    expect(held.pages).toHaveLength(1);
    expect(held.pages[0].path).toBe((store.getNode(second.sid) as any).attributes.path);
  });

  it('publishes the home page when no page is named', async () => {
    let held: any;
    await run('exportPage', { write: (result: unknown) => (held = result) });
    expect(held.pages[0].path).toBe('/');
  });

  it('runs without a writer, because a caller may only want to know it works', async () => {
    // Which is how a test asks "does this produce five pages" without inventing a download, and how
    // the harness's own probe can run it.
    expect(await run('exportSite')).toBe(true);
  });

  it('defaults to the home page, because being wrong here is cheap', async () => {
    /*
     * A fallback in publishing and deliberately **not** in `removePage`. Publishing the wrong page
     * costs a reader one file in their downloads folder; deleting the wrong one costs them the page.
     * A default is only safe where being wrong is cheap, and the two commands sit next to each other
     * in the same menu.
     */
    expect(editor.canExecuteCommand('exportPage')).toBe(true);
    expect(editor.canExecuteCommand('removePage')).toBe(false);
  });

  it('refuses a page the document does not have', () => {
    expect(editor.canExecuteCommand('exportPage', { pageId: '없는페이지' })).toBe(false);
  });
});

/**
 * **자리에 맞는 메뉴바.**
 *
 * This product has two places and half the bar means nothing on one of them. Reported as *최상위
 * 메뉴바도 상황에 맞게 달라져야할 듯 , 데이타 관리하는데 추가요소 같은건 필요없으니깐* — and the
 * measurement agrees: opened on 관리, 삽입 offered twelve entries that could never be enabled, 표
 * offered eight, and 보기 offered a zoom for a plane that is not drawn.
 *
 * Greying is the right answer for one entry among several and the wrong one for a whole menu: a bar
 * whose middle three are permanently grey has stopped saying anything.
 */
describe('메뉴바는 서 있는 자리를 따른다', () => {
  it('drops the canvas menus in 관리 and keeps the document’s own', async () => {
    const { siteMenusIn } = await import('../src/menu-model');

    const admin = siteMenusIn('admin').map((one) => one.label);
    const page = siteMenusIn('page').map((one) => one.label);

    /* 파일 is a document's and belongs on both sides of the door; 편집 keeps its history. */
    expect(admin).toEqual(['파일', '편집']);
    /* And the page loses nothing — a filter that quietly trimmed the builder would be worse. */
    expect(page).toEqual(SITE_MENUS.map((one) => one.label));
  });

  it('leaves no trigger that opens nothing, and no group that acts on nothing', async () => {
    const { siteMenusIn } = await import('../src/menu-model');

    for (const menu of siteMenusIn('admin')) {
      expect(menu.blocks.length).toBeGreaterThan(0);
      for (const block of menu.blocks) expect(block.items.length).toBeGreaterThan(0);
    }

    /*
     * And what survives is only what a screen with no canvas can run. `pasteBlocks`,
     * `duplicateBlocks`, `insertRowAbove` and every `zoom.*` are the things that must not.
     */
    const said = siteMenusIn('admin').flatMap((menu) =>
      menu.blocks.flatMap((block) => block.items.map((one) => one.command ?? one.view ?? ''))
    );
    for (const one of ['pasteBlocks', 'duplicateBlocks', 'insertRowAbove', 'selectAllBlocks', 'zoom.in']) {
      expect(said).not.toContain(one);
    }
    /* 실행 취소 survives, because a page deleted in 관리 comes back the same way a card does. */
    expect(said).toContain('undo');
    expect(said).toContain('publishSite');
  });
})
