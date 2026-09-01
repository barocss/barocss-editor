import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { pagesOf } from '../src/selection';
import { exportPage, robotsFor } from '../src/export-html';

/**
 * **What a published folder holds beyond the pages.**
 *
 * Three things every site on the web has and this product had none of, all found by asking what is in
 * the head of a page it publishes rather than by reading a list of features:
 *
 * - **a favicon** — without one every tab shows the browser's blank glyph, and a reader with six tabs
 *   open cannot find theirs. The cheapest thing that makes a published site look like a site;
 * - **`robots.txt`** — a sitemap was being written that nothing pointed at, which a crawler finds
 *   only by guessing its name;
 * - **a 404 page** — a visitor who types the address wrong gets the host's blank one.
 *
 * The first of them needed the asset work: a favicon is a **file**, and until a document could carry
 * one there was nowhere for the bytes to be.
 */
const DOT =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('what a published folder holds', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;

  beforeEach(() => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  const files = async (): Promise<{ file: string; text?: string }[]> => {
    let got: any;
    await editor.executeCommand('exportSite', { write: (one: unknown) => (got = one) });
    return got.files;
  };

  it('puts a picture in the browser tab, from a file the document holds', async () => {
    const home = pagesOf(doc as never)[0].sid;
    expect(exportPage(editor, home).html).not.toContain('rel="icon"');

    await editor.executeCommand('insertAsset', { label: '탭.png', type: 'image/png', data: DOT });
    await editor.executeCommand('setSiteFiles', { icon: 'asset:탭' });

    // The path the archive will hold, not the bytes — the same answer every published picture gets.
    expect(exportPage(editor, home).html).toContain('<link rel="icon" href="assets/탭.png"');
  });

  it('tells a crawler where the sitemap is, or says nothing at all', async () => {
    /*
     * Nothing without an address, which is the rule `og:url` and the sitemap already follow: a
     * `Sitemap:` line takes an absolute address and there is nothing honest to put in a relative one.
     */
    expect(robotsFor(editor)).toBeUndefined();
    expect((await files()).map((one) => one.file)).not.toContain('robots.txt');

    await editor.executeCommand('setSiteAddress', { address: 'https://barocss.com/' });
    expect(robotsFor(editor)).toBe(
      'User-agent: *\nDisallow:\nSitemap: https://barocss.com/sitemap.xml\n'
    );
    expect((await files()).map((one) => one.file)).toContain('robots.txt');
  });

  it('can keep a whole site out of a search result, which is the state nobody tests', async () => {
    // A staging copy published before it was ready and now sitting in somebody's search result.
    await editor.executeCommand('setSiteAddress', { address: 'https://barocss.com' });
    await editor.executeCommand('setSiteFiles', { noIndex: true });
    expect(robotsFor(editor)).toContain('Disallow: /');
  });

  it('keeps one page out without hiding the site', async () => {
    const thanks = pagesOf(doc as never)[3];
    await editor.executeCommand('setPageInfo', { nodeId: thanks.sid, noIndex: true });

    /*
     * `robots.txt` has no way to say this about one page — it is a file about the site — so the page
     * says it in its own head. A thank-you page is a page nobody should arrive at from a search
     * result.
     */
    expect(exportPage(editor, thanks.sid).html).toContain('name="robots" content="noindex"');
    expect(exportPage(editor, pagesOf(doc as never)[0].sid).html).not.toContain('content="noindex"');
  });

  it('serves a page a reader marked, for an address a host cannot match', async () => {
    expect((await files()).map((one) => one.file)).not.toContain('404.html');

    const about = pagesOf(doc as never).find((one: any) => one.id === 'about')!;
    await editor.executeCommand('setPageInfo', { nodeId: about.sid, notFound: true });

    /*
     * `404.html` is the name every static host serves for a request it cannot match — Netlify,
     * Vercel, GitHub Pages, S3 — which is why it is a **file** rather than a route this product
     * invents. And a *flag on a real page* rather than a page called `/404`, because a page in the
     * list appears in navigation and in the sitemap, and a 404 is neither.
     */
    const written = (await files()).find((one) => one.file === '404.html');
    expect(written?.text).toContain('소개');
    // The page keeps its own address too: it gained a second one rather than moving.
    expect(exportPage(editor, about.sid).file).toBe('소개/index.html');
  });
});
