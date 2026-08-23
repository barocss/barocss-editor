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
import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import type { DocumentAccess, DocumentNode } from './document-access';
import {
  cellPlacementOf,
  formatTableLook,
  parseTableLook,
  tableOf,
  type TableLook
} from './table-style';
import { cellContaining, columnsCovered, rowsCovered } from './table-selection';

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

export interface WordTableOptions {
  /**
   * Whether to register the *formatting* commands as well as the structural
   * ones — a table's style and look, a row's height, a cell's alignment, text
   * direction and shading.
   *
   * A product that has nowhere to put them should say so. The deck installs these
   * commands for the structure — its tables have the same header/body shape as
   * Word's, so the shared kit's commands are wrong for it — and its chrome is a
   * properties panel rather than a ribbon, with no style gallery and no height
   * field. Registering them anyway makes a command that works and cannot be
   * reached, which is the thing this repository keeps finding in its own code:
   * `every-command-can-be-reached` reported all six the moment the deck's
   * conformance stopped measuring its own commands from a stale list.
   *
   * So the choice is explicit. `true` is Word.
   */
  formatting?: boolean;
}

export class WordTableExtension implements Extension {
  name = 'wordTables';
  // After the shared kit, whose own table commands were written for a schema
  // where a row is a row and a cell is a cell without the group between.
  priority = 45;

  constructor(private readonly _options: WordTableOptions = {}) {}

