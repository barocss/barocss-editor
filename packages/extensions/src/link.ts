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
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createLinkExtension(options?: LinkExtensionOptions): LinkExtension {
  return new LinkExtension(options);
}
