import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
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
      /**
       * A **range**, which the run has always required and this did not say.
       *
       * `canExecute: () => true` over an insert that needs somewhere to go: with a node held or
       * nothing selected the control lights up, the reader presses it, and the refusal goes to a
       * console nobody is watching — the class `guards.ts` names, and the one a **builder** meets
       * most, because a deck and a page builder spend their time with a box selected rather than a
       * caret.
       *
       * Invisible until the probe was given the two states a builder has: it had only ever put a
       * caret in a run, where every one of these works.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createCodeBlockExtension(options?: CodeBlockExtensionOptions): CodeBlockExtension {
  return new CodeBlockExtension(options);
}
