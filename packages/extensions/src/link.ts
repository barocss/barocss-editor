import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
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
      canExecute: (_ed: Editor, payload?: { href?: string }) => !!payload?.href
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
