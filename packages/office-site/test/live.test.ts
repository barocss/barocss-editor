import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { setAttrs, transaction } from '@barocss/model';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { registerSiteRenderers } from '../src/renderers';
import { exportPage } from '../src/export-html';
import { liveScript } from '../src/live';
import { boundsOf, chartRows, groupRows } from '../src/chart';
import { pagesOf } from '../src/selection';
import { datasetsOf, rowsOf } from '../src/data';
import { pagesOf } from '../src/selection';

/**
 * A list the **visitor's** browser goes and gets again.
 *
 * Two things are being checked and they are different in kind. The first is that a page pays nothing
 * for a feature it has not turned on — no marks, no script — because that is the promise the whole
 * export is unusual for. The second is that the runtime's query and `rowsOf` agree, which they can
 * only do by being tested against the same rows: this is the one rule in this product written twice,
 * once in TypeScript and once in the language the published page has.
 */
describe('a list fetched again in the browser', () => {
  registerSiteRenderers();

  let editor: any;
  let store: DataStore;
  let doc: any;

  const pageWithList = () =>
    pagesOf(doc).find((page: any) => {
      let found = false;
      const walk = (sid: string, depth = 0) => {
        if (found || depth > 64) return;
        if (store.getNode(sid)?.stype === 'collection') found = true;
        for (const child of (store.getNode(sid)?.content ?? []) as unknown[]) {
          if (typeof child === 'string') walk(child, depth + 1);
        }
      };
      walk(page.sid);
      return found;
    })!;

  const products = () => datasetsOf(doc).find((one) => one.name === '상품')!;

  const live = async (on: boolean, url = 'https://example.test/products.json') => {
    await transaction(editor, [
      setAttrs(products().sid!, { kind: on ? 'url' : 'inline', url, live: on })
    ] as never).commit();
  };

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  it('ships nothing at all when no dataset asks for it', () => {
    const html = exportPage(editor, pageWithList().sid).html;
    expect(html).not.toContain('data-st-live');
    expect(html).not.toContain('data-st-field');
    // The one script a page may already have is the menu closer; this adds none.
    expect(html).not.toContain('data-st-row');
  });

  /**
   * A `url` dataset with the switch **off** is the ordinary case and the one the product
   * recommends: the rows were fetched into the document, and the page is still a file.
   */
  it('ships nothing for a url dataset that has not asked to be live', async () => {
    await transaction(editor, [
      setAttrs(products().sid!, { kind: 'url', url: 'https://example.test/p.json' })
    ] as never).commit();
    expect(exportPage(editor, pageWithList().sid).html).not.toContain('data-st-live');
  });

  it('marks the list, its rows and the words that came from a column', async () => {
    await live(true);
    const html = exportPage(editor, pageWithList().sid).html;

    expect(html).toContain('data-st-live="https://example.test/products.json"');
    expect(html).toContain('data-st-row="0"');
    // The card takes its title, its blurb and its price from columns, and says which is which.
    for (const field of ['이름', '설명', '가격']) expect(html).toContain(`data-st-field="${field}"`);
    // And the query the export ran, so the browser runs the same one.
    expect(html).toContain('data-st-q=');
    expect(html).toContain('<script>');
  });

  /**
   * The list on the pricing page sorts by 가격 descending — a query the runtime has to reproduce or
   * the page reorders itself the moment it loads.
   */
  it('carries the query the export ran, not just the address', async () => {
    await live(true);
    const html = exportPage(editor, pageWithList().sid).html;
    const said = /data-st-q="([^"]*)"/.exec(html)?.[1] ?? '';
    const query = JSON.parse(said.replace(/&quot;/g, '"'));
    expect(query.where).toBe('분류');
    expect(query.equals).toBe('제품');
  });

  /**
   * **The rule written twice.**
   *
   * `rowsOf` filters, sorts and limits in TypeScript; the runtime does it again in the page. They
   * are two pieces of code and one rule, so they are compared against the same rows — including the
   * case every naive sort gets wrong, a number kept as a string.
   */
  /**
   * And the half the marks and the query do not cover: the script **running**.
   *
   * Without this the feature is a page full of correct `data-` attributes and a runtime nobody has
   * ever executed — which is exactly the shape of a check that reads like a passing one. Run against
   * the real exported markup, with the fetch stubbed, in the document the export produced.
   */
  it('writes the fetched rows into the page it published', async () => {
    await live(true);
    const html = exportPage(editor, pageWithList().sid).html;

    const page = document.implementation.createHTMLDocument('t');
    page.documentElement.innerHTML = html.slice(html.indexOf('<body'));

    const list = page.querySelector('[data-st-live]') as HTMLElement;
    const was = [...list.querySelectorAll('[data-st-row]')].length;
    expect(was).toBeGreaterThan(0);

    const answered = [
      { 이름: '새 이름', 설명: '새 설명', 가격: '월 1원', 분류: '제품' },
      { 이름: '둘째', 설명: '둘째 설명', 가격: '월 2원', 분류: '제품' },
      { 이름: '셋째', 설명: '셋째 설명', 가격: '월 3원', 분류: '제품' },
      { 이름: '넷째', 설명: '넷째 설명', 가격: '월 4원', 분류: '제품' },
      // Filtered out by the list's own `where`, which the runtime has to apply as the export did.
      { 이름: '서비스 하나', 설명: '아니오', 가격: '월 5원', 분류: '서비스' }
    ];

    const before = globalThis.fetch;
    (globalThis as never as Record<string, unknown>).fetch = async () => ({ json: async () => answered });
    try {
      new Function('document', liveScript())(page);
      // The fetch, then the json, then the write — each a turn. A macrotask clears all of them.
      await new Promise((done) => setTimeout(done, 0));
    } finally {
      (globalThis as never as Record<string, unknown>).fetch = before;
    }

    const rows = [...list.querySelectorAll<HTMLElement>('[data-st-row]')];
    // Four rows matched the filter, and the drawn three grew by cloning the first.
    const shown = rows.filter((row) => row.style.display !== 'none');
    expect(shown).toHaveLength(4);
    expect(shown[0].textContent).toContain('새 이름');
    expect(shown[3].textContent).toContain('넷째');
    // And the one that did not match never arrives.
    expect(list.textContent).not.toContain('서비스 하나');
  });

  it('runs the same filter, sort and limit as the export does', () => {
    const records = [
      { 이름: '가', 분류: '제품', 가격: '1200', 순서: 2 },
      { 이름: '나', 분류: '서비스', 가격: '900', 순서: 1 },
      { 이름: '다', 분류: '제품', 가격: '900', 순서: 3 },
      { 이름: '라', 분류: '제품', 가격: '10000', 순서: 4 }
    ];
    const dataset = { name: '상품', label: '', kind: 'url' as const, live: true, fields: [], records };

    /** The runtime's own `rows`, lifted out of the script the page ships. */
    const asShipped = new Function(
      'data',
      'q',
      `${liveScript()
        .replace('(function(){', '')
        .replace(/document\.querySelectorAll[\s\S]*$/, '')}return rows(data,q)`
    ) as (data: unknown[], query: Record<string, unknown>) => Record<string, unknown>[];

    for (const query of [
      {},
      { where: '분류', equals: '제품' },
      { sortBy: '가격' },
      { sortBy: '가격', sortDir: 'desc' },
      { sortBy: '순서', sortDir: 'desc' },
      { where: '분류', equals: '제품', sortBy: '가격', limit: 2 }
    ]) {
      expect(asShipped(records, query).map((row) => row['이름'])).toEqual(
        rowsOf(dataset, query).map((row) => row['이름'])
      );
    }
  });

  it('runs the same grouping and the same axis as the export does', () => {
    /**
     * **The check that makes a second implementation safe**, and it is the reason this file already
     * has one for `rows`: the page ships arithmetic written twice — once in TypeScript for the
     * export, once as a string for the visitor — and what keeps them the same is not that they are
     * short. It is this.
     *
     * A chart adds two more: the grouping, and the bounds. Both are lifted out of the shipped script
     * and held against `groupRows` and `boundsOf` over the same rows, so a published dashboard cannot
     * quietly disagree with the editor it was designed in.
     */
    const records = [
      { 이름: '가', 분류: '제품', 가격: 1200 },
      { 이름: '나', 분류: '서비스', 가격: 900 },
      { 이름: '다', 분류: '제품', 가격: 900 },
      { 이름: '라', 분류: '제품' }
    ];

    /** The runtime's own functions, lifted out of the script the page ships. */
    const shipped = new Function(
      'data',
      'q',
      `${liveScript()
        .replace('(function(){', '')
        .replace(/document\.querySelectorAll[\s\S]*$/, '')}return { group: group(data, q), asked: asked(data, q), bounds: bounds(data.map(function(r){return num(r,q.valueBy)}).filter(function(v){return v!==undefined})) }`
    ) as (
      data: unknown[],
      query: Record<string, unknown>
    ) => { group: { rows: Record<string, unknown>[]; valueBy: string }; asked: { rows: Record<string, unknown>[] }; bounds: { low: number; high: number } };

    for (const query of [
      { groupBy: '분류', agg: 'sum', valueBy: '가격' },
      { groupBy: '분류', agg: 'avg', valueBy: '가격' },
      { groupBy: '분류', agg: 'count', valueBy: '가격' },
      { groupBy: '분류', agg: 'min', valueBy: '가격' },
      { groupBy: '분류', agg: 'max', valueBy: '가격' },
      /* And with nothing to group by, which is what most charts say. */
      { valueBy: '가격' },
      /* And the whole query, where the order of the steps is the thing that could differ. */
      { groupBy: '분류', agg: 'sum', valueBy: '가격', where: '분류', equals: '제품', sortBy: '가격', sortDir: 'desc', limit: 1 }
    ]) {
      const ours = groupRows(records, query);
      const theirs = shipped(records, query);
      expect(theirs.group.valueBy, JSON.stringify(query)).toBe(ours.valueBy);
      expect(theirs.group.rows, JSON.stringify(query)).toEqual(ours.rows);

      const asked = chartRows({ records } as never, query);
      expect(theirs.asked.rows, JSON.stringify(query)).toEqual(asked.rows);
    }

    /* And the axis, which is the one number that must **not** travel with the drawing. */
    expect(shipped(records, { valueBy: '가격' }).bounds).toEqual(boundsOf([1200, 900, 900]));
  });

  /**
   * And the same for a **chart**, which is the half a list's check cannot cover.
   *
   * A list's refetch rewrites **words**; a chart's rewrites **where its points are**, which means the
   * geometry runs again in the visitor's browser. So this is the one that says the shipped arithmetic
   * actually moves a bar — run against the real exported markup, with the fetch stubbed.
   */
  it('moves a chart’s bars to the numbers it fetched', async () => {
    await live(true);
    /* 가격 is where the sample's charts are — the bar and the grouped donut beside it. */
    const pricing = pagesOf(doc as never).find((one) => one.path === '/가격')!;
    const html = exportPage(editor, pricing.sid).html;

    const page = document.implementation.createHTMLDocument('t');
    page.documentElement.innerHTML = html.slice(html.indexOf('<body'));

    const chart = page.querySelector('[data-chart="bar"][data-st-live]') as HTMLElement;
    expect(chart).toBeTruthy();
    const bars = [...chart.querySelectorAll<HTMLElement>('[data-st-point]')];
    const was = bars.map((one) => one.getAttribute('height'));

    const answered = [
      { 이름: '문서', 분류: '제품', 가격: 100, 순서: 1 },
      { 이름: '덱', 분류: '제품', 가격: 200, 순서: 2 },
      { 이름: '사이트', 분류: '제품', 가격: 400, 순서: 3 },
      { 이름: '스위트', 분류: '묶음', 가격: 800, 순서: 4 }
    ];

    const before = globalThis.fetch;
    (globalThis as never as Record<string, unknown>).fetch = async () => ({ json: async () => answered });
    try {
      new Function('document', liveScript())(page);
      await new Promise((done) => setTimeout(done, 0));
    } finally {
      (globalThis as never as Record<string, unknown>).fetch = before;
    }

    const now = bars.map((one) => Number(one.getAttribute('height')));
    expect(now.map(String)).not.toEqual(was);
    /* 800 is the tallest and 100 the shortest, in the order the query sorts them. */
    expect(now[3]).toBeGreaterThan(now[0]);
    expect(bars.map((one) => one.getAttribute('data-st-value'))).toEqual(['100', '200', '400', '800']);

    /*
     * **And the axis was recomputed**, not carried: the published maximum was 19,900 and the fetched
     * one is 800, so a bar drawn against the published axis would be four pixels tall. The tallest
     * touches the top of the plot, which is what an axis that ends at its own largest value means.
     */
    const svg = chart.querySelector('svg')!;
    expect(now[3]).toBeCloseTo(Number(svg.getAttribute('data-plot-height')), 0);
  });
});
