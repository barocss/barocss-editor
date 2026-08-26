/**
 * The commands that are Word's own.
 *
 * Word already brought its own schema, renderers, resolvers, key map and
 * toolbar; what it had not brought was commands. Its key map bound
 * `Mod+Shift+Enter` and `Mod+Shift+e` to things nothing implemented, so those
 * shortcuts resolved and then quietly did nothing — the same shape of gap the
 * toolbar found in alignment.
 *
 * The line is what the concept belongs to rather than who happens to use it.
 * Bold, alignment and delete are edits any product makes, so they live in the
 * shared kit; a column break is meaningless without sections that have columns,
 * and tracked changes is a word processor's idea of review. Those belong here.
 */
import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';

export class WordExtension implements Extension {
  name = 'word';
  priority = 45;

  onCreate(editor: Editor): void {
    /**
     * Ctrl+Enter: a page break *at the caret*, with the caret on the new page.
     *
     * Word's own, replacing the shared kit's — the same relationship Word's list
     * and table commands have with theirs, and for the same kind of reason. The
     * kit's `insertPageBreak` puts the break after the whole block and leaves the
     * caret where it was, which is a reasonable operation for a product where a
     * break is a marker in the flow and wrong for one whose layout *is* pages.
     *
     * Measured before it was replaced: pressing Ctrl+Enter in the middle of a
     * paragraph left the paragraph whole, put the break after it, and left the
     * caret on the break node itself — off the paper, with nowhere for the next
     * keystroke to go. What a reader means is what Enter means plus a page:
     * split here, and carry on at the top of the next one.
     */
    editor.registerCommand({
      name: 'insertPageBreak',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection ?? (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const result = await transaction(
          ed,
          [{ type: 'insertPageBreakAtCaret', payload: { stype: 'pageBreak' } }] as never,
          { applySelectionToView: true } as never
        ).commit();
        return result.success;
      },
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection ?? (ed as any).selection;
        return !!selection && selection.type === 'range';
      }
    });

    /**
     * Ctrl+Shift+Enter: the same gesture, one column over.
     *
     * A break is a node rather than an attribute because it sits *between* two
     * blocks — `pageBreakBefore` is a property of the block it precedes, and a
     * column break has no such block when it ends a section.
     *
     * The same operation as the page break with a different node type, which is
     * why that operation takes one. Splitting at the caret is what "break here"
     * means whatever is being broken, and having the two commands disagree about
     * it would be the sort of difference a reader has to learn rather than guess.
     */
    editor.registerCommand({
      name: 'insertColumnBreak',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection ?? (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const result = await transaction(
          ed,
          [{ type: 'insertPageBreakAtCaret', payload: { stype: 'columnBreak' } }] as never,
          { applySelectionToView: true } as never
        ).commit();
        return result.success;
      },
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        !!(payload?.selection ?? (ed as any).selection)
    });

    /**
     * Whether edits are recorded as revisions from now on.
     *
     * A document setting, not a view one: two people editing the same document
     * are not each deciding whether the other's edits are tracked.
     */
    editor.registerCommand({
      name: 'toggleTrackChanges',
      execute: async (ed: Editor) => await this._toggleTracking(ed),
      canExecute: (ed: Editor) => !!this._settingsNode(ed)
    });

    editor.registerCommand({
      name: 'isTrackingChanges',
      execute: (ed: Editor) => this._settingsNode(ed)?.attributes?.trackRevisions === true,
      canExecute: () => true
    });
  }

  /** The document's settings node, which is where a document-wide switch lives. */
  private _settingsNode(editor: Editor): any {
    const dataStore = editor.dataStore;
    const root = dataStore?.getNode?.(editor?.getRootId() ?? '');
    if (!root) return null;

    for (const childId of root.content ?? []) {
      const child = typeof childId === 'string' ? dataStore.getNode(childId) : childId;
      if (child?.stype !== 'resources') continue;

      for (const resourceId of child.content ?? []) {
        const resource = typeof resourceId === 'string' ? dataStore.getNode(resourceId) : resourceId;
        if (resource?.stype === 'docSettings') return resource;
      }
    }
    return null;
  }

  private async _toggleTracking(editor: Editor): Promise<boolean> {
    const settings = this._settingsNode(editor);
    if (!settings?.sid) return false;

    const result = await transaction(editor, [
      {
        type: 'setAttrs',
        payload: {
          nodeId: settings.sid,
          attrs: { trackRevisions: settings.attributes?.trackRevisions !== true }
        }
      }
    ] as never).commit();
    return result.success;
  }

  /**
   * `_insertBreak` was here: it put a break node after the whole block the caret
   * was in. Both breaks split at the caret now — see the commands above — and a
   * private method nothing calls is a second answer to a question that has one.
   */
}

export function createWordCommands(): WordExtension {
  return new WordExtension();
}
