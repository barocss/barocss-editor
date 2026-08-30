import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange, wears } from './guards';
import { transaction, removeMark, toggleLink as toggleLinkOp } from '@barocss/model';

export interface LinkExtensionOptions {
  enabled?: boolean;
}

export class LinkExtension implements Extension {
  name = 'link';
  priority = 100;
  private _options: LinkExtensionOptions;

  constructor(options: LinkExtensionOptions = {}) {
    this._options = { enabled: true, ...options };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'toggleLink',
      execute: async (ed: Editor, payload?: { href?: string; title?: string; selection?: ModelSelection }) => {
        if (!payload?.href) return false;
        const ops = [toggleLinkOp(payload.href, payload.title)];
        const result = await transaction(ed, ops).commit();
        return result.success;
      },
      /**
       * An address — **and words to put it on.**
       *
       * A link is a mark and a mark covers the text between two points; `toggleLink` over a caret
       * writes a zero-length link, which is nothing to read, nothing to click, and nothing on screen
       * to say it went wrong. The guard asked only about the address, so with a box held or nothing
       * selected the control lit up and the run declined.
       *
       * `removeLink` beside it has asked the fuller question since the day it was written — the two
       * halves of one gesture, and only one of them was checked.
       */
      canExecute: (ed: Editor, payload?: { href?: string; selection?: ModelSelection }) =>
        !!payload?.href && hasRange(ed, payload, 'something')
    });

    (editor as any).registerCommand({
      name: 'removeLink',
      execute: async (ed: Editor) => {
        /**
         * `removeMark`, not `toggleLink('')`.
         *
         * Taking a link off by toggling an **empty address** worked only while `toggleLink` read
         * *"do these words carry a link at all"* — and that reading was the fault beside it: pressing
         * 링크 with a new address took the link off instead of changing it. Once it asks about *this*
         * address, an empty one is a new link to nowhere, and 링크 제거 laid `href: ''` over the
         * words.
         *
         * Which is the honest shape anyway: this command's name says what it does, and saying it
         * through a toggle was borrowing a gesture to do the opposite of what the gesture means.
         */
        const at = (ed as { selection?: ModelSelection }).selection;
        if (!at || at.type !== 'range') return false;

        const ops = [
          removeMark(at.startNodeId, 'link', [at.startOffset, at.endOffset] as [number, number])
        ];
        const result = await transaction(ed, ops as never).commit();
        return result.success;
      },
      /**
       * **Words, to take a link off.** `() => true` was the answer, in every state.
       *
       * A link is a mark and a mark covers a range, so taking one off a caret is a transaction that
       * commits and changes nothing — and a control that is offered in every state is a control that
       * says nothing about the document. Measured in the site builder, where the link group would not
       * go away with nothing selected: `linkToPage` refused correctly and this one held the group open
       * on its own.
       *
       * **And there is a link there**, which this said was the tighter answer and left for *"the day
       * a reader complains that it is offered on unlinked words"*. The day arrived as a measurement
       * rather than a complaint: over unlinked words the command committed and changed nothing, which
       * is the class this package's conformance run is named after.
       *
       * The `!selection.collapsed` this used to read is gone with it. **Nothing sets that field** —
       * `SelectionManager` stores what it is handed — so it was `undefined` and the test was always
       * true; `hasRange` computes it from the offsets now. See `guards.ts`.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload, 'something') && wears(ed, payload?.selection, 'link')
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createLinkExtension(options?: LinkExtensionOptions): LinkExtension {
  return new LinkExtension(options);
}
