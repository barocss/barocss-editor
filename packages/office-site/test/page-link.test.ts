import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { hrefFor, isPageRef, linkFaults, pageIdOf, pageLinkOf, pageRef, pagesIn } from '../src/page-link';

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

  it('draws the sample’s navigation as four links, resolved to addresses', () => {
    const runs = navRuns();
    expect(runs.map((one) => one.text)).toEqual(['제품', '가격', '소개', '블로그']);

    // The document stores ids; what a link *is* on the page is the address they resolve to.
    expect(runs.map((one) => pageLinkOf(one))).toEqual(['products', 'pricing', 'about', 'blog']);
    expect(runs.map((one) => hrefFor(doc, `page:${pageLinkOf(one)}`))).toEqual([
      '/제품',
      '/가격',
      '/소개',
      '/블로그'
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
      home: { sid: 'home', stype: 'surface', attributes: { id: 'home', name: '홈', path: '/' } },
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
});
