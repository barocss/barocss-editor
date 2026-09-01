import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { pagesOf } from '../src/selection';
import { documentFaults } from '../src/faults';
import { exportPage, fileFor } from '../src/export-html';
import { nfc, sameName } from '../src/names';
import { aspectCss } from '../src/aspect';
import {
  ASSET_PREFIX,
  assetFaults,
  assetFileName,
  assetNamed,
  assetSrc,
  assetsOf,
  byteLength,
  srcsetFor
} from '../src/assets';

/**
 * **The files a site is made of.**
 *
 * The largest gap the product had left: a `picture` carried a `src` string and nothing anywhere could
 * put a **file** in one. The sample got away with it by drawing its art as SVG data URIs — a thing a
 * product's author can do and a reader cannot — so adding a photograph was not possible at all, which
 * is the second most common thing anybody does on a page after writing on it.
 *
 * What is worth holding is the pair: **the bytes on a board, the file's own path on a published
 * page.** Those are the same drawing being more correct on each side rather than two drawings, and it
 * is the reason a logo on five pages is one file rather than five copies of it.
 */

/** A one-pixel PNG, as base64 — the smallest thing that is honestly a file. */
const DOT =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('a file the document holds', () => {
  let editor: any;
  let store: DataStore;
  let home: string;
  let doc: any;

  beforeEach(async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc as never)[0].sid;

    await editor.executeCommand('insertAsset', {
      label: '로고.png',
      type: 'image/png',
      data: DOT,
      width: 1,
      height: 1
    });
  });

  it('names it after the file, without repeating the type', () => {
    // `로고.png` becomes `로고`: the type is on the node already, and a name that repeats it reads as
    // `로고.png.png` in the published folder.
    expect(assetsOf(doc).map((one) => one.name)).toEqual(['로고']);
    expect(assetNamed(doc, '로고')?.type).toBe('image/png');
  });

  it('does not overwrite a file of the same name', async () => {
    /*
     * The more helpful-looking answer and the wrong one: a reader adding a second logo has not asked
     * to lose the first. `assetNamed` answers with whichever came first, so two of one name is one of
     * them unreachable.
     */
    await editor.executeCommand('insertAsset', { label: '로고.png', type: 'image/png', data: DOT });
    expect(assetsOf(doc).map((one) => one.name)).toEqual(['로고', '로고 2']);
  });

  it('is the bytes on a board and the file’s own path on a published page', async () => {
    const picture = (function find(sid: string, depth = 0): string | undefined {
      if (depth > 40) return undefined;
      for (const child of ((store.getNode(sid) as any)?.content ?? []) as unknown[]) {
        if (typeof child !== 'string') continue;
        if ((store.getNode(child) as any)?.stype === 'picture') return child;
        const found = find(child, depth + 1);
        if (found) return found;
      }
      return undefined;
    })(home)!;

    editor.executeCommand('setNode', { nodeIds: [picture] });
    await editor.executeCommand('setBlockFormat', { src: `${ASSET_PREFIX}로고` });

    /*
     * The board has no server to ask, so it draws the bytes; the published page gets a path, because
     * inlining a logo used on five pages writes its bytes five times — and a photograph in the middle
     * of the HTML delays the first paint by exactly as long as it takes to download.
     *
     * The board half is asked of the **resolution** rather than of `drawnHtml`, which is the export's
     * own drawing and therefore already the published side. That a real board draws the bytes is held
     * in `site.spec.ts`, where there is a real board to look at.
     */
    expect(assetSrc(doc, `${ASSET_PREFIX}로고`)).toBe(`data:image/png;base64,${DOT}`);
    const html = exportPage(editor, home).html;
    expect(html).toContain('src="assets/로고.png"');
    expect(html).not.toContain(DOT);

    // And the file's own size, which is what stops the words under it jumping down as it arrives.
    expect(html).toMatch(/width="1"[^>]*height="1"|height="1"[^>]*width="1"/);
  });

  it('leaves an address alone, and a missing file visible', () => {
    // Every `src` already in a document goes on working exactly as it did.
    expect(assetSrc(doc, 'https://example.com/a.png')).toBe('https://example.com/a.png');
    /*
     * And a name that points at nothing comes back as **itself** rather than as an empty string: an
     * `<img src="asset:없음">` draws a broken image a reader can see and fix, where `src=""`
     * re-requests the page it is on and draws nothing at all.
     */
    expect(assetSrc(doc, `${ASSET_PREFIX}없음`)).toBe(`${ASSET_PREFIX}없음`);
  });

  it('writes each file once, whatever draws it', () => {
    /*
     * The publish hands back the pictures beside the sitemap — as **bytes**, because base64 written
     * through the text path is a file no viewer opens and a charset on a binary type is a lie the
     * browser then repeats.
     */
    let got: any;
    void editor.executeCommand('exportSite', { write: (one: unknown) => (got = one) });
    const files = got.files.filter((one: any) => one.file.startsWith('assets/'));
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({ file: 'assets/로고.png', type: 'image/png', bytes: DOT });
  });

  it('says how large the pictures have made the document, at the point it matters', () => {
    // Not a limit — nothing refuses a file. The honest thing a product can do about a cost it chose
    // is report it where it starts to matter.
    expect(assetFaults(doc)).toEqual([]);
    expect(byteLength(DOT)).toBe(70);
    expect(assetFileName({ name: '로 고/x', type: 'image/svg+xml' } as never)).toBe('assets/로-고-x.svg');
  });
});

