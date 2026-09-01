/**
 * Making a page, copying one, moving one, taking one away.
 *
 * ## What was missing, and how it was found
 *
 * Writing the test for `linkFaults` — the report that names links pointing at a page which is not
 * there. The fault could not be *made*: `removeBlocks` refuses a surface by name ("the page itself
 * is not a thing a reader can remove"), and there was nothing that made one either. The sample's
 * five pages exist because `sample-site.ts` wrote them in TypeScript.
 *
 * Which is the same finding the data commands produced, in the same shape and one layer up: the
 * *view* was finished — five pages drawn at three widths, a rail listing them, a panel that renames
 * one and changes its address — against a set of pages only a developer could change. A site builder
 * where a reader cannot add a page is not a site builder.
 *
 * ## The one thing these have to get right
 *
 * **A page's id is what a link names it by**, so two pages with one id is a link that goes to
 * whichever comes first, and a copy that keeps the original's id is exactly that. So a new page and
 * a copied page mint an id and an address that nothing else has — the only place in this product
 * that generates an identity, and the reason it is generated rather than asked for is that a reader
 * naming their own would have to know what is taken.
 *
 * ## What a new page starts as
 *
 * The header and footer of the page it follows, and a heading to type into.
 *
 * `insertSlide` settled the same question for a deck — "the layout the preceding slide follows,
 * because a deck is mostly runs of slides that look alike" — and a site is more so: every page of
 * one carries the same navigation, and a new page that arrives without it is a page a reader has to
 * repair before it looks like it belongs. What is copied is a **placement**, so the new page follows
 * the same definition rather than a copy of it: editing the header still changes every page.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { addChild, moveNode, node, removeChild, textNode, transaction } from '@barocss/model';
import { copyOf } from '@barocss/office-canvas';
import { pagesOf } from './selection';
import { pathFor } from './slug';

type Node = Record<string, any>;

/** The kind of surface a page is — the one the site's schema and `pagesOf` agree on. */
const PAGE_KIND = 'flow';

