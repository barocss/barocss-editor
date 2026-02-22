import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

export class FigureExtension implements Extension {
  name = 'figure';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertFigure',
      execute: async (ed: Editor, payload?: { src?: string; alt?: string; caption?: string; selection?: ModelSelection }) => {
        const insertInfo = this._getInsertInfo(ed, payload?.selection);
        if (!insertInfo) return false;

        const imgAttrs: any = { src: payload?.src ?? '', alt: payload?.alt ?? '' };
        const children: any[] = [
          { stype: 'inline-image', attributes: imgAttrs }
        ];

        if (payload?.caption !== undefined) {
          children.push({ stype: 'bFigcaption', content: [{ stype: 'inline-text', text: payload.caption }] });
        }

        const figNode = { stype: 'bFigure', content: children };
        const ops = [
          addChild(insertInfo.parentId, figNode as any, insertInfo.position)
        ];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'setFigcaption',
      execute: async (ed: Editor, payload?: { figureId?: string; caption?: string }) => {
        if (!payload?.figureId) return false;
        const dataStore = (ed as any).dataStore;
        if (!dataStore) return false;
        const figNode = dataStore.getNode(payload.figureId);
        if (!figNode || figNode.stype !== 'bFigure') return false;

        const captionNode = { stype: 'bFigcaption', content: [{ stype: 'inline-text', text: payload?.caption ?? '' }] };
        const ops = [addChild(payload.figureId, captionNode as any)];
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

export function createFigureExtension(): FigureExtension {
  return new FigureExtension();
}
