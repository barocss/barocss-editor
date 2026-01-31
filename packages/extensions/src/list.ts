import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, wrapInList as wrapInListOp, splitListItem as splitListItemOp } from '@barocss/model';

export interface ListExtensionOptions {
  enabled?: boolean;
}

/**
 * ListExtension
 *
 * - toggleBulletList / toggleOrderedList: wrap current block(s) in list or unwrap (wrapInList).
 * - splitListItem: when inside a list item, create new list item and move caret there (used on Enter).
 */
export class ListExtension implements Extension {
  name = 'list';
  priority = 100;

  private _options: ListExtensionOptions;

  constructor(options: ListExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'toggleBulletList',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeWrapInList(ed, 'bullet', payload?.selection);
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'toggleOrderedList',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeWrapInList(ed, 'ordered', payload?.selection);
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'splitListItem',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeSplitListItem(ed, payload?.selection);
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}

  private async _executeWrapInList(
    editor: Editor,
    listType: 'bullet' | 'ordered',
    selection?: ModelSelection
  ): Promise<boolean> {
    const ops = [wrapInListOp(listType)];
    const result = await transaction(editor, ops, { applySelectionToView: true }).commit();
    return result.success;
  }

  private async _executeSplitListItem(editor: Editor, _selection?: ModelSelection): Promise<boolean> {
    const ops = [splitListItemOp()];
    const result = await transaction(editor, ops, { applySelectionToView: true }).commit();
    return result.success;
  }
}

export function createListExtension(options?: ListExtensionOptions): ListExtension {
  return new ListExtension(options);
}
