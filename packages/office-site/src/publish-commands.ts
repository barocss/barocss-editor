/**
 * **Publishing** — the gesture a site builder exists for, and the one it did not have.
 *
 * ## What was wrong, and why nothing caught it
 *
 * `exportSite` has rendered every page of a document for weeks. It is held by `export.test.ts`, it is
 * compared property by property against what the editor draws, and it was reachable from
 * `window.exportSite` — put there *for the console and for tests* — and from no control in the
 * product. A site builder that cannot publish is not finished.
 *
 * The reason the harness could not see it is worth more than the fault: `every-command-can-be-reached`
 * counts **commands**, and this was a function. A capability that is not a command is invisible to
 * every check this repository has. So the fix is not "add a button" — it is *make it a command*, at
 * which point the harness starts asking whether a reader can run it and will keep asking.
 *
 * ## Why the writing is the app's
 *
 * These hand back what to write and write nothing. A package that reached for `document.createElement`
 * to trigger a download would be a model package that only runs in a browser, and the export is
 * already used by a test that has no download in it. What a file *is* — a download, a zip, a POST to
 * a host — is the app's question, and the day this product grows a deploy target it will be a
 * different answer with the same command in front of it.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { exportPage, exportSite, robotsFor, sitemapFor, type ExportedPage } from './export-html';
import { assetFileName, assetsOf, renditionFileName } from './assets';
import { pagesOf } from './selection';

/**
 * One file a publish produced — **words or bytes**, and never both.
 *
 * `text` was the only shape, and it was enough right up until a site had a photograph in it. A PNG
 * is not a string: base64 is how it *travels* through the document, and a file written as base64 is
 * a file no browser can open. So a picture arrives as `bytes` — still base64, decoded by whoever
 * writes it — and the two are separate fields rather than one union, because a caller that has to
 * guess which it got is a caller that will guess wrong on the file that matters.
 */
export interface PublishedFile {
  file: string;
  type: string;
  /** The contents, for a file made of words: a page, a sitemap. */
  text?: string;
  /** The contents as base64, for a file made of bytes: a picture. */
  bytes?: string;
}

/** What a publish produced, handed to whoever asked to run it. */
export interface Published {
  pages: ExportedPage[];
  /**
   * And the files that are the **site's** rather than a page's — a sitemap, and one day a feed.
   *
   * Beside the pages rather than among them, because a page carries an `html` and a sitemap carries
   * XML: one list holding both would need a field called `html` that sometimes is not. Each says its
   * own file name and type, which is also how the app stopped having to know that a page at `/` is
   * written as `index.html`.
   *
   * Empty when the site has not said where it lives — every `<loc>` in a sitemap is absolute.
   */
  files: PublishedFile[];
}

type Access = { rootId: string; getNode: (sid: string) => unknown };