export class SitePageExtension implements Extension {
  name = 'sitePages';
  priority = 46;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: Record<string, unknown>) => Promise<boolean>,
      can: (payload?: Record<string, unknown>) => boolean
    ) =>
      editor.registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => await execute(payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      });

    /** A page, after the one given — or after the last one, which is where a reader is looking. */
    register(
      'insertPage',
      async (payload) => await this._insert(editor, payload),
      () => !!this._doc(editor)
    );

    register(
      'duplicatePage',
      async (payload) => await this._duplicate(editor, payload),
      (payload) => !!this._pageAt(editor, payload?.nodeId)
    );

    /**
     * And taking one away — **never the last one**.
     *
     * A site with no pages is not an empty site; it is a document this product cannot draw, with no
     * gesture anywhere in it to make the first page back. The deck refuses the last slide for the
     * same reason.
     *
     * It does *not* refuse a page that links point at. Removing a page breaks them either way, and a
     * command that refused would leave a reader hunting for links to delete before they could delete
     * a page — so the answer is to **say** what breaks, which is `linkFaults`, and let them decide.
     */
    register(
      'removePage',
      async (payload) => await this._remove(editor, payload),
      (payload) => this._canRemove(editor, payload?.nodeId)
    );

    /** Reorder, by where the page should end up — 0 is first, like a slide. */
    register(
      'movePage',
      async (payload) => await this._move(editor, payload),
      (payload) => this._canMove(editor, payload?.nodeId, payload?.to)
    );
  }

  onDestroy(_editor: Editor): void {}

  private _doc(editor: Editor): { rootId: string; getNode: (sid: string) => Node | undefined } | undefined {
    const store = editor.dataStore;
    const rootId = editor.getRootId();
    if (!store || !rootId) return undefined;
    return { rootId, getNode: (sid: string) => store.getNode(sid) as Node | undefined };
  }

  /** The page a payload names, or the one a reader is on — a sid only when it really is a page. */
  private _pageAt(editor: Editor, nodeId?: unknown): string | undefined {
    const doc = this._doc(editor);
    if (!doc) return undefined;
    const pages = pagesOf(doc as never);
    if (typeof nodeId !== 'string') return undefined;
    return pages.find((page) => page.sid === nodeId)?.sid;
  }

  /**
   * A name, an id and an address nothing else is using.
   *
   * The id is what a link stores, so it has to be stable and unique; the address is what a visitor
   * types, so it has to be unique too and *should* be readable. Both are numbered from the same
   * count, which keeps them recognisably one page — `page-3` at `/page-3` — rather than two
   * unrelated strings a reader has to learn to associate.
   */
  private _fresh(taken: { id: string; path: string }[]): { id: string; name: string; path: string } {
    const ids = new Set(taken.map((one) => one.id));
    const paths = new Set(taken.map((one) => one.path));
    for (let n = taken.length + 1; ; n += 1) {
      const id = `page-${n}`;
      const path = `/${id}`;
      if (!ids.has(id) && !paths.has(path)) return { id, name: `페이지 ${n}`, path };
    }
  }

  /**
   * The same, for a copy — which keeps the original's *words* and cannot keep its identity.
   *
   * `제품` becomes `제품 사본`, `/제품` becomes `/제품-2`, and the id — the thing links resolve
   * through — is minted rather than derived, because an id is not a reader's word for anything and
   * a derived one is a guess at what is free.
   */
  private _copyOfName(
    original: { id: string; name: string; path: string },
    taken: { id: string; path: string }[]
  ): { id: string; name: string; path: string } {
    const fresh = this._fresh(taken);
    const paths = new Set(taken.map((one) => one.path));

    /*
     * Through `pathFor`, because the original's own address may not be one: a document written before
     * addresses were repaired, or one pasted from somewhere else, and a copy of a broken address is
     * two broken addresses.
     */
    const from = pathFor(original.path);
    let path = `${from}-2`;
    for (let n = 2; paths.has(path); n += 1) path = `${from}-${n}`;

    return { id: fresh.id, name: `${original.name} 사본`, path };
  }

  private async _insert(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const doc = this._doc(editor);
    if (!doc) return false;

    const pages = pagesOf(doc as never);
    const after = this._pageAt(editor, payload?.nodeId) ?? pages[pages.length - 1]?.sid;
    const named = this._fresh(pages);

    const previous = after ? doc.getNode(after) : undefined;
    const children = ((previous?.content ?? []) as unknown[]).filter(
      (sid): sid is string => typeof sid === 'string'
    );

    /** A placement at one end of the page it follows — the navigation, or the footer. */
    const chrome = (sid: string | undefined): Node | undefined => {
      const found = sid ? doc.getNode(sid) : undefined;
      return found?.stype === 'instance' ? (copyOf(doc as never, sid!) as Node | undefined) : undefined;
    };

    const head = chrome(children[0]);
    const foot = children.length > 1 ? chrome(children[children.length - 1]) : undefined;

    const content = [
      ...(head ? [head] : []),
      /*
       * A page with nothing in it is legal and useless — the same argument `insertSlide` makes about
       * an empty slide. One level-1 heading, because that is a page's own title and the one block
       * every page of the sample starts with.
       */
      node('heading', { level: 1 }, [textNode('inline-text', named.name) as never]),
      ...(foot ? [foot] : [])
    ];

    const at = after ? this._indexOf(doc, after) : -1;

    const result = await transaction(editor, [
      addChild(
        doc.rootId,
        node('surface', { kind: PAGE_KIND, ...named }, content as never) as never,
        at >= 0 ? at + 1 : undefined
      )
    ] as never).commit();

    return result.success;
  }

  private async _duplicate(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const doc = this._doc(editor);
    const sid = this._pageAt(editor, payload?.nodeId);
    if (!doc || !sid) return false;

    const pages = pagesOf(doc as never);
    const original = pages.find((page) => page.sid === sid)!;

    // A tree with no sids in it: a copy is a different node all the way down rather than a second
    // thing claiming the original's identity.
    const copy = copyOf(doc as never, sid) as Node | undefined;
    if (!copy) return false;

    copy.attributes = { ...(copy.attributes ?? {}), ...this._copyOfName(original, pages) };

    const result = await transaction(editor, [
      addChild(doc.rootId, copy as never, this._indexOf(doc, sid) + 1)
    ] as never).commit();

    return result.success;
  }

  private _canRemove(editor: Editor, nodeId?: unknown): boolean {
    const doc = this._doc(editor);
    if (!doc) return false;
    return pagesOf(doc as never).length > 1 && !!this._pageAt(editor, nodeId);
  }

  private async _remove(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canRemove(editor, payload?.nodeId)) return false;
    const doc = this._doc(editor)!;

    const result = await transaction(editor, [
      removeChild(doc.rootId, String(payload!.nodeId))
    ] as never).commit();

    return result.success;
  }

  private _canMove(editor: Editor, nodeId?: unknown, to?: unknown): boolean {
    const doc = this._doc(editor);
    const sid = this._pageAt(editor, nodeId);
    if (!doc || !sid || typeof to !== 'number' || !Number.isInteger(to)) return false;

    const pages = pagesOf(doc as never);
    if (to < 0 || to >= pages.length) return false;
    // Moving a page to where it already is is not an edit, and committing one would put an entry in
    // the history that undoes to the same document.
    return pages.findIndex((page) => page.sid === sid) !== to;
  }

  private async _move(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canMove(editor, payload?.nodeId, payload?.to)) return false;
    const doc = this._doc(editor)!;
    const sid = String(payload!.nodeId);

    /*
     * Where that page sits among the root's **own** children, which is not the same number: the
     * root holds the definitions and the resources too, and a reader counting pages has never seen
     * them.
     */
    const pages = pagesOf(doc as never);
    const target = pages[Number(payload!.to)];

    const result = await transaction(editor, [
      moveNode(sid, doc.rootId, this._indexOf(doc, target.sid))
    ] as never).commit();

    return result.success;
  }

  /** Where a child sits in the root's content, which is what a position means to `addChild`. */
  private _indexOf(
    doc: { rootId: string; getNode: (sid: string) => Node | undefined },
    sid: string
  ): number {
    const content = (doc.getNode(doc.rootId)?.content ?? []) as unknown[];
    return content.indexOf(sid);
  }
}

export function createPageCommands(): SitePageExtension {
  return new SitePageExtension();
}
