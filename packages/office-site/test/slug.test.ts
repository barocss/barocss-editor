import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { pagesOf } from '../src/selection';
import { documentFaults } from '../src/faults';
import { isCleanPath, pathFaults, pathFor, slugFor } from '../src/slug';

/**
 * **An address that is actually an address.**
 *
 * `path` was a free string, and the table below is what that meant — measured by typing each one into
 * the command and asking the document what it kept. Not one of these is a Korean problem: they are
 * the ordinary ways a free string stops being a URL, and the product had no opinion about any of them.
 */
describe('what a page’s address is', () => {
  it('is a path, whatever was typed into the box', () => {
    // No leading slash is a **relative** link: from `/가격` this means `/가격/my-page`.
    expect(pathFor('My Page')).toBe('/my-page');
    // `?` starts a query and `#` is never sent to a server at all.
    expect(pathFor('/제품?a=1')).toBe('/제품');
    expect(pathFor('/제품#어디')).toBe('/제품');
    // `//x` is protocol-relative — a link to somebody else's host, off the site entirely.
    expect(pathFor('//x')).toBe('/x');
    // A trailing slash is a second address for one page, which search engines count as duplicated.
    expect(pathFor('/A/')).toBe('/a');
    // And the root stays the root.
    expect(pathFor('')).toBe('/');
    expect(pathFor('/')).toBe('/');
  });

  it('keeps Hangul, and does not romanise it', () => {
    /*
     * `제품` and not `jepum`. Romanisation reads as neither language — nobody types it, nobody
     * recognises it in a search result, and two people transliterate the same word differently. A
     * reader who wants an English address types one; that is theirs to decide.
     */
    expect(slugFor('제품')).toBe('제품');
    expect(pathFor('/제품/새 소식')).toBe('/제품/새-소식');
    expect(pathFor('/Products')).toBe('/products');
  });

  it('says whether a stored address is already one', () => {
    expect(isCleanPath('/제품')).toBe(true);
    expect(isCleanPath('/제품/')).toBe(false);
    expect(isCleanPath(undefined)).toBe(false);
  });
});

describe('two pages at one address', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  it('is the fault nothing could see', async () => {
    /*
     * Both pages publish a file with the same name — so one overwrites the other in the archive — and
     * every link to either resolves to whichever the walk found first. The lost page is still in the
     * panel and still editable, which is exactly what stops a reader noticing.
     */
    const pages = pagesOf(doc as never);
    expect(documentFaults(doc as never, {}).filter((one: any) => one.kind === 'address')).toEqual([]);

    await editor.executeCommand('setPageInfo', { nodeId: pages[1].sid, path: '/소개' });

    const faults = documentFaults(doc as never, {}).filter((one: any) => one.kind === 'address');
    expect(faults).toHaveLength(1);
    // Reported against the **second** one, which is the page a reader would go and change.
    expect(faults[0].sid).toBe(pages[3].sid);
    expect(faults[0].said).toContain('주소가 같습니다');
  });

  it('repairs what a reader types rather than storing it', async () => {
    const pages = pagesOf(doc as never);
    await editor.executeCommand('setPageInfo', { nodeId: pages[1].sid, path: '제품 목록?a=1' });
    expect(pagesOf(doc as never)[1].path).toBe('/제품-목록');
  });

  it('counts an address as taken however it is spelled', () => {
    // The same word in two Unicode forms is one address — see `names.ts` for what that costs when it
    // is not, and `pathFor` composes on the way through.
    expect(
      pathFaults([
        { sid: 'a', name: '소개', path: '/소개' },
        { sid: 'b', name: '소개 2', path: '/소개'.normalize('NFD') }
      ])
    ).toHaveLength(1);
  });
});

/**
 * **A name gives a page its address — once.**
 *
 * A reader who makes a page and calls it 제품 means it to be at `/제품`, and typing the same word
 * twice is what a tool should save them. The half that matters is the *once*: an address is what has
 * been shared, linked and indexed, so a rename must never move a page.
 */
