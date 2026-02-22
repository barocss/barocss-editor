import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

export class DescriptionListExtension implements Extension {
  name = 'descriptionList';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertDescriptionList',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const insertInfo = this._getInsertInfo(ed, payload?.selection);
        if (!insertInfo) return false;

        const dlNode = {
          stype: 'descList',
          content: [
            { stype: 'descTerm', content: [{ stype: 'inline-text', text: '' }] },
            { stype: 'descDef', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] }
          ]
        };

        const ops = [
          addChild(insertInfo.parentId, dlNode as any, insertInfo.position)
        ];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'addDescriptionItem',
      execute: async (ed: Editor, payload?: { descListId?: string }) => {
        if (!payload?.descListId) return false;
        const dataStore = (ed as any).dataStore;
        if (!dataStore) return false;
        const dlNode = dataStore.getNode(payload.descListId);
        if (!dlNode || dlNode.stype !== 'descList') return false;

        const ops = [
          addChild(payload.descListId, { stype: 'descTerm', content: [{ stype: 'inline-text', text: '' }] } as any),
          addChild(payload.descListId, { stype: 'descDef', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] } as any)
        ];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
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
      if (schema?.getNodeType?.(parent.stype)?.group === 'block') { blockId = parent.sid ?? current.parentId; break; }
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

export function createDescriptionListExtension(): DescriptionListExtension {
  return new DescriptionListExtension();
}
