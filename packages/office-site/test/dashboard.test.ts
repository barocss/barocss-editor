import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { registerSiteRenderers } from '../src/renderers';
import { exportPage, sitemapFor } from '../src/export-html';
import { pagesOf } from '../src/selection';
import { datasetNamed } from '../src/data';
import { templateParts } from '../src/collection-resolution';

/**
 * **대시보드** — the page that put every piece of this together, which is why it is in the sample.
 *
 * A `url` dataset that refetches in the visitor's browser, charts that group and re-scale, a template
 * whose chrome is deliberately *less* than a public page's. Each had a unit test and none had a
 * **page**, and this repository's own rule is that a fixture has to wear what it tests — a clean run
 * usually means the fixture is thin, not the product correct.
 *
 * It found two things the day it was added, and both are here.
 */
describe('the page the site’s own people read', () => {
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

  const dashboard = () => pagesOf(doc as never).find((one) => one.path === '/대시보드')!;

  it('is the sample’s first live dataset, so the live path has a fixture at last', () => {
    /*
     * Everything else in this document is `inline` — rows a person typed, which is the right default
     * and the one `data-commands.ts` argues for. A dashboard is the case that trade gets wrong, and
     * before this the whole live path was code with unit tests and no page.
     */
    const metrics = datasetNamed(doc, '지표')!;
    expect(metrics.kind).toBe('url');
    expect(metrics.live).toBe(true);
    /* And rows anyway: a `url` dataset keeps a handful to **design against** — a chart with no rows
       is a box, and nobody can arrange one of those. */
    expect(metrics.records.length).toBeGreaterThan(0);
  });

  it('marks both of its charts for the browser to refetch', () => {
    const html = exportPage(editor, dashboard().sid).html;
    /* Two charts and a list, each told where to go back to and what query the export ran. */
    expect([...html.matchAll(/data-chart="[a-z]+"[^>]*data-st-live/g)]).toHaveLength(2);
    /* And the plot box, which is what lets a refetch put a point where the axis says. */
    expect(html).toContain('data-plot-top');
    /* The one script the page ships, and only because something on it is live. */
    expect(html).toContain('<script>');
  });

  it('is a page of the tool, so it carries none of the site’s navigation', () => {
    /**
     * The first finding. A dashboard is read by the people who **run** the site, and offering them
     * 제품 · 가격 · 소개 above a chart is the tool pretending to be the site.
     *
     * Which broke a check that had been true since the header existed — *every page publishes the
     * site's links* — and the check was the thing that had to change: it was demanding a page be
     * wrong.
     */
    const html = exportPage(editor, dashboard().sid).html;
    expect(html).not.toContain('href="/제품"');
    expect(html).toContain('name="robots" content="noindex"');
  });

  it('is left out of the sitemap, because it said not to read it', () => {
    /**
     * The second finding, and the sharper one: the page's head said *do not index this* and the
     * sitemap published beside it said *here it is*. A crawler handed both obeys the first and learns
     * the second is unreliable — the one thing a sitemap must not teach.
     *
     * Nothing had noticed because no page in the sample had ever said `noIndex`.
     */
    const map = sitemapFor(editor)!;
    expect(map).toContain('/가격');
    expect(map).not.toContain('/대시보드');
  });

  it('is drawn through a template whose chrome is less, not more', () => {
    /*
     * A post's template wraps the site's header and footer around a readable column. This one has a
     * bar of its own, a wide band and no footer — which is the argument for templates being a
     * **page's** attribute rather than a blog feature: the second template is not a second blog.
     */
    const node = store.getNode(dashboard().sid) as never as { attributes: Record<string, unknown> };
    expect(node.attributes.template).toBe('dashboard-page');

    const parts = templateParts(doc as never, store.getNode(dashboard().sid) as never);
    expect(parts.length).toBeGreaterThan(0);
    const drawn = JSON.stringify(parts);
    /* Its own bar, and none of the site's header. */
    expect(drawn).toContain('Barocss · 지표');
    expect(drawn).not.toContain('site-header');
  });
});
