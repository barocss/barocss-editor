import { registerTocRenderers } from './default-renderers';
import { hasRange } from './guards';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

export class TocExtension implements Extension {
  name = 'toc';
  priority = 100;

  /** What this extension's nodes look like when the product has not said. */

  defaultRenderers(): void {

    registerTocRenderers();

  }


  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertToc',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const insertInfo = this._getInsertInfo(ed, payload?.selection);
        if (!insertInfo) return false;

        const ops = [
          addChild(insertInfo.parentId, { stype: 'toc' } as any, insertInfo.position)
        ];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      /**
       * A **range**, which the run has always required and this did not say.
       *
       * `canExecute: () => true` over an insert that needs somewhere to go: with a node held or
       * nothing selected the control lights up, the reader presses it, and the refusal goes to a
       * console nobody is watching — the class `guards.ts` names, and the one a **builder** meets
       * most, because a deck and a page builder spend their time with a box selected rather than a
       * caret.
       *
       * Invisible until the probe was given the two states a builder has: it had only ever put a
       * caret in a run, where every one of these works.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
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

export function createTocExtension(): TocExtension {
  return new TocExtension();
}
