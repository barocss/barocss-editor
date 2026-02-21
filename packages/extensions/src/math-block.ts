import { Editor, Extension } from '@barocss/editor-core';
import { transaction, insertMathBlock as insertMathBlockOp } from '@barocss/model';

export interface MathBlockExtensionOptions {
  enabled?: boolean;
  defaultEngine?: 'katex' | 'mathjax';
}

export class MathBlockExtension implements Extension {
  name = 'mathBlock';
  priority = 100;
  private _options: MathBlockExtensionOptions;

  constructor(options: MathBlockExtensionOptions = {}) {
    this._options = {
      enabled: true,
      defaultEngine: 'katex',
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'insertMathBlock',
      execute: async (ed: Editor, payload?: { tex?: string; engine?: string }) => {
        const tex = payload?.tex ?? '';
        const engine = payload?.engine ?? this._options.defaultEngine ?? 'katex';
        const ops = [insertMathBlockOp(tex, engine)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createMathBlockExtension(options?: MathBlockExtensionOptions): MathBlockExtension {
  return new MathBlockExtension(options);
}
