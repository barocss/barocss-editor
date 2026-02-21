import { Editor, Extension } from '@barocss/editor-core';
import { transaction, insertCodeBlock as insertCodeBlockOp } from '@barocss/model';

export interface CodeBlockExtensionOptions {
  enabled?: boolean;
  defaultLanguage?: string;
}

export class CodeBlockExtension implements Extension {
  name = 'codeBlock';
  priority = 100;
  private _options: CodeBlockExtensionOptions;

  constructor(options: CodeBlockExtensionOptions = {}) {
    this._options = {
      enabled: true,
      defaultLanguage: '',
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'insertCodeBlock',
      execute: async (ed: Editor, payload?: { language?: string }) => {
        const lang = payload?.language ?? this._options.defaultLanguage ?? '';
        const ops = [insertCodeBlockOp(lang)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createCodeBlockExtension(options?: CodeBlockExtensionOptions): CodeBlockExtension {
  return new CodeBlockExtension(options);
}
