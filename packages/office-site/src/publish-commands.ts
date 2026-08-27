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
import { exportPage, exportSite, type ExportedPage } from './export-html';
import { pagesOf } from './selection';

/** What a publish produced, handed to whoever asked to run it. */
export interface Published {
  pages: ExportedPage[];
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
      async (payload) => this._hand(payload, exportSite(editor)),
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
  private async _hand(payload: Record<string, unknown> | undefined, pages: ExportedPage[]): Promise<boolean> {
    if (pages.length === 0) return false;
    const write = payload?.write;
    if (typeof write === 'function') await (write as (result: Published) => unknown)({ pages });
    return true;
  }
}

export function createPublishCommands(): Extension {
  return new SitePublishExtension();
}
