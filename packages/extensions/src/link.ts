import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
import { transaction, toggleLink as toggleLinkOp } from '@barocss/model';

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
        const ops = [toggleLinkOp('')];
        const result = await transaction(ed, ops).commit();
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
       * Not *"and there is a link here"*, which would be the tighter answer and needs the marks under
       * the selection rather than the selection: worth having the day a reader complains that it is
       * offered on unlinked words, and a great deal better than always.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection ?? (ed as { selection?: ModelSelection }).selection;
        return !!selection && selection.type === 'range' && !selection.collapsed;
      }
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createLinkExtension(options?: LinkExtensionOptions): LinkExtension {
  return new LinkExtension(options);
}
