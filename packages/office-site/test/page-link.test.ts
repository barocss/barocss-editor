import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import {
  addressFor,
  addressLinkOf,
  hrefFor,
  isPageRef,
  linkFaults,
  pageIdOf,
  pageLinkOf,
  pageRef,
  pagesIn
} from '../src/page-link';

/**
 * A link that goes to a page of this site.
 *
 * ## What this is holding
 *
 * The sample had five pages with addresses, a navigation row reading 제품 · 가격 · 소개 · 블로그, and
 * **zero `<a>` elements** — measured, which is how it was found at all. Half of that was the `link`
 * mark drawing nothing anywhere in the suite; this is the other half.
 *
 * The claim under test is not "a link works". It is the narrower and more useful one: **a link
 * survives its page's address changing**, because it never stored the address. That is a claim about
 * a *resolution*, so it is tested where the resolution happens rather than through a browser — the
 * whole point of resolving at draw time is that there is one place to ask.
 */
describe('a link to a page of this site', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;

  const run = async (name: string, payload?: Record<string, unknown>) =>
    await editor.executeCommand(name, payload);
  const can = (name: string, payload?: Record<string, unknown>) => editor.canExecuteCommand(name, payload);

  /** The nav's four runs, which is what the sample links with. */
  const navRuns = (): any[] => {
    const found: any[] = [];
    const walk = (sid: string) => {
      const node = store.getNode(sid) as any;
      if (!node) return;
      if (typeof node.text === 'string' && pageLinkOf(node)) found.push(node);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    return found;
  };

  const select = (sid: string, from: number, to: number) =>
    editor.selectionManager.setSelection({
      type: 'range',
      startNodeId: sid,
      startOffset: from,
      endNodeId: sid,
      endOffset: to,
      collapsed: from === to
    } as never);

  /** A paragraph's own text node, for the words a test wants to link. */
  const someWords = (): string => {
    const walk = (sid: string): string | undefined => {
      const node = store.getNode(sid) as any;
      if (!node) return undefined;
      if (typeof node.text === 'string' && node.text.length > 2 && !pageLinkOf(node)) return sid;
      for (const child of node.content ?? []) {
        if (typeof child === 'string') {
          const hit = walk(child);
          if (hit) return hit;
        }
      }
      return undefined;
    };
    return walk(editor.getRootId())!;
  };

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  it('finds the pages a link can name', () => {
    const pages = pagesIn(doc);
    expect(pages.map((page) => page.id)).toEqual(['home', 'products', 'pricing', 'about', 'blog']);
    expect(pages.map((page) => page.path)).toEqual(['/', '/제품', '/가격', '/소개', '/블로그']);
  });

  it('draws the sample’s navigation and footer as links, resolved to addresses', () => {
    const runs = navRuns();
    // Four in the bar, four again in the menu a phone opens, and three in the footer — the three
    // places this site puts them, and the middle one is why 열림 exists.
    expect(runs.map((one) => one.text)).toEqual([
      '제품', '가격', '소개', '블로그',
      '제품', '가격', '소개', '블로그',
      '제품', '가격', '소개'
    ]);

    // The document stores ids; what a link *is* on the page is the address they resolve to.
    expect(runs.slice(0, 4).map((one) => pageLinkOf(one))).toEqual(['products', 'pricing', 'about', 'blog']);
    expect(runs.map((one) => hrefFor(doc, `page:${pageLinkOf(one)}`))).toEqual([
      '/제품', '/가격', '/소개', '/블로그',
      '/제품', '/가격', '/소개', '/블로그',
      '/제품', '/가격', '/소개'
    ]);
  });

  it('follows a page whose address is changed, which is the whole reason it stores an id', async () => {
    const products = pagesIn(doc).find((page) => page.id === 'products')!;
    const before = navRuns()[0];
    expect(hrefFor(doc, `page:${pageLinkOf(before)}`)).toBe('/제품');

    await run('setPageInfo', { nodeId: products.sid, path: '/products' });

    // The run itself is untouched — nothing rewrote a link — and it now goes somewhere else.
    const after = navRuns()[0];
    expect(after.text).toBe('제품');
    expect(hrefFor(doc, `page:${pageLinkOf(after)}`)).toBe('/products');
  });

  it('leaves an ordinary address alone, and says which is which', () => {
    expect(isPageRef('page:home')).toBe(true);
    expect(isPageRef('https://barocss.com/제품')).toBe(false);
    expect(pageIdOf(pageRef('home'))).toBe('home');

    expect(hrefFor(doc, 'https://barocss.com')).toBe('https://barocss.com');
    expect(hrefFor(doc, 'mailto:hello@barocss.com')).toBe('mailto:hello@barocss.com');
    expect(hrefFor(doc, '')).toBeUndefined();
    expect(hrefFor(doc, undefined)).toBeUndefined();
  });

  it('draws a link to a page that is gone as no link at all', () => {
    // Not the raw `page:없음`, which a browser would follow to a relative address that does not
    // exist — an `<a>` with no `href` is the one shape a browser draws as *not a link*.
    expect(hrefFor(doc, 'page:없음')).toBeUndefined();
    expect(linkFaults(doc)).toEqual([]);
  });

  it('reports the links that name a page which is not there', () => {
    /*
     * A fixture rather than a gesture, and the reason is a finding of its own: **no command in this
     * product removes a page, and none changes a page's id** — `_chosen` refuses a surface by name
     * ("the page itself is not a thing a reader can remove") and the id is exempt from the panel on
     * purpose, because a reference target a reader can retype is a reference broken silently.
     *
     * So a fault of this kind cannot be *made* here today. It can still arrive — a file written by
     * an older version, a page removed by whatever eventually removes one — and the product has to
     * be able to say so, because the drawing cannot: unlinked words look like words. The gap is on
     * the record in `BACKLOG.md`, and the day a page can be deleted this test gets its gesture.
     */
    const nodes: Record<string, any> = {
      root: { sid: 'root', stype: 'site', content: ['home', 'body'] },
      home: { sid: 'home', stype: 'surface', attributes: { kind: 'flow', id: 'home', name: '홈', path: '/' } },
      body: { sid: 'body', stype: 'paragraph', content: ['one', 'two'] },
      one: { sid: 'one', text: '홈', marks: [{ stype: 'link', attributes: { href: 'page:home' } }] },
      two: { sid: 'two', text: '가격', marks: [{ stype: 'link', attributes: { href: 'page:pricing' } }] }
    };
    const broken = { rootId: 'root', getNode: (sid: string) => nodes[sid] };

    expect(linkFaults(broken)).toEqual([{ sid: 'two', href: 'page:pricing', missing: 'pricing' }]);
    expect(hrefFor(broken, 'page:home')).toBe('/');
    expect(hrefFor(broken, 'page:pricing')).toBeUndefined();
  });

  it('links the selected words, and refuses a caret', async () => {
    const sid = someWords();
    const words = (store.getNode(sid) as any).text as string;

    select(sid, 0, 0);
    expect(can('linkToPage')).toBe(false);
    expect(can('linkToPage', { id: 'pricing' })).toBe(false);
    // A zero-length link is nothing to read, nothing to click, and nothing on screen to say so.
    expect(await run('linkToPage', { id: 'pricing' })).toBe(false);
    expect(pageLinkOf(store.getNode(sid) as never)).toBeUndefined();

    select(sid, 0, words.length);
    expect(can('linkToPage')).toBe(true);
    expect(await run('linkToPage', { id: 'pricing' })).toBe(true);
    expect(pageLinkOf(store.getNode(sid) as never)).toBe('pricing');
  });

  it('refuses to write a reference to a page that does not exist', async () => {
    const sid = someWords();
    select(sid, 0, 2);

    expect(can('linkToPage', { id: '없는페이지' })).toBe(false);
    expect(await run('linkToPage', { id: '없는페이지' })).toBe(false);
    expect(await run('linkToPage')).toBe(false);
    expect(pageLinkOf(store.getNode(sid) as never)).toBeUndefined();
  });

  /**
   * **A link out of the site**, and the one thing about it that is not obvious.
   *
   * A reader types `barocss.com`, because that is what the address *is* to them. Written into an
   * `href` unchanged it is relative: followed from `/제품` it goes to `/제품/barocss.com`. The link
   * draws, it is clickable, it looks right, and it is wrong only once somebody follows it — which is
   * the shape of failure this whole file exists about, one layer out.
   */
  it('writes an address a browser can follow, from one a reader would type', async () => {
    const sid = someWords();
    select(sid, 0, 2);

    expect(await run('linkToAddress', { href: 'barocss.com' })).toBe(true);
    expect(addressLinkOf(store.getNode(sid) as never)).toBe('https://barocss.com');
    // And it is not mistaken for a page of this site, which is what would break the fault list.
    expect(pageLinkOf(store.getNode(sid) as never)).toBeUndefined();
    expect(linkFaults(doc as never)).toEqual([]);
  });

  /**
   * And everything that already says how to be followed is left exactly alone.
   *
   * The three most useful addresses a page carries are the ones a "helpful" prefix would ruin: a
   * mail link, a link to another page by path, and a jump to a section of this one.
   */
  it('leaves an address that already says how to be followed', () => {
    expect(addressFor('https://barocss.com/제품')).toBe('https://barocss.com/제품');
    expect(addressFor('mailto:hello@barocss.com')).toBe('mailto:hello@barocss.com');
    expect(addressFor('tel:+82-2-0000-0000')).toBe('tel:+82-2-0000-0000');
    expect(addressFor('/가격')).toBe('/가격');
    expect(addressFor('#요금')).toBe('#요금');
    expect(addressFor('//cdn.example.com/a')).toBe('//cdn.example.com/a');
    // Typed with room around it, which is what a paste from a browser's address bar looks like.
    expect(addressFor('  barocss.com  ')).toBe('https://barocss.com');
  });

  /**
   * `page:` is refused rather than normalised.
   *
   * It is this product's own way of naming a page, and accepting it here would be a second way to
   * write an internal link — one that does not check the page is there, which is exactly what
   * `linkToPage` refuses to do.
   */
  it('refuses a page reference, an empty address, and a caret', async () => {
    const sid = someWords();
    select(sid, 0, 2);

    expect(can('linkToAddress', { href: pageRef('홈') })).toBe(false);
    expect(await run('linkToAddress', { href: pageRef('홈') })).toBe(false);
    expect(can('linkToAddress', { href: '   ' })).toBe(false);
    expect(addressLinkOf(store.getNode(sid) as never)).toBeUndefined();

    // A mark covers a range, and a caret is not one — the neighbouring command's rule.
    select(sid, 1, 1);
    expect(can('linkToAddress', { href: 'barocss.com' })).toBe(false);
    expect(await run('linkToAddress', { href: 'barocss.com' })).toBe(false);
  });

  /**
   * With nothing typed yet, the answer is *can a reader link at all* — and it has to be yes.
   *
   * A control asks this on every render before anything is in the box. `linkToPage` records the same
   * mistake being made once already: answering `false` here leaves the field permanently disabled
   * while every check stays green.
   */
  it('says yes to a field that has nothing in it yet, when there are words to link', () => {
    const sid = someWords();
    select(sid, 0, 2);
    expect(can('linkToAddress')).toBe(true);

    select(sid, 1, 1);
    expect(can('linkToAddress')).toBe(false);
  });
});
