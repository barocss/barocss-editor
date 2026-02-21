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
