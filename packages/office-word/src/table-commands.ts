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
import { formatTableLook, parseTableLook, tableOf, type TableLook } from './table-style';

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

/**
 * The order Word's Text Direction button moves through.
 *
 * A cycle rather than a list to choose from, because that is what the button is:
 * turning a header on its side is something you do by pressing until it looks
 * right. A cell that says nothing is reading the ordinary way, so the first
 * press turns it.
 */
const TEXT_DIRECTIONS = ['lrTb', 'tbRl', 'btLr'];

export function nextTextDirection(current: string): string {
  const at = TEXT_DIRECTIONS.indexOf(current);
  return TEXT_DIRECTIONS[((at < 0 ? 0 : at) + 1) % TEXT_DIRECTIONS.length];
}

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

    /**
     * The style the table wears, and which of its regions it asks for.
     *
     * Both are attributes of the table and neither touches a cell: applying a
     * style to a table that already has direct shading changes nothing the user
     * can see, which is Word's behaviour and the reason "clear formatting"
     * exists as a separate command.
     */
    (editor as any).registerCommand({
      name: 'setTableStyle',
      /**
       * No style is written as an empty id rather than as a missing attribute:
       * the store compares an update against the node to skip writes that change
       * nothing, and an attribute set to `undefined` compares equal to one that
       * was never there — so removing a style did nothing at all. An empty id
       * names no style, which is what every reader of one already does with it.
       */
      execute: async (ed: Editor, payload: { styleId?: string } = {}) =>
        await this._format(ed, { styleId: payload.styleId ?? '' }),
      canExecute: (ed: Editor) => !!this._cell(ed)
    });

    (editor as any).registerCommand({
      name: 'toggleTableLook',
      execute: async (ed: Editor, payload: { flag?: keyof TableLook } = {}) => {
        const table = this._table(ed);
        if (!table || !payload.flag) return false;
        const look = parseTableLook(table.attributes?.look);
        look[payload.flag] = !look[payload.flag];
        return await this._format(ed, { look: formatTableLook(look) });
      },
      canExecute: (ed: Editor) => !!this._cell(ed)
    });

    /**
     * How tall the row is, how its cells sit in it, and which way their text
     * runs — the three that a document could state and a user could not.
     *
     * Each acts on the row or the cell the caret is in, the same "here" the
     * structure commands act on. They set attributes and nothing else: what any
     * of them looks like is the renderer's answer, and it already knows.
     */
    (editor as any).registerCommand({
      name: 'setRowHeight',
      execute: async (ed: Editor, payload: { height?: number; rule?: string } = {}) => {
        const rule = payload.rule ?? (payload.height ? 'atLeast' : 'auto');
        // A row of no height is a row that sizes to its text, and `auto` is how
        // Word says so — it keeps the number and stops honouring it.
        return await this._formatRow(ed, { height: payload.height ?? 0, heightRule: rule });
      },
      canExecute: (ed: Editor) => !!this._row(ed)
    });

    (editor as any).registerCommand({
      name: 'setCellVerticalAlign',
      execute: async (ed: Editor, payload: { align?: string } = {}) =>
        await this._formatCell(ed, { verticalAlign: payload.align ?? 'top' }),
      canExecute: (ed: Editor) => !!this._cell(ed)
    });

    (editor as any).registerCommand({
      name: 'setCellTextDirection',
      /**
       * With no direction named it moves to the next one, which is what Word's
       * button does: the three states are a cycle, and a reader turning a header
       * on its side does not want to choose from a list to do it.
       */
      execute: async (ed: Editor, payload: { direction?: string } = {}) => {
        const cell = this._cell(ed);
        if (!cell) return false;
        const direction =
          payload.direction ?? nextTextDirection(String(cell.attributes?.textDirection ?? ''));
        return await this._formatCell(ed, { textDirection: direction });
      },
      canExecute: (ed: Editor) => !!this._cell(ed)
    });

    // `inTable` is what scopes Tab to cell navigation in the keymap, and nothing
    // was setting it — so Tab in a table did whatever Tab does elsewhere.
    const track = () => (editor as any).setContext('inTable', !!this._cell(editor));
    editor.on('editor:selection.model', track);
    editor.on('editor:content.change', track);
    track();
  }

  /** The table the caret is in, which is what a table-wide command acts on. */
  private _table(editor: Editor): DocumentNode | undefined {
    return tableOf(this._doc(editor), this._cell(editor));
  }

  /**
   * The row the caret is in.
   *
   * The cell's parent, which is the row itself — or the header group, in the
   * shape where it holds its cells directly and *is* the row.
   */
  private _row(editor: Editor): DocumentNode | undefined {
    const cell = this._cell(editor);
    const doc = this._doc(editor);
    return cell?.parentId ? doc.getNode(cell.parentId) : undefined;
  }

  /**
   * Set attributes on a node, leaving the ones not named alone.
   *
   * `setAttrs` rather than a write to the store: it merges, it validates against
   * the schema, and it records its own inverse — so applying a style is one
   * undo, like every other edit.
   */
  private async _setAttrs(
    editor: Editor,
    node: DocumentNode | undefined,
    attributes: Record<string, unknown>
  ): Promise<boolean> {
    if (!node?.sid) return false;

    const result = await transaction(editor, [
      { type: 'setAttrs', payload: { nodeId: node.sid, attrs: attributes } }
    ] as never).commit();
    return result.success;
  }

  private _format(editor: Editor, attributes: Record<string, unknown>): Promise<boolean> {
    return this._setAttrs(editor, this._table(editor), attributes);
  }

  private _formatRow(editor: Editor, attributes: Record<string, unknown>): Promise<boolean> {
    return this._setAttrs(editor, this._row(editor), attributes);
  }

  private _formatCell(editor: Editor, attributes: Record<string, unknown>): Promise<boolean> {
    return this._setAttrs(editor, this._cell(editor), attributes);
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
