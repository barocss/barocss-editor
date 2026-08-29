import { registerColumnsRenderers } from './default-renderers';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild, removeChild } from '@barocss/model';

export interface ColumnsExtensionOptions {
  defaultColumnCount?: number;
}

export class ColumnsExtension implements Extension {
  name = 'columns';
  priority = 100;
  private _defaultCount: number;

  constructor(options: ColumnsExtensionOptions = {}) {
    this._defaultCount = options.defaultColumnCount ?? 2;
  }

  /** What this extension's nodes look like when the product has not said. */

  defaultRenderers(): void {

    registerColumnsRenderers();

  }


  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertColumns',
      execute: async (ed: Editor, payload?: { count?: number; selection?: ModelSelection }) => {
        const count = payload?.count ?? this._defaultCount;
        const insertInfo = this._getInsertInfo(ed, payload?.selection);
        if (!insertInfo) return false;

        const columns: any[] = [];
        for (let i = 0; i < count; i++) {
          columns.push({
            stype: 'column',
            content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }]
          });
        }

        const ops = [
          addChild(insertInfo.parentId, { stype: 'columns', content: columns } as any, insertInfo.position)
        ];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'addColumn',
      execute: async (ed: Editor, payload?: { columnsId?: string }) => {
        const columnsId = payload?.columnsId;
        if (!isColumns(ed, columnsId)) return false;

        const newCol = {
          stype: 'column',
          content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }]
        };
        const ops = [addChild(columnsId!, newCol as any)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      /*
       * The same question the run asks, rather than `() => true` — 단 추가 lit up with nothing
       * selected and with an id naming a paragraph, and did nothing in both cases.
       */
      canExecute: (ed: Editor, payload?: { columnsId?: string }) => isColumns(ed, payload?.columnsId)
    });

    (editor as any).registerCommand({
      name: 'removeColumn',
      execute: async (ed: Editor, payload?: { columnsId?: string; columnId?: string }) => {
        if (!removable(ed, payload)) return false;
        const ops = [removeChild(payload!.columnsId!, payload!.columnId!)];
        const result = await transaction(ed, ops).commit();
        return result.success;
      },
      /**
       * **`() => true` was the whole guard**, on a command that needs *two* ids and refuses without
       * either — so 단 지우기 lit up with nothing selected, ran, and did nothing.
       *
       * And one thing more than the ids, which is why this is a lookup rather than two `!!`s: a
       * `columns` holds `column+`, so taking the **last** one away leaves a node the schema will not
       * accept. The transaction is refused, the document does not move, and the command reports
       * success — the exact shape this package's conformance run is named after.
       */
      canExecute: (ed: Editor, payload?: { columnsId?: string; columnId?: string }) => removable(ed, payload)
    });
  }

  onDestroy(_editor: Editor): void {}

  private _getInsertInfo(editor: Editor, selection?: ModelSelection): { parentId: string; position: number } | null {
    const sel = selection || (editor as any).selection;
    if (!sel || sel.type !== 'range') return null;
    const dataStore = (editor as any).dataStore;
    if (!dataStore) return null;
    const node = dataStore.getNode(sel.startNodeId);
    if (!node) return null;

    let blockId = sel.startNodeId;
    let current = node;
    const schema = dataStore.getActiveSchema?.();
    while (current?.parentId) {
      const parent = dataStore.getNode(current.parentId);
      if (!parent) break;
      const pType = schema?.getNodeType?.(parent.stype);
      if (pType?.group === 'block') { blockId = parent.sid ?? current.parentId; break; }
      current = parent;
    }
    const block = dataStore.getNode(blockId);
    if (!block?.parentId) return null;
    const docParent = dataStore.getNode(block.parentId);
    if (!docParent || !Array.isArray(docParent.content)) return null;
    const idx = docParent.content.indexOf(blockId);
    return { parentId: block.parentId, position: idx === -1 ? docParent.content.length : idx + 1 };
  }
}

export function createColumnsExtension(options?: ColumnsExtensionOptions): ColumnsExtension {
  return new ColumnsExtension(options);
}

/** Whether an id names a `columns` block of this document. */
function isColumns(editor: Editor, columnsId: string | undefined): boolean {
  if (!columnsId) return false;
  return editor.dataStore?.getNode(columnsId)?.stype === 'columns';
}

/**
 * Whether this column can be taken out of this `columns` — both real, and not the last one.
 *
 * One lookup, shared by the guard and the run, so the two cannot come apart. The last-column rule is
 * the schema's: `column+` means at least one, and a removal that empties the block is refused by the
 * validator rather than by the command, which is a refusal a reader never sees.
 */
function removable(
  editor: Editor,
  payload: { columnsId?: string; columnId?: string } | undefined
): boolean {
  if (!payload?.columnsId || !payload?.columnId) return false;
  const store = editor.dataStore;
  if (!store || !isColumns(editor, payload.columnsId)) return false;

  const held = ((store.getNode(payload.columnsId)?.content ?? []) as unknown[]).filter(
    (sid): sid is string => typeof sid === 'string'
  );
  return held.includes(payload.columnId) && held.length > 1;
}