describe('naming a page', () => {
  const site = () => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    return { editor, doc: { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) } };
  };

  it('gives a new page the address its name asks for, in Latin letters', async () => {
    const { editor, doc } = site();
    await editor.executeCommand('insertPage');

    const made = pagesOf(doc as never).at(-1)!;
    // What `insertPage` minted, and what nobody has touched.
    expect(made.path).toBe(`/${made.id}`);

    /**
     * **`/munui`, not `/문의`** — and the reason is the address bar.
     *
     * Hangul goes in as typed and comes out as `/%EB%AC%B8%EC%9D%98`: in the address bar, in a copied
     * link, in an analytics report. A reader who copies the URL of their own page gets hex to paste
     * into a chat. Reported as *영문 slug 가 우선이고 한글은 후자야*, which reverses what `slug.ts`
     * had recorded — and keeps the other half, below.
     */
    await editor.executeCommand('setPageInfo', { nodeId: made.sid, name: '문의' });
    expect(pagesOf(doc as never).at(-1)!.path).toBe('/munui');
  });

  it('still writes exactly what a reader types, including Hangul', async () => {
    /*
     * The generated address is the product's; a typed one is the reader's. `pathFor` on the field is
     * unchanged — it slugs each segment and drops a query and a fragment, and it keeps the script.
     */
    const { editor, doc } = site();
    await editor.executeCommand('insertPage');
    const made = pagesOf(doc as never).at(-1)!;

    await editor.executeCommand('setPageInfo', { nodeId: made.sid, path: '/새 소식' });
    expect(pagesOf(doc as never).at(-1)!.path).toBe('/새-소식');
  });

  it('does not put two pages at one address, even when their names romanise alike', async () => {
    /*
     * Two pages named 소개 would both land on `/sogae`: two files with one name in the published
     * folder, every link resolving to whichever the walk found first, and the loser still in the
     * panel and unreachable. That is the one fault `pathFaults` exists to report — generating it
     * deliberately would be perverse.
     */
    const { editor, doc } = site();
    await editor.executeCommand('insertPage');
    const first = pagesOf(doc as never).at(-1)!;
    await editor.executeCommand('setPageInfo', { nodeId: first.sid, name: '소식' });

    await editor.executeCommand('insertPage');
    const second = pagesOf(doc as never).at(-1)!;
    await editor.executeCommand('setPageInfo', { nodeId: second.sid, name: '소식' });

    const all = pagesOf(doc as never);
    expect(all.find((one: any) => one.sid === first.sid)!.path).toBe('/sosik');
    expect(all.find((one: any) => one.sid === second.sid)!.path).toBe('/sosik-2');
  });

  it('never moves a page that already has one', async () => {
    /*
     * The address is what has been shared and indexed. A rename that moved it would break every link
     * anybody had saved, silently — and the reader who renamed a page did not ask for that.
     */
    const { editor, doc } = site();
    const products = pagesOf(doc as never).find((one: any) => one.id === 'products')!;

    await editor.executeCommand('setPageInfo', { nodeId: products.sid, name: '제품과 가격' });
    expect(pagesOf(doc as never).find((one: any) => one.id === 'products')!.path).toBe('/제품');
  });
});

/**
 * **한글을 라틴 문자로** — 국어의 로마자 표기법의 글자 표를, 음절 하나씩.
 *
 * The table rather than a judgement, which is the answer to the objection `slug.ts` recorded against
 * doing this at all: *two people transliterate the same word differently*. True, and exactly why the
 * product does it **one way, always** — a reader who dislikes the result types over it, which is one
 * field and is theirs.
 */
describe('한글에서 뽑은 영문 주소', () => {
  it('reads the syllable as an initial, a medial and a final', async () => {
    const { romanise } = await import('../src/slug');

    expect(romanise('제품')).toBe('jepum');
    expect(romanise('가격')).toBe('gagyeok');
    expect(romanise('소개')).toBe('sogae');
    expect(romanise('대시보드')).toBe('daesibodeu');
    /* 받침 ㅇ is `ng`, and 받침 ㅅ/ㅈ/ㅊ/ㅌ/ㅎ all stop as `t`. */
    expect(romanise('상품')).toBe('sangpum');
    expect(romanise('꽃')).toBe('kkot');
  });

  it('makes the one assimilation an ordinary word shows', async () => {
    const { romanise } = await import('../src/slug');
    /*
     * 받침 ㄹ + 초성 ㄹ → `ll`. The rest of 자음 동화 is deliberately not attempted: a slug has to be
     * **the same every time**, which a full pass with its exceptions would stop being.
     */
    expect(romanise('블로그')).toBe('beullogeu');
    expect(romanise('설립')).toBe('seollip');
  });

  it('leaves alone everything that is not a Hangul syllable', async () => {
    const { romanise, latinSlugFor } = await import('../src/slug');
    /* A name is usually mixed, and mangling the half that is already Latin would be the opposite. */
    expect(romanise('Barocss 소개')).toBe('Barocss sogae');
    expect(latinSlugFor('Barocss 소개')).toBe('barocss-sogae');
    expect(latinSlugFor('API v2')).toBe('api-v2');
    /* And a name with nothing usable in it still has to produce an address — see `freeAddressFor`. */
    expect(latinSlugFor('???')).toBe('');
  });

  it('steps aside rather than landing on an address already taken', async () => {
    const { freeAddressFor } = await import('../src/slug');
    expect(freeAddressFor('제품', [])).toBe('/jepum');
    expect(freeAddressFor('제품', ['/jepum'])).toBe('/jepum-2');
    expect(freeAddressFor('제품', ['/jepum', '/jepum-2'])).toBe('/jepum-3');
    /* `-2`, not a hash: `/jepum-2` is a page a reader recognises as the second one and renames. */
    expect(freeAddressFor('???', [])).toBe('/page');
  });
});
