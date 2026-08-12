/**
 * Word's table commands.
 *
 * The operations were already here and already knew this schema — a header
 * group is one row and a new row belongs to the body, and tableStructure says
 * so. What was missing was anything to call them: no command was registered for
 * any of the six, so a toolbar button or a shortcut had nothing to reach.
 *
 * They all act on the cell the caret is in, which is what a table command means
 * when somebody is editing: "here" is a cell, and the row and column follow from
 * it.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import type { DocumentAccess, DocumentNode } from './document-access';

/** The operations, and the names a caller reaches them by. */
const COMMANDS: { name: string; op: string; payload?: Record<string, unknown> }[] = [
  { name: 'insertRowBelow', op: 'insertTableRow', payload: { position: 'after' } },
  { name: 'insertRowAbove', op: 'insertTableRow', payload: { position: 'before' } },
  { name: 'deleteRow', op: 'deleteTableRow' },
  { name: 'insertColumnRight', op: 'insertTableColumn', payload: { position: 'after' } },
  { name: 'insertColumnLeft', op: 'insertTableColumn', payload: { position: 'before' } },
  { name: 'deleteColumn', op: 'deleteTableColumn' },
  { name: 'mergeCells', op: 'mergeTableCells' },
  { name: 'splitCell', op: 'splitTableCell' }
];

export class WordTableExtension implements Extension {
  name = 'wordTables';
  // After the shared kit, whose own table commands were written for a schema
  // where a row is a row and a cell is a cell without the group between.
  priority = 45;

  onCreate(editor: Editor): void {
    for (const { name, op, payload } of COMMANDS) {
      (editor as any).registerCommand({
        name,
        execute: async (ed: Editor) => await this._run(ed, op, payload),
        canExecute: (ed: Editor) => !!this._cell(ed)
      });
    }

    // `inTable` is what scopes Tab to cell navigation in the keymap, and nothing
    // was setting it — so Tab in a table did whatever Tab does elsewhere.
    const track = () => (editor as any).setContext('inTable', !!this._cell(editor));
    editor.on('editor:selection.model', track);
    editor.on('editor:content.change', track);
    track();
  }

  private _doc(editor: Editor): DocumentAccess {
    const store: any = (editor as any).dataStore;
    return { getNode: (id: string) => store?.getNode?.(id), rootId: (editor as any).getRootId?.() };
  }

  /** The cell the caret is in, which is what "here" means to a table command. */
  private _cell(editor: Editor): DocumentNode | undefined {
    const selection: any = (editor as any).selection;
    if (!selection || selection.type !== 'range') return undefined;

    const doc = this._doc(editor);
    let node = doc.getNode(selection.startNodeId);
    for (let depth = 0; node && depth < 64; depth++) {
      if (node.stype === 'bTableCell' || node.stype === 'bTableHeaderCell') return node;
      node = node.parentId ? doc.getNode(node.parentId) : undefined;
    }
    return undefined;
  }

  private async _run(
    editor: Editor,
    op: string,
    payload: Record<string, unknown> = {}
  ): Promise<boolean> {
    const cell = this._cell(editor);
    if (!cell?.sid) return false;

    const result = await transaction(editor, [
      { type: op, payload: { ...payload, cellId: cell.sid } }
    ] as never).commit();
    return result.success;
  }
}

export function createWordTables(): WordTableExtension {
  return new WordTableExtension();
}