  onCreate(editor: Editor): void {
    const formatting = this._options.formatting !== false;

    for (const { name, op, payload } of COMMANDS) {
      (editor as any).registerCommand({
        name,
        execute: async (ed: Editor) => await this._run(ed, op, payload),
        canExecute: (ed: Editor) => !!this._cell(ed)
      });
    }

    /**
     * Taking the whole table away.
     *
     * The one command that needs the table to have been named *as a table*: with
     * a caret in a cell, Delete deletes a character, and a command that removed
     * the table instead would be the most destructive misunderstanding in the
     * product. So it runs only when the table itself is selected — which is what
     * the handle at its corner is for — and the key binding says the same.
     *
     * The selection goes with it, because what it pointed at is gone: a
     * selection naming a node the document no longer has is one every reader of
     * it has to guard against, and the guard is easy to forget.
     */
    (editor as any).registerCommand({
      name: 'deleteTable',
      execute: async (ed: Editor) => {
        const table = this._selectedTable(ed);
        if (!table?.sid || !table.parentId) return false;

        const result = await transaction(ed, [
          { type: 'removeChild', payload: { parentId: table.parentId, childId: table.sid } }
        ] as never).commit();

        if (result.success) (ed as any).updateSelection(null);
        return result.success;
      },
      canExecute: (ed: Editor) => !!this._selectedTable(ed)
    });

    /**
     * The formatting commands, which a product may decline; see
     * `WordTableOptions`.
     */
    if (formatting) {
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

      /**
       * Shading a block of cells, which is what a reader selects cells *for*.
       *
       * `shadingFill` has been drawn since tables were drawn and nothing has ever
       * set it: a document that arrived shaded looked right and a reader could not
       * shade anything. The two halves of the same gap — `shadingColor` and
       * `shadingPattern` were read by nothing either, and are now (see
       * `shadingCss`).
       *
       * Every selected cell in one transaction, which is the reason this had to
       * wait for a cell selection to exist. Shading one cell at a time is not what
       * anybody means by shading a table's header.
       */
      (editor as any).registerCommand({
        name: 'setCellShading',
        execute: async (
          ed: Editor,
          payload: { fill?: string; color?: string; pattern?: string } = {}
        ) =>
          await this._formatCell(ed, {
            /**
             * Empty rather than absent, for "no shading".
             *
             * `dataStore.updateNode` skips a write whose fields compare equal to
             * what is there, and an attribute set to `undefined` compares equal to
             * one that was never set — so clearing a shading did nothing at all.
             * The same trap `setTableStyle` fell into; an empty string names no
             * colour, which every reader of one already handles.
             */
            shadingFill: payload.fill ?? '',
            shadingColor: payload.color ?? '',
            shadingPattern: payload.pattern ?? ''
          }),
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
    }

    /**
     * And `tableSelected`, which is a different question from `inTable`.
     *
     * A caret in a cell is in a table; a table selected by its handle is *the*
     * table. Delete means "one character" for the first and "take this away" for
     * the second, so the key map needs to be able to tell them apart — and the
     * two contexts are what lets it.
     */
    const track = () => {
      (editor as any).setContext('inTable', !!this._cell(editor));
      (editor as any).setContext('tableSelected', !!this._selectedTable(editor));
    };
    editor.on('editor:selection.model', track);
    editor.on('editor:content.change', track);
    track();
  }

  /**
   * The table the reader named *as a table*, through the handle at its corner.
   *
   * Distinct from `_table`, and the distinction is the whole point of the `table`
   * selection type: a caret in a cell is in a table too, and a command that
   * removes one must not be reachable that way.
   */
  private _selectedTable(editor: Editor): DocumentNode | undefined {
    const selection: any = (editor as any).selection;
    if (selection?.type !== 'table') return undefined;

    const node = this._doc(editor).getNode(selectedNodeIds(selection)[0]);
    return node?.stype === 'bTable' ? node : undefined;
  }

  /**
   * The table a table-wide command acts on.
   *
   * Three ways to name one, in order of how directly the reader said it: the
   * table *itself* is selected, through the handle at its corner; a block of
   * cells is selected; or the caret is in one.
   */
  private _table(editor: Editor): DocumentNode | undefined {
    return this._selectedTable(editor) ?? tableOf(this._doc(editor), this._cell(editor));
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

  /** Every row the selection reaches, each once, in document order. */
  private _rows(editor: Editor): DocumentNode[] {
    const doc = this._doc(editor);
    const rows = new Map<string, DocumentNode>();

    for (const cell of this._cells(editor)) {
      const row = cell.parentId ? doc.getNode(cell.parentId) : undefined;
      if (row?.sid) rows.set(row.sid, row);
    }

    return [...rows.values()];
  }

  /**
   * Set attributes on some nodes, leaving the ones not named alone.
   *
   * `setAttrs` rather than a write to the store: it merges, it validates against
   * the schema, and it records its own inverse — so applying a style is one undo,
   * like every other edit.
   *
   * All of them in **one** transaction, which is the reason this takes a list.
   * Aligning four selected cells is one thing the reader did, so it has to be one
   * thing to undo; four transactions would need four presses of Ctrl+Z to put
   * back, and the three in between would each be a state the document was never
   * meant to be in.
   */
  private async _setAttrs(
    editor: Editor,
    nodes: Array<DocumentNode | undefined>,
    attributes: Record<string, unknown>
  ): Promise<boolean> {
    const targets = nodes.filter((node): node is DocumentNode => !!node?.sid);
    if (targets.length === 0) return false;

    const result = await transaction(
      editor,
      targets.map((node) => ({
        type: 'setAttrs',
        payload: { nodeId: node.sid, attrs: attributes }
      })) as never
    ).commit();
    return result.success;
  }

  private _format(editor: Editor, attributes: Record<string, unknown>): Promise<boolean> {
    return this._setAttrs(editor, [this._table(editor)], attributes);
  }

  /**
   * Every row the selection covers, not the first one.
   *
   * A reader who selects two rows and sets a height means both. This used to
   * take `_row`, which is the row of whichever cell came first — so the second
   * row kept its old height and the table came out uneven, in a way that looks
   * like the command half-worked.
   */
  private _formatRow(editor: Editor, attributes: Record<string, unknown>): Promise<boolean> {
    return this._setAttrs(editor, this._rows(editor), attributes);
  }

  /** Every selected cell. Same reasoning as `_formatRow`. */
  private _formatCell(editor: Editor, attributes: Record<string, unknown>): Promise<boolean> {
    return this._setAttrs(editor, this._cells(editor), attributes);
  }

  private _doc(editor: Editor): DocumentAccess {
    const store: any = (editor as any).dataStore;
    return { getNode: (id: string) => store?.getNode?.(id), rootId: (editor as any).getRootId?.() };
  }

  /**
   * The cells a table command acts on: the block that is selected, or the one
   * the caret is in.
   *
   * "Here" used to mean a caret and nothing else — `selection.type !== 'range'`
   * returned nothing — so a reader who dragged across four cells turned every
   * button on this toolbar off. That was consistent while nothing produced a
   * `cell` selection, and it is the first thing that has to change now something
   * does.
   */
  private _cells(editor: Editor): DocumentNode[] {
    const selection: any = (editor as any).selection;
    if (!selection) return [];

    const doc = this._doc(editor);

    if (selection.type === 'cell') {
      return selectedNodeIds(selection)
        .map((sid) => cellContaining(doc, sid))
        .filter((cell): cell is DocumentNode => !!cell);
    }
    if (selection.type !== 'range') return [];

    const cell = cellContaining(doc, selection.startNodeId);
    return cell ? [cell] : [];
  }

  /** The first of them, for the commands that act on one cell whatever is selected. */
  private _cell(editor: Editor): DocumentNode | undefined {
    return this._cells(editor)[0];
  }

  private async _run(
    editor: Editor,
    op: string,
    payload: Record<string, unknown> = {}
  ): Promise<boolean> {
    const cells = this._cells(editor);
    if (cells.length === 0) return false;

    const result = await transaction(editor, this._operations(editor, op, payload, cells) as never).commit();
    return result.success;
  }

  /**
   * What one press does to a block of cells, per operation.
   *
   * Three different answers, and guessing one for all of them would be wrong in
   * two ways at once — deleting four rows for four selected cells in the same
   * row, or merging nothing because merge was handed one cell four times.
   */
  private _operations(
    editor: Editor,
    op: string,
    payload: Record<string, unknown>,
    cells: DocumentNode[]
  ): { type: string; payload: Record<string, unknown> }[] {
    const doc = this._doc(editor);
    const ids = cells.map((cell) => cell.sid as string).filter(Boolean);

    /**
     * Merging is the one that *needs* a block. It takes the two corners and
     * works out the rectangle itself, which is why the selection can be handed
     * over as its first and last cell: those are opposite corners of the block
     * by construction, since the block is in document order.
     *
     * This is also the command that has never worked. It was called with
     * `cellId`, which `mergeTableCells` does not read — it wants `fromCellId`
     * and `toCellId` — so the operation saw two undefined cells and failed on
     * every press. Nothing noticed, because there was no way to select the two
     * cells it needed.
     */
    if (op === 'mergeTableCells') {
      return [
        {
          type: op,
          payload: { ...payload, fromCellId: ids[0], toCellId: ids[ids.length - 1] }
        }
      ];
    }

    /**
     * Deleting acts once per row or column the block covers, not once per cell.
     * Four cells in one row are one row to delete.
     *
     * By cell id rather than by index, so the operations do not have to be
     * renumbered as earlier ones take effect: each finds its own row from a cell
     * that is still in the document.
     */
    if (op === 'deleteTableRow' || op === 'deleteTableColumn') {
      const covered = op === 'deleteTableRow' ? rowsCovered(doc, ids) : columnsCovered(doc, ids);
      const perLine = new Map<number, string>();

      for (const sid of ids) {
        const at = cellContaining(doc, sid);
        const placement = at ? cellPlacementOf(doc, at) : undefined;
        if (!placement) continue;
        const line = op === 'deleteTableRow' ? placement.at.row : placement.at.column;
        if (!perLine.has(line)) perLine.set(line, sid);
      }

      const targets = covered.map((line) => perLine.get(line)).filter((sid): sid is string => !!sid);
      return targets.map((cellId) => ({ type: op, payload: { ...payload, cellId } }));
    }

    // Everything else is per cell: inserting a row above a block of two rows
    // inserts two, which is what every table editor does and what a reader who
    // selected two rows is asking for.
    return ids.map((cellId) => ({ type: op, payload: { ...payload, cellId } }));
  }
}

export function createWordTables(options: WordTableOptions = {}): WordTableExtension {
  return new WordTableExtension(options);
}
