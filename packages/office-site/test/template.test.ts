import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { installSiteResolution, templateParts } from '../src/collection-resolution';
import { definitionsOf } from '../src/components';
import { pagesOf } from '../src/selection';

/**
 * **A page drawn through a template**, which is how two hundred posts share a shape.
 *
 * ## The question this answers, and the one it does not
 *
 * `collection` answers *a list on a page*: a row of cards drawn from a dataset. It cannot answer *a
 * page of the list's own*, and a blog needs that — an address, a search result and **formatted text**
 * are a page's properties rather than a datum's. A body is not a cell in a table.
 *
 * So an entry is a **page**, and data is what makes lists. That is the modelling decision, and it is
 * the one that would have been a migration if it had been answered late.
 *
 * ## Why it is one attribute
 *
 * Because the machinery was already built, for placements: a definition may hold a part with a
 * `slot`, and `instanceParts` puts the placement's **own children** there. A template page is that
 * sentence with a page as the placement — it names a definition, and what a reader sees is the
 * definition with this page's blocks in its slot.
 *
 * Which is what these check. Not that an attribute can be written — that is a row and a command, and
 * the harness asks about those — but that a page **draws** through it, and that the page's own words
 * survive the trip.
 */
describe('a page drawn through a template', () => {
  let editor: any;
  let store: DataStore;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const doc = () => ({ rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) });

  /**
   * **What the view reads** — which is not what `store.getNode` returns.
   *
   * The resolver is reached through the view's proxy only, so a test that read the store's children
   * would be measuring stored sids and calling them a drawing. `templateParts` is the rule itself,
   * out where it can be asked in milliseconds; `site.spec.ts` drives the wiring in a browser.
   */
  const drawn = (sid: string) =>
    templateParts(doc() as never, store.getNode(sid) as never) ??
    ((store.getNode(sid)?.content ?? []) as unknown[]);

  /**
   * A definition, and how many parts it draws — which is what a page drawn through it will have.
   *
   * `Definition` says what a *builder* needs (its id, its name, how many placements use it); the
   * parts are the definition node's own children, which is what the resolver returns.
   */
  const template = () => {
    const found = definitionsOf(doc() as never)[0];
    const parts = ((store.getNode(found.sid)?.content ?? []) as unknown[]).filter(
      (sid) => typeof sid === 'string' && store.getNode(sid as string)?.stype !== 'componentVar'
    );
    return { ...found, parts };
  };

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    /*
     * The resolution is what this file is about, and it is installed by the app rather than by the
     * kit — so a test that forgot it would be measuring stored sids and calling them a drawing.
     */
    installSiteResolution(editor);
  });

  it('draws the definition the page names, not the page’s own children', async () => {
    const page = pagesOf(doc() as never)[0].sid;
    const own = drawn(page).length;
    const chosen = template();

    expect(await run('setPageTemplate', { nodeId: page, template: chosen.id })).toBe(true);

    /*
     * The page's stored children are untouched — a template is a way of *drawing*, and the save walks
     * the stored nodes, which is the same property that makes a placement's file honest.
     */
    const stored = (editor.exportDocument(page) as any).content ?? [];
    expect(stored.length).toBe(own);

    // And what the view reads is the definition's parts.
    expect(drawn(page).length).toBe(chosen.parts.length);
  });

  it('says nothing about a page with no template', () => {
    const page = pagesOf(doc() as never)[1].sid;
    const before = drawn(page).length;
    expect(before).toBeGreaterThan(0);
    // Untouched: the resolver answers only for a page that names one.
    expect(drawn(page).length).toBe(before);
  });

  it('gives the page back its own blocks when the template is taken away', async () => {
    const page = pagesOf(doc() as never)[0].sid;
    const own = drawn(page).length;
    const chosen = template();

    await run('setPageTemplate', { nodeId: page, template: chosen.id });
    expect(drawn(page).length).toBe(chosen.parts.length);

    /*
     * Emptied is a real gesture rather than a missing argument: a page that was an entry becomes an
     * ordinary page holding exactly the blocks it always held.
     */
    expect(await run('setPageTemplate', { nodeId: page, template: '' })).toBe(true);
    expect(drawn(page).length).toBe(own);
  });

  it('refuses a template the document has not got, and one the page already has', async () => {
    const page = pagesOf(doc() as never)[0].sid;
    const chosen = template();

    expect(editor.canExecuteCommand('setPageTemplate', { nodeId: page, template: '없는템플릿' })).toBe(false);
    await run('setPageTemplate', { nodeId: page, template: chosen.id });
    // Naming the one it already has is not a change, and a control that lights up for it is one a
    // reader stops believing.
    expect(editor.canExecuteCommand('setPageTemplate', { nodeId: page, template: chosen.id })).toBe(false);
    // And emptying is only possible when there is something to empty.
    expect(editor.canExecuteCommand('setPageTemplate', { nodeId: page, template: '' })).toBe(true);
    const plain = pagesOf(doc() as never)[1].sid;
    expect(editor.canExecuteCommand('setPageTemplate', { nodeId: plain, template: '' })).toBe(false);
  });

  it('makes an entry with an address of its own, after the last page', async () => {
    /**
     * **After the last page**, not at the end of the document — which the harness found by reporting
     * that the command *said it could run and then changed nothing*.
     *
     * A document's content is `docMeta? surface+ resources? components? variables? widths?`, so a
     * `surface` appended after the boxes is a document the validator refuses: the transaction failed
     * silently and the command reported a success it had not had.
     */
    const chosen = template();
    const before = pagesOf(doc() as never).length;

    expect(await run('insertEntry', { template: chosen.id })).toBe(true);

    const pages = pagesOf(doc() as never);
    expect(pages).toHaveLength(before + 1);

    const made = store.getNode(pages[pages.length - 1].sid) as any;
    expect(made.attributes.template).toBe(chosen.id);
    /* An address of its own, which is the whole reason an entry is a page rather than a row. */
    expect(String(made.attributes.path)).toMatch(/^\//);
    expect(new Set(pages.map((one: any) => one.path)).size).toBe(pages.length);

    /*
     * A heading and nothing else. `insertPage` copies the chrome off the page it follows, which is
     * right for a page a reader is building by hand and would give an entry **two headers** — the
     * template already draws everything around the words.
     */
    const stored = (editor.exportDocument(pages[pages.length - 1].sid) as any).content ?? [];
    expect(stored).toHaveLength(1);
    expect(stored[0].stype).toBe('heading');
  });

  it('refuses an entry of a template the document has not got', () => {
    expect(editor.canExecuteCommand('insertEntry', { template: '없는템플릿' })).toBe(false);
    expect(editor.canExecuteCommand('insertEntry', {})).toBe(false);
  });
});
