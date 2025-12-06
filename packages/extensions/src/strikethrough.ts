import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, toggleMark } from '@barocss/model';

export interface StrikeThroughExtensionOptions {
  enabled?: boolean;
}

/**
 * StrikeThroughExtension
 *
 * - Provides `toggleStrikeThrough` command.
 * - Current implementation scope:
 *   - Only generates strikethrough mark toggle operation for range selection within the same text node.
 *   - Does not yet handle selection spanning multiple nodes.
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

    // Register strikeThrough toggle command
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

  onDestroy(_editor: Editor): void {
    // Add cleanup work here if needed
  }

  private async _executeToggleStrikeThrough(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[StrikeThroughExtension] dataStore not found');
      return false;
    }

    // Does not yet handle RangeSelection spanning multiple nodes
    if (selection.startNodeId !== selection.endNodeId) {
      return false;
    }

    const node = dataStore.getNode(selection.startNodeId);
    if (!node || typeof node.text !== 'string') {
      return false;
    }

    const text = node.text as string;
    const { startOffset, endOffset } = selection;

    if (
      typeof startOffset !== 'number' ||
      typeof endOffset !== 'number' ||
      startOffset < 0 ||
      endOffset > text.length ||
      startOffset >= endOffset
    ) {
      return false;
    }

    const ops = [
      ...control(selection.startNodeId, [
        toggleMark('strikethrough', [startOffset, endOffset])
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }
}

// Convenience function
export function createStrikeThroughExtension(options?: StrikeThroughExtensionOptions): StrikeThroughExtension {
  return new StrikeThroughExtension(options);
}

