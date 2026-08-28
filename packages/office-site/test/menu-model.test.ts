import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { registerSiteRenderers } from '../src/renderers';
import { SITE_MENUS, siteMenuCommands, siteMenuEntry, siteMenuId } from '../src/menu-model';
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
      'insertHeading',
      'insertBodyText',
      'insertPicture',
      'insertBulletList',
      'insertNumberList',
      'insertQuote',
      'insertCode',
      'insertRule',
      'insertButton'
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
    expect(SITE_MENUS[0].blocks[0].items.map((one) => one.command)).toEqual(['exportPage', 'exportSite']);
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
