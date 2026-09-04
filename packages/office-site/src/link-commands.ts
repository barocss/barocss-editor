/**
 * Linking words to a page of this site, and to anywhere else.
 *
 * ## What was missing
 *
 * `toggleLink` has been registered in every product's kit since the day the standard schema declared
 * the mark, and it takes an **address**. That is the whole vocabulary a word processor needs: a
 * document links out, to somewhere it does not own.
 *
 * A site builder links *in*, and the address is the one thing it must not store — a page's `path` is
 * a value a reader edits in the panel, and a link that spelled it goes silently to nowhere the first
 * time they do. So this is one command rather than a preset of the shared one: it writes the page's
 * durable **id**, and the address is worked out where the link is drawn (`page-link.ts`).
 *
 * ## Why it refuses a collapsed selection
 *
 * A mark covers a range and a caret is not one. `toggleLink` on a caret writes a zero-length link:
 * nothing to read, nothing to click, and nothing on screen to say it went wrong — the exact shape of
 * failure this repository keeps finding, where the check and the drawing both look fine. The
 * toolbar's control is grey until there are words to link, because the command says so and the key
 * and the button both ask it.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { transaction, toggleLink } from '@barocss/model';
import { addressFor, pageRef, pagesIn } from './page-link';

type Range = { type?: string; startNodeId?: string; startOffset?: number; endNodeId?: string; endOffset?: number };

export class SiteLinkExtension implements Extension {
  name = 'siteLink';
  priority = 47;

  onCreate(editor: Editor): void {
    /** Words are selected, and there are some — the two things a mark needs. */
    const linkable = (): boolean => {
      const selection = editor.selection as Range | undefined;
      if (!selection || selection.type !== 'range' || !selection.startNodeId || !selection.endNodeId) return false;
      if (selection.startNodeId !== selection.endNodeId) return true;
      return (selection.endOffset ?? 0) > (selection.startOffset ?? 0);
    };

    /** The page ids this document actually has, so a command cannot write a reference to nothing. */
    const pages = (): string[] => {
      const store = editor.dataStore;
      const rootId = editor.getRootId();
      if (!store || !rootId) return [];
      return pagesIn({ rootId, getNode: (sid: string) => store.getNode(sid) as never }).map((page) => page.id);
    };

    editor.registerCommand({
      name: 'linkToPage',
      execute: async (ed: Editor, payload?: { id?: string }) => {
        const id = payload?.id;
        if (!id || !linkable() || !pages().includes(id)) return false;
        const result = await transaction(ed, [toggleLink(pageRef(id))]).commit();
        return result.success;
      },
      /**
       * Two questions, because a toolbar asks the first and a picker answers the second.
       *
       * **Without an id** — *can a reader link at all right now?* Which is what a control asks on
       * every render, before it knows where the link would go, and the honest answer is: there are
       * words selected and there is somewhere to send them. The first version answered `false` to
       * this, on the reasoning that a command with no id cannot run — true, and it would have left
       * the picker permanently grey while every check stayed green.
       *
       * **With one** — that too, and the page has to *be there*. A reader cannot type this one, but
       * a keybinding, a macro or a test can, and a reference to a page that never existed is
       * indistinguishable in the document from one whose page was deleted. The second is a fault
       * the fault list reports; the first is a bug this refuses to write.
       */
      canExecute: (_ed: Editor, payload?: { id?: string }) => {
        if (!linkable()) return false;
        const there = pages();
        return payload?.id === undefined ? there.length > 0 : there.includes(payload.id);
      }
    });

    /**
     * And a link **out** of the site, which is the half that had no way in.
     *
     * ## What was measured
     *
     * `toggleLink` takes an address and every product's kit has registered it for months. The site's
     * toolbar offers a page picker and 링크 없음, and **nothing at all** that types an address — so a
     * landing page built with this product could not carry a link to a shop, a repository, a mail
     * address or anything else off the site. `hrefFor` has always passed a non-`page:` href straight
     * through and the export has always drawn it; the drawing end was finished and the writing end
     * did not exist.
     *
     * ## Why it is a second command rather than an argument to the first
     *
     * The same reason `removeLink` is not a row in the picker, which this file's neighbour already
     * argues: folding two gestures into one control needs a sentinel that is not a page id, and a
     * sentinel is a value that collides the day somebody names a page it. It is also two different
     * *questions* — which page, and which address — and a command that took either would have to
     * guess which one an ambiguous payload meant.
     *
     * ## What it refuses
     *
     * A caret, like its neighbour and for its reason: a mark covers a range, and a zero-length link
     * is nothing to read, nothing to click, and nothing on screen that says it went wrong.
     *
     * And a `page:` reference, which `addressFor` returns nothing for. A reader cannot type one
     * usefully — the ids are internal — and accepting it would make this a second, unchecked way to
     * write an internal link, one that does not verify the page exists.
     */
    editor.registerCommand({
      name: 'linkToAddress',
      execute: async (ed: Editor, payload?: { href?: string }) => {
        const href = addressFor(payload?.href);
        if (!href || !linkable()) return false;
        const result = await transaction(ed, [toggleLink(href)]).commit();
        return result.success;
      },
      /**
       * Two questions again, and the same split.
       *
       * **Without an address** — *can a reader link at all right now?* A control asks this on every
       * render before anything is typed, and answering `false` would leave the field permanently
       * disabled with every check still green. That is the exact mistake `linkToPage` records above,
       * and it is repeated here rather than shared because the two commands answer it about
       * different things: a picker needs somewhere to send words *to*, and a field needs only words.
       *
       * **With one** — it also has to be an address this can write, which is `addressFor`'s answer
       * and not a second opinion about what an address is.
       */
      canExecute: (_ed: Editor, payload?: { href?: string }) =>
        linkable() && (payload?.href === undefined || !!addressFor(payload.href))
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createLinkCommands(): SiteLinkExtension {
  return new SiteLinkExtension();
}
