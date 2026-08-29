import { hasRange } from './guards';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, wrapInList as wrapInListOp, splitListItem as splitListItemOp } from '@barocss/model';
import { findAncestorNode } from '@barocss/datastore';

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
      /*
       * A caret is enough — a list toggle acts on the **block** the caret is in, and demanding a
       * selection would make a reader select a paragraph to make it a bullet. What it is not
       * enough for is a *node* selection, which is what this said yes to: measured on a deck with
       * a box held, both toggles lit up and did nothing.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
    });

    (editor as any).registerCommand({
      name: 'toggleOrderedList',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeWrapInList(ed, 'ordered', payload?.selection);
      },
      /*
       * A caret is enough — a list toggle acts on the **block** the caret is in, and demanding a
       * selection would make a reader select a paragraph to make it a bullet. What it is not
       * enough for is a *node* selection, which is what this said yes to: measured on a deck with
       * a box held, both toggles lit up and did nothing.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
    });

    (editor as any).registerCommand({
      name: 'splitListItem',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeSplitListItem(ed, payload?.selection);
      },
      /**
       * A caret is enough — **and it has to be in a list item.**
       *
       * `hasRange` alone is the guard the two toggles above want: a toggle acts on the block the
       * caret is in, and any block can become one. Splitting is the opposite question. There is
       * nothing to split unless the caret is already inside a `listItem`, and `splitListItemOp`
       * knows that and quietly produces nothing — so with the caret in an ordinary paragraph the
       * command said yes, ran, committed and changed not one thing.
       *
       * Found by this package's own conformance run, which is the class `guards.ts` names. Its
       * neighbours' comment above is the record of the *previous* time this file got the same
       * question wrong in the other direction.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload) && inListItem(ed, payload?.selection)
    });
  }

  onDestroy(_editor: Editor): void {}

  private async _executeWrapInList(
    editor: Editor,
    listType: 'bullet' | 'ordered',
    _selection?: ModelSelection
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

/**
 * Whether the caret is inside a list item.
 *
 * The walk rather than a look at the start node: a caret lives in a run of text inside a paragraph
 * inside the item, so asking the node the selection names answers `inline-text` every time.
 */
function inListItem(editor: Editor, selection?: ModelSelection): boolean {
  const at = selection ?? (editor as { selection?: ModelSelection }).selection;
  if (!at || at.type !== 'range' || !at.startNodeId) return false;

  const store = editor.dataStore;
  if (!store) return false;
  const start = store.getNode(at.startNodeId);
  if (!start) return false;

  if (start.stype === 'listItem') return true;
  return !!findAncestorNode(
    (id: string) => store.getNode(id),
    at.startNodeId,
    (node: { stype?: string }) => node.stype === 'listItem'
  );
}