/**
 * And what a document can be **wrong** about a file, neither of which shows on screen.
 */
describe('what is wrong with the files', () => {
  it('reports a picture naming a file the document does not hold', async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const home = pagesOf(doc as never)[0].sid;

    const picture = (function find(sid: string, depth = 0): string | undefined {
      if (depth > 40) return undefined;
      for (const child of ((store.getNode(sid) as any)?.content ?? []) as unknown[]) {
        if (typeof child !== 'string') continue;
        if ((store.getNode(child) as any)?.stype === 'picture') return child;
        const found = find(child, depth + 1);
        if (found) return found;
      }
      return undefined;
    })(home)!;

    editor.executeCommand('setNode', { nodeIds: [picture] });
    await editor.executeCommand('setBlockFormat', { src: `${ASSET_PREFIX}없는 그림` });

    /*
     * The same shape as a link to a page that was deleted, and just as invisible: the image breaks on
     * the one page that draws it, and a reader looking at any other page sees nothing wrong.
     */
    const faults = documentFaults(doc as never, {}).filter((one) => one.kind === 'asset');
    expect(faults).toHaveLength(1);
    expect(faults[0].sid).toBe(picture);
    expect(faults[0].said).toContain('없는 그림');
  });

  it('says when the pictures have made the document heavy, against the document itself', () => {
    // No block to click on for "this document is 12MB", so it is reported against the root — which is
    // the honest place for a fault about a cost the whole document carries.
    const big = { name: '큰 그림', type: 'image/png', data: 'A'.repeat(12 * 1024 * 1024) } as never;
    expect(assetFaults({ rootId: 'r', getNode: () => undefined } as never)).toEqual([]);
    expect(byteLength((big as any).data)).toBeGreaterThan(8 * 1024 * 1024);
  });
});

/**
 * **The same word, two byte sequences** — the one thing a Korean address and a Korean file name can
 * be wrong about while looking completely right.
 *
 * `제품` composes to six bytes and decomposes to nine, and both are correct Unicode. They render
 * identically on every screen and `'제품' === '제품'` is `false` when one is each. A keyboard produces
 * the composed form; **a macOS file picker has handed over the decomposed one for twenty years**, and
 * an asset is named after the file that arrived.
 */
describe('a name a reader can read', () => {
  const decomposed = (value: string) => value.normalize('NFD');

  it('is one name however it was spelled', () => {
    expect(nfc(decomposed('로고'))).toBe('로고');
    expect(sameName(decomposed('로고'), '로고')).toBe(true);
    // And it is genuinely two different strings before this, which is the whole reason for it.
    expect(decomposed('로고') === '로고').toBe(false);
  });

  it('does not let a file picker’s spelling make a second, unreachable picture', async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };

    await editor.executeCommand('insertAsset', { label: '로고.png', type: 'image/png', data: DOT });
    // The same file, chosen from a Finder that spells it the other way.
    await editor.executeCommand('insertAsset', {
      label: `${decomposed('로고')}.png`,
      type: 'image/png',
      data: DOT
    });

    /*
     * Two pictures, and the second is called `로고 2` — because they are the *same name* and the
     * dedupe saw it. Without composing, both would be stored as `로고`, the check would pass, and
     * `assetNamed` would answer with the first for both references: one picture permanently
     * unreachable, and nothing anywhere saying so.
     */
    expect(assetsOf(doc).map((one) => one.name)).toEqual(['로고', '로고 2']);
    // And either spelling finds the first, which is what a document from somewhere else needs.
    expect(assetNamed(doc, decomposed('로고'))?.name).toBe('로고');
  });

  it('writes a page’s file the way a browser asks for it', async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const products = pagesOf(doc as never).find((one) => one.path === '/제품')!;

    // A path that arrived decomposed — from a paste, or a document written elsewhere.
    await editor.executeCommand('setPageInfo', { nodeId: products.sid, path: decomposed('/제품') });

    /*
     * A browser requests `/제품` composed, always. A file stored decomposed is the same word in
     * different bytes and a 404 nobody can see by looking at either the address or the folder.
     */
    expect(fileFor(exportPage(editor, products.sid).path)).toBe('제품/index.html');
    expect(exportPage(editor, products.sid).file.normalize('NFC')).toBe(
      exportPage(editor, products.sid).file
    );
  });
});

