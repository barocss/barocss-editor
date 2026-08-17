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
        if (!payload?.columnsId) return false;
        const dataStore = (ed as any).dataStore;
        if (!dataStore) return false;
        const columnsNode = dataStore.getNode(payload.columnsId);
        if (!columnsNode || columnsNode.stype !== 'columns') return false;

        const newCol = {
          stype: 'column',
          content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }]
        };
        const ops = [addChild(payload.columnsId, newCol as any)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'removeColumn',
      execute: async (ed: Editor, payload?: { columnsId?: string; columnId?: string }) => {
        if (!payload?.columnsId || !payload?.columnId) return false;
        const ops = [removeChild(payload.columnsId, payload.columnId)];
        const result = await transaction(ed, ops).commit();
        return result.success;
      },
      canExecute: () => true
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
