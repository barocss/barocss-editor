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
     * A column break: move what follows to the next column.
     *
     * A node rather than an attribute, because it sits *between* two blocks —
     * `pageBreakBefore` is a property of the block it precedes, and a column
     * break has no such block when it ends a section.
     */
    (editor as any).registerCommand({
      name: 'insertColumnBreak',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) =>
        await this._insertBreak(ed, 'columnBreak', payload?.selection ?? (ed as any).selection),
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        !!(payload?.selection ?? (ed as any).selection)
    });

    /**
     * Whether edits are recorded as revisions from now on.
     *
     * A document setting, not a view one: two people editing the same document
     * are not each deciding whether the other's edits are tracked.
     */
    (editor as any).registerCommand({
      name: 'toggleTrackChanges',
      execute: async (ed: Editor) => await this._toggleTracking(ed),
      canExecute: (ed: Editor) => !!this._settingsNode(ed)
    });

    (editor as any).registerCommand({
      name: 'isTrackingChanges',
      execute: (ed: Editor) => this._settingsNode(ed)?.attributes?.trackRevisions === true,
      canExecute: () => true
    });
  }

  /** The document's settings node, which is where a document-wide switch lives. */
  private _settingsNode(editor: Editor): any {
    const dataStore = (editor as any).dataStore;
    const root = dataStore?.getNode?.((editor as any).getRootId?.());
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

  private async _insertBreak(
    editor: Editor,
    stype: string,
    selection: ModelSelection | null | undefined
  ): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore || !selection) return false;

    // The break goes after the block the caret is in, which is the block the
    // reader is looking at when they ask for one.
    let current: any = dataStore.getNode(selection.startNodeId);
    let depth = 0;
    while (current && depth++ < 64) {
      if (current.stype && typeof current.text !== 'string' && current.stype !== 'inline-text') break;
      current = current.parentId ? dataStore.getNode(current.parentId) : null;
    }
    if (!current?.sid || !current.parentId) return false;

    const parent = dataStore.getNode(current.parentId);
    const position = (parent?.content ?? []).indexOf(current.sid);
    if (position < 0) return false;

    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: { parentId: current.parentId, child: { stype, attributes: {} }, position: position + 1 }
      }
    ] as never).commit();
    return result.success;
  }
}

export function createWordCommands(): WordExtension {
  return new WordExtension();
}
