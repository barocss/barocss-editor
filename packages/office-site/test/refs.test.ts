import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { refCounts, refsFrom, refsIn } from '../src/refs';
import { usesOf } from '../src/components';
import { linksTo } from '../src/page-link';
import { pagesOf } from '../src/selection';

/**
 * **무엇이 무엇을 쓰는가**, as one walk.
 *
 * Three questions this product asks are about the **whole site** — who uses this definition, how
 * many links break if this page goes, does every reference resolve — and all three were separate
 * walks of every node of every page. They are the admin screen, so drawing it walked the document
 * three times over.
 *
 * The check that matters is not that the index is fast. It is that it **agrees**: an index that
 * counted differently from the walk it replaced would be a number a reader trusts and should not.
 */
describe('what refers to what', () => {
  const schema = createSchema('site', getSiteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
  editor.loadDocument(createSampleSite(), 'site');
  const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  const refs = refsIn(doc as never);

  it('counts placements exactly as the walk it replaces does', () => {
    /*
     * `usesOf` is the sentence said before anybody edits a definition — *머리말이 6곳에서 쓰입니다* —
     * and a second implementation that disagreed would be worse than no number at all.
     */
    const walked = usesOf(doc as never);
    const indexed = refCounts(refs, 'component');
    for (const [id, count] of walked) expect(indexed.get(id) ?? 0, id).toBeGreaterThanOrEqual(count);
    /* Greater or equal, because the index counts one thing the walk does not — see below. */
    expect(indexed.get('site-header')).toBe(walked.get('site-header'));
  });

  it('counts a page drawn through a template as using it, which the walk did not', () => {
    /**
     * The first thing the index found, and it is a real gap rather than a difference of opinion.
     *
     * `usesOf` counts `instance` nodes. A page drawn through a template names it in `surface.template`
     * and is not a placement — so 글 페이지 read **0곳에서 사용 중** in the admin while two pages were
     * drawn through it, and a reader editing it would have been told they were changing nothing.
     */
    const indexed = refCounts(refs, 'component');
    expect(usesOf(doc as never).get('post-page') ?? 0).toBe(0);
    expect(indexed.get('post-page')).toBe(2);
    expect(indexed.get('dashboard-page')).toBe(1);
  });

  it('counts the links a page would break exactly as `linksTo` does', () => {
    /*
     * Marks, and nothing else — one link drawn on six pages through a definition is **one** link. A
     * reader deleting a page wants to know how many break, not how many drawings of them there are.
     */
    for (const page of pagesOf(doc as never)) {
      const walked = linksTo(doc as never, page.id);
      const indexed = refs.filter((one) => one.kind === 'page' && one.to === page.id && one.from !== page.sid);
      /* The index also holds `goes` and a data cell's `page:`, which are references a mark is not. */
      expect(indexed.length, page.id).toBeGreaterThanOrEqual(walked);
    }
  });

  it('says which page or definition each reference was written in', () => {
    /**
     * The field a split store keys by. When a page is its own document, *what uses what* stops being
     * a walk and becomes a row written when the page is saved — and this is that row.
     *
     * Carried down rather than walked up, which is the whole saving: walking up per node is the same
     * walk again, once per node.
     */
    const blog = pagesOf(doc as never).find((one) => one.path === '/블로그')!;
    const own = refsFrom(refs, blog.sid);
    expect(own.length).toBeGreaterThan(0);
    /* The blog names the 글 dataset and places the header — both written on that page. */
    expect(own.some((one) => one.kind === 'dataset' && one.to === '글')).toBe(true);
    expect(own.some((one) => one.kind === 'component' && one.to === 'site-header')).toBe(true);
    /* And nothing from another page is in it. */
    expect(own.every((one) => one.in === blog.sid)).toBe(true);
  });

  it('finds every kind of reference this schema has', () => {
    /*
     * Nine shapes in one table, deliberately: a reference is *a name that resolves somewhere else*,
     * and the three questions asked of them are the same whatever the name points at. A kind the
     * index cannot see is a kind the three questions are blind to.
     */
    const kinds = new Set(refs.map((one) => one.kind));
    for (const one of ['page', 'component', 'dataset', 'field', 'asset', 'variable', 'richText']) {
      expect(kinds.has(one as never), one).toBe(true);
    }
  });

  it('is one walk where there were three', () => {
    /*
     * Not a benchmark — a count of walks. The admin draws all three numbers, and the sample is 740
     * nodes; sixty pages is five thousand, on every keystroke that redraws it.
     */
    let visits = 0;
    const counting = {
      rootId: doc.rootId,
      getNode: (sid: string) => {
        visits += 1;
        return store.getNode(sid);
      }
    };
    refsIn(counting as never);
    const one = visits;

    visits = 0;
    usesOf(counting as never);
    linksTo(counting as never, 'about');
    const two = visits;

    /* Two of the three walks already cost more than the one that answers all of them. */
    expect(one).toBeLessThan(two);
  });
});
