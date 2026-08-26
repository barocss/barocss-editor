/**
 * Linking words to a page of this site.
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
import { pageRef, pagesIn } from './page-link';

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
       * `linkFaults` reports; the first is a bug this refuses to write.
       */
      canExecute: (_ed: Editor, payload?: { id?: string }) => {
        if (!linkable()) return false;
        const there = pages();
        return payload?.id === undefined ? there.length > 0 : there.includes(payload.id);
      }
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createLinkCommands(): SiteLinkExtension {
  return new SiteLinkExtension();
}
