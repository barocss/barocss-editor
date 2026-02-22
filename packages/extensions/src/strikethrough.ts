import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, toggleMark } from '@barocss/model';

export interface StrikeThroughExtensionOptions {
  enabled?: boolean;
}

/**
 * StrikeThroughExtension
 *
 * - Provides `toggleStrikeThrough` command.
 * - Uses model toggleMark with full range (single- and cross-node).
 */
export class StrikeThroughExtension implements Extension {
  name = 'strikethrough';
  priority = 100;

  private _options: StrikeThroughExtensionOptions;

  constructor(options: StrikeThroughExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'toggleStrikeThrough',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeToggleStrikeThrough(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection && payload.selection.type === 'range';
      }
    });
  }

  onDestroy(_editor: Editor): void {}

  private async _executeToggleStrikeThrough(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const op = toggleMark(
      selection.startNodeId,
      selection.startOffset,
      selection.endNodeId,
      selection.endOffset,
      'strikethrough'
    );
    const result = await transaction(editor, [op]).commit();
    return result.success;
  }
}

// Convenience function
export function createStrikeThroughExtension(options?: StrikeThroughExtensionOptions): StrikeThroughExtension {
  return new StrikeThroughExtension(options);
}