export class SitePublishExtension implements Extension {
  name = 'sitePublish';
  priority = 45;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: Record<string, unknown>) => Promise<boolean>,
      can: (payload?: Record<string, unknown>) => boolean
    ) =>
      /*
       * No cast: `registerCommand` is public on `Editor`. Every other extension in this package
       * casts here, and every one of them is a copy of a line that was true before the type was —
       * the ratchet in `editor-is-typed.test.ts` counts them, and a new file should not add one more.
       */
      editor.registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => await execute(payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      } as never);

    /**
     * Every page of the site, as complete documents.
     *
     * The payload carries a `write` the caller supplies, which is what keeps this out of the DOM: the
     * command decides *what a site is* and the caller decides what a file is. A call with no `write`
     * still succeeds and still renders — that is how a test asks "does this produce five pages"
     * without inventing a download.
     */
    register(
      'exportSite',
      async (payload) => {
        // The sitemap goes with the whole site and never with one page of it.
        const map = sitemapFor(editor);
        const robots = robotsFor(editor);
        const missing = this._notFound(editor);
        return this._hand(payload, exportSite(editor), [
          ...(map ? [{ file: 'sitemap.xml', text: map, type: 'application/xml' }] : []),
          /*
           * And what a crawler reads **before** anything else. A sitemap nothing points at is a file
           * found only by guessing its name.
           */
          ...(robots ? [{ file: 'robots.txt', text: robots, type: 'text/plain' }] : []),
          /**
           * And **the page a visitor gets when they type the address wrong**.
           *
           * Not a page in the document, and that is the decision: a 404 is not somewhere a reader
           * navigates to or links to, and putting one in the page list would put it in the navigation
           * of every site made with this. It is the site's own page, drawn from the page a reader
           * marked as it — see `notFoundFor`.
           */
          ...(missing ? [missing] : []),
          /*
           * And **the pictures**, each written once.
           *
           * Not inlined into the pages that draw them: a logo on five pages would be its bytes five
           * times, and a photograph in the middle of the HTML delays the first paint by exactly as
           * long as it takes to download — a browser cannot start drawing a page it has not finished
           * reading. `assetSrc` is what points the pages here.
           */
          ...this._assetFiles(editor)
        ]);
      },
      () => this._pages(editor).length > 0
    );

    /**
     * And **one** page, which is the gesture a reader makes far more often.
     *
     * Not the same command with an argument: a reader publishing the page they are looking at and a
     * reader publishing the site are doing different things with different consequences, and a
     * command that meant either depending on a field is a command a keyboard cannot bind to one of
     * them. The harness makes the same argument about inserts.
     */
    register(
      'exportPage',
      async (payload) => {
        const sid = this._pageAt(editor, payload?.pageId);
        if (!sid) return false;
        return this._hand(payload, [exportPage(editor, sid)]);
      },
      (payload) => !!this._pageAt(editor, payload?.pageId)
    );
  }

  onDestroy(): void {
    // Nothing held.
  }

  /**
   * Every file the document holds, as files to write.
   *
   * **Every** one, rather than only the ones this site's pages happen to draw. A picture a reader put
   * in the document and then took off a page is a picture they are about to use again, and a publish
   * that quietly dropped it would make the same document produce different folders on two days. What
   * *is* worth reporting is a file nothing draws — and that is a fault for the panel rather than a
   * decision for the exporter.
   */
  /**
   * **The page a visitor gets when they type the address wrong**, as `404.html`.
   *
   * Every static host serves that name for a request it cannot match — Netlify, Vercel, GitHub Pages,
   * S3, nginx with one line — which is why it is a *file* rather than a route this product invents.
   *
   * Drawn from a page a reader **marked** as it rather than from a page called `/404`: a page in the
   * page list is a page that appears in navigation and in the sitemap, and a 404 is neither. So the
   * page keeps its own address and gains a second one, and a site that has not marked any gets no
   * file — a host's own blank 404 is honest where a made-up one would be a page saying nothing.
   */
  private _notFound(editor: Editor): PublishedFile | undefined {
    const store = editor.dataStore as { getNode: (sid: string) => any } | undefined;
    if (!store) return undefined;

    const found = this._pages(editor).find(
      (one) => store.getNode(one.sid)?.attributes?.notFound === true
    );
    if (!found) return undefined;

    return { file: '404.html', type: 'text/html', text: exportPage(editor, found.sid).html };
  }

  private _assetFiles(editor: Editor): PublishedFile[] {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => unknown } }).dataStore;
    const rootId = editor.getRootId?.();
    if (!store || !rootId) return [];

    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    return assetsOf(doc as never).flatMap((one) => [
      { file: assetFileName(one), type: one.type, bytes: one.data },
      /*
       * And **every rendition**, each as its own file — which is what a `srcset` points at and what
       * lets a phone fetch 640 pixels of a picture taken at 4000.
       */
      ...one.sizes.map((size) => ({
        file: renditionFileName(one, size.width),
        type: one.type,
        bytes: size.data
      }))
    ]);
  }

  /** The pages this document has, or none when it is not a site. */
  private _pages(editor: Editor): { sid: string }[] {
    const store = editor.dataStore as { getNode: (sid: string) => unknown } | undefined;
    const rootId = editor.getRootId();
    if (!store || !rootId) return [];
    return pagesOf({ rootId, getNode: (sid: string) => store.getNode(sid) } as never as Access as never);
  }

  /**
   * The page a call is about: the one named, or the home page.
   *
   * A fallback here and deliberately **not** in `duplicatePage` or `removePage`: publishing the wrong
   * page costs a reader one file in their downloads folder, and deleting the wrong one costs them the
   * page. A default is only safe where being wrong is cheap.
   */
  private _pageAt(editor: Editor, given?: unknown): string | undefined {
    const pages = this._pages(editor);
    if (typeof given === 'string') return pages.find((one) => one.sid === given)?.sid;
    return pages[0]?.sid;
  }

  /**
   * Hand the result to the caller, and report whether there was one.
   *
   * `write` is optional on purpose — see the class header. A caller that only wants to know the
   * command works gets `true`; an app gets the pages.
   */
  private async _hand(
    payload: Record<string, unknown> | undefined,
    pages: ExportedPage[],
    files: Published['files'] = []
  ): Promise<boolean> {
    if (pages.length === 0) return false;
    const write = payload?.write;
    if (typeof write === 'function') await (write as (result: Published) => unknown)({ pages, files });
    return true;
  }
}

export function createPublishCommands(): Extension {
  return new SitePublishExtension();
}
