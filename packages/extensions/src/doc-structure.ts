import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

type DocStructureType =
  | 'docSection' | 'docHeader' | 'docFooter'
  | 'bibliography' | 'endnoteDef' | 'indexBlock' | 'chart';

interface DocStructureSpec {
  cmd: string;
  stype: DocStructureType;
  hasContent: boolean;
  attrKeys?: string[];
}

export class DocStructureExtension implements Extension {
  name = 'docStructure';
  priority = 80;

  private static _specs: DocStructureSpec[] = [
    { cmd: 'insertDocSection', stype: 'docSection', hasContent: true },
    { cmd: 'insertDocHeader', stype: 'docHeader', hasContent: true },
    { cmd: 'insertDocFooter', stype: 'docFooter', hasContent: true },
    { cmd: 'insertBibliography', stype: 'bibliography', hasContent: true },
    { cmd: 'insertEndnote', stype: 'endnoteDef', hasContent: true, attrKeys: ['id'] },
    { cmd: 'insertIndexBlock', stype: 'indexBlock', hasContent: true },
    { cmd: 'insertChart', stype: 'chart', hasContent: false, attrKeys: ['title', 'values'] },
  ];

  onCreate(editor: Editor): void {
    for (const spec of DocStructureExtension._specs) {
      (editor as any).registerCommand({
        name: spec.cmd,
        execute: async (ed: Editor, payload?: { selection?: ModelSelection; attrs?: Record<string, any> }) => {
          const insertInfo = this._getInsertInfo(ed, payload?.selection);
          if (!insertInfo) return false;

          const nodeData: any = { stype: spec.stype };

          if (spec.attrKeys && payload?.attrs) {
            const attrs: Record<string, any> = {};
            for (const key of spec.attrKeys) {
              if (payload.attrs[key] !== undefined) attrs[key] = payload.attrs[key];
            }
            if (Object.keys(attrs).length > 0) nodeData.attributes = attrs;
          }

          if (spec.hasContent && !nodeData.content) {
            nodeData.content = [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }];
          }

          const ops = [addChild(insertInfo.parentId, nodeData, insertInfo.position)];
          const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
          return result.success;
        },
        canExecute: () => true
      });
    }
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
      if (schema?.getNodeType?.(parent.stype)?.group === 'block') {
        blockId = parent.sid ?? current.parentId;
        break;
      }
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

export function createDocStructureExtension(): DocStructureExtension {
  return new DocStructureExtension();
}
