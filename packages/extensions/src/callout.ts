import { define, element, getGlobalRegistry, slot } from '@barocss/dsl';
import { Editor, Extension } from '@barocss/editor-core';
import { transaction, insertCallout as insertCalloutOp } from '@barocss/model';

export type CalloutType = 'info' | 'warning' | 'error' | 'success' | 'note' | 'tip';

export interface CalloutExtensionOptions {
  enabled?: boolean;
  defaultType?: CalloutType;
}

export class CalloutExtension implements Extension {
  name = 'callout';
  priority = 100;
  private _options: CalloutExtensionOptions;

  constructor(options: CalloutExtensionOptions = {}) {
    this._options = {
      enabled: true,
      defaultType: 'info',
      ...options
    };
  }

  /**
   * What a callout looks like when the product has not said.
   *
   * A floor, not a policy: registered only if nothing has claimed the type, so
   * a product with its own callout keeps it. The reason it exists at all is
   * that this extension offers `insertCallout`, and an offer to make a node
   * that nothing can draw puts the reader's text in the model and nowhere on
   * the page.
   */
  defaultRenderers(): void {
    const registry = getGlobalRegistry();
    if (registry.has('callout')) return;
    define(
      'callout',
      element(
        'div',
        {
          className: (d: Record<string, any>) =>
            `bc-callout bc-callout-${String(d.attributes?.type ?? 'info')}`
        },
        [slot('content')]
      )
    );
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'insertCallout',
      execute: async (ed: Editor, payload?: { type?: CalloutType; title?: string }) => {
        const calloutType = payload?.type ?? this._options.defaultType ?? 'info';
        const ops = [insertCalloutOp(calloutType, payload?.title)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createCalloutExtension(options?: CalloutExtensionOptions): CalloutExtension {
  return new CalloutExtension(options);
}