/**
 * **The same picture, smaller** — and the shape it keeps.
 *
 * The single largest cost of a page anybody builds with a tool like this is a photograph taken at
 * 4000 pixels and sent, whole, to a phone that is 390 wide. It is most of what such a page weighs and
 * no amount of CSS shortens the download. A browser has had the answer since 2014 and needs to be
 * handed the sizes.
 */
describe('a picture at the size it is needed', () => {
  const site = () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    return { editor, store, doc, home: pagesOf(doc as never)[0].sid };
  };

  const pictureOn = (store: DataStore, sid: string): string =>
    (function find(at: string, depth = 0): string | undefined {
      if (depth > 40) return undefined;
      for (const child of ((store.getNode(at) as any)?.content ?? []) as unknown[]) {
        if (typeof child !== 'string') continue;
        if ((store.getNode(child) as any)?.stype === 'picture') return child;
        const found = find(child, depth + 1);
        if (found) return found;
      }
      return undefined;
    })(sid)!;

  it('hands a browser the list and lets it choose', async () => {
    const { editor, store, doc, home } = site();
    await editor.executeCommand('insertAsset', {
      label: '사진.png',
      type: 'image/png',
      data: DOT,
      width: 4000,
      height: 3000,
      sizes: [
        { width: 640, data: DOT },
        { width: 1280, data: DOT }
      ]
    });

    const picture = pictureOn(store, home);
    editor.executeCommand('setNode', { nodeIds: [picture] });
    await editor.executeCommand('setBlockFormat', { src: `${ASSET_PREFIX}사진` });

    /*
     * Every rendition **and the file itself**, each with its own width — because the last entry is the
     * one a large screen should get and leaving it out would cap the picture at 1280.
     */
    expect(srcsetFor(assetNamed(doc, '사진'))).toBe(
      'assets/사진-640.png 640w, assets/사진-1280.png 1280w, assets/사진.png 4000w'
    );

    const html = exportPage(editor, home).html;
    expect(html).toContain('srcset="assets/사진-640.png 640w');
    // Which one to fetch is the browser's decision, knowing the screen and the connection.
    expect(html).toContain('sizes=');

    // And each rendition is its own file beside the pages.
    let got: any;
    void editor.executeCommand('exportSite', { write: (one: unknown) => (got = one) });
    expect(got.files.map((one: any) => one.file)).toEqual(
      expect.arrayContaining(['assets/사진.png', 'assets/사진-640.png', 'assets/사진-1280.png'])
    );
  });

  it('says nothing at all when there is only one size', () => {
    const { doc } = site();
    /*
     * A `srcset` with one entry is a longer attribute that says exactly what `src` already said. The
     * sample's own art is SVG, which is every size at once.
     */
    expect(srcsetFor(undefined)).toBeUndefined();
    expect(srcsetFor({ name: 'x', type: 'image/png', data: DOT, sizes: [], width: 10 } as never)).toBeUndefined();
    void doc;
  });

  it('keeps the shape a designer asked for, which a height cannot say', () => {
    /*
     * A picture in a column is 1200 wide on a laptop and 350 on a phone. What a designer means by
     * "this is a banner" is a **ratio**; stating a height instead is how a hero ends up letterboxed at
     * one width and cropped at the other.
     */
    expect(aspectCss({ aspect: '16/9' })).toEqual({ aspectRatio: '16/9', height: 'auto' });
    // `height: auto` is the half everyone forgets: an `<img>` carrying a `height` attribute is sized
    // from it, and a ratio without releasing the height is a box the browser ignores.
    expect(aspectCss({})).toEqual({});
    expect(aspectCss({ aspect: 'banana' })).toEqual({});
  });

  it('waits for a picture only where the reader said to', async () => {
    const { editor, store, home } = site();
    const picture = pictureOn(store, home);
    editor.executeCommand('setNode', { nodeIds: [picture] });

    // Off by default: `lazy` on a picture above the fold delays the one image a visitor is waiting
    // for, and nothing but the design knows which picture that is.
    expect(exportPage(editor, home).html).not.toContain('loading="lazy"');

    await editor.executeCommand('setBlockFormat', { defer: true });
    expect(exportPage(editor, home).html).toContain('loading="lazy"');
  });
});
