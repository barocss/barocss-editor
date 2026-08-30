import { hasRange } from './guards';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, wrapInList as wrapInListOp, splitListItem as splitListItemOp } from '@barocss/model';
import { liftOutOf, wrapperAround } from './lift';
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
        return await this._toggleList(ed, 'bullet', payload?.selection);
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
        return await this._toggleList(ed, 'ordered', payload?.selection);
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

  /**
   * **Toggle**, which is what these two are called and was half of what they did.
   *
   * ## What they were
   *
   * `wrapInList`, and nothing else. A paragraph became a bullet the first time and stayed one for
   * ever: pressing 글머리 목록 again ran the command, wrapped nothing, reported success and changed
   * nothing. So **there was no way to turn a list back into paragraphs** in any of the three
   * products — the only route out was undo, and only if it was the last thing you did.
   *
   * Found by asking whether a toggle is its own inverse. Every mark toggle here is; the three block
   * ones — this pair and `toggleBlockquote` — were not, and they are the three that change the shape
   * of the document rather than the look of a run.
   *
   * ## Why the way out is composed rather than a new operation
   *
   * There is no `unwrapFromList`, and `unwrap` is about the characters at the ends of a range. What
   * getting out of a list *is* — move each item's blocks up to where the list sits, then take the
   * empty list away — is two operations this package already has, and composing them means the
   * inverse comes for nothing: `moveNode` and `removeChild` each know how to undo themselves, and a
   * transaction of the two undoes as one gesture.
   *
   * The blocks are moved **from the last backwards**, at one index, so they arrive in the order they
   * were in. Inserting forwards at a fixed place reverses them — the same arithmetic a paste does,
   * and the same reason.
   */
  private async _toggleList(
    editor: Editor,
    listType: 'bullet' | 'ordered',
    selection?: ModelSelection
  ): Promise<boolean> {
    const inside = listAround(editor, selection);

    // Not in a list at all: wrapping is what the reader means.
    if (!inside) return await this._executeWrapInList(editor, listType, selection);

    /**
     * In a list of the **other** kind: change what it is, rather than wrap it again.
     *
     * The comment on `listAround` said this was the case it existed for — *"a caret in a numbered
     * list, given 글머리 목록, means make this a bullet list"* — and the code then called
     * `wrapInList`, which reads the selection and wraps the **block** it is in. There was already a
     * list around it, so there was nothing to wrap: the operation found no work, the transaction
     * committed nothing, and 글머리 목록 on a numbered list did nothing at all.
     *
     * Invisible to the probe, which asks whether a command moves the document and gets *yes* from
     * the first state it can run in — a caret in an ordinary paragraph, where wrapping is right.
     * Found writing this package's first test for the three block toggles by hand.
     */
    if (inside.type !== listType) {
      const changed = await transaction(
        editor,
        [{ type: 'setAttrs', payload: { nodeId: inside.list, attrs: { type: listType } } }] as never,
        { applySelectionToView: true }
      ).commit();
      return changed.success;
    }

    // A list holds `listItem`s which hold the blocks, so the lift goes through them — see `lift.ts`.
    const ops = liftOutOf(editor, inside.list, 'listItem');
    if (!ops) return false;

    const result = await transaction(editor, ops as never, { applySelectionToView: true }).commit();
    return result.success;
  }

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

/**
 * The list the caret is in, and what kind it is — or nothing.
 *
 * Named by the kind rather than by "is it in a list", because that is the question a toggle asks: a
 * caret in a numbered list, given 글머리 목록, means *make this a bullet list* and not *take it out
 * of the list it is in*. Which is what every editor of this kind does, and the one case a plain
 * boolean would get wrong.
 */
function listAround(
  editor: Editor,
  selection?: ModelSelection
): { list: string; type: string } | undefined {
  const at = selection ?? (editor as { selection?: ModelSelection }).selection;
  if (!at || at.type !== 'range') return undefined;

  const found = wrapperAround(editor, at.startNodeId, 'list');
  return found ? { list: found.sid, type: String(found.attributes?.type ?? 'bullet') } : undefined;
}
