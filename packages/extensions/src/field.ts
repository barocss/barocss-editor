import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
import { transaction, addChild } from '@barocss/model';

type FieldType = 'fieldPageNumber' | 'fieldPageCount' | 'fieldDateTime' | 'fieldDocTitle' | 'fieldAuthor';

export class FieldExtension implements Extension {
  name = 'field';
  priority = 100;

  onCreate(editor: Editor): void {
    const fields: { cmd: string; stype: FieldType; hasAttrs: boolean }[] = [
      { cmd: 'insertFieldPageNumber', stype: 'fieldPageNumber', hasAttrs: false },
      { cmd: 'insertFieldPageCount', stype: 'fieldPageCount', hasAttrs: false },
      { cmd: 'insertFieldDateTime', stype: 'fieldDateTime', hasAttrs: true },
      { cmd: 'insertFieldDocTitle', stype: 'fieldDocTitle', hasAttrs: false },
      { cmd: 'insertFieldAuthor', stype: 'fieldAuthor', hasAttrs: false },
    ];

    for (const f of fields) {
      (editor as any).registerCommand({
        name: f.cmd,
        execute: async (ed: Editor, payload?: { selection?: ModelSelection; format?: string }) => {
          const sel = payload?.selection || (ed as any).selection;
          if (!sel || sel.type !== 'range') return false;

          const dataStore = (ed as any).dataStore;
          if (!dataStore) return false;

          const node = dataStore.getNode(sel.startNodeId);
          if (!node) return false;

          const parentId = node.parentId ?? sel.startNodeId;
          const parent = dataStore.getNode(parentId);
          if (!parent || !Array.isArray(parent.content)) return false;

          const childIndex = parent.content.indexOf(sel.startNodeId);
          const insertPos = childIndex === -1 ? parent.content.length : childIndex + 1;

          const nodeData: any = { stype: f.stype };
          if (f.hasAttrs && payload?.format) {
            nodeData.attributes = { format: payload.format };
          }

          const ops = [addChild(parentId, nodeData, insertPos)];
          const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
          return result.success;
        },
        /*
         * A **range**, which the run has always required: `_getInsertInfo` refuses anything else and
         * says so to nobody. The class `guards.ts` names, and the one a builder meets most — a deck or
         * a page builder holds a box rather than a caret, and every one of these lit up over one.
         */
        canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
      });
    }
  }

  onDestroy(_editor: Editor): void {}
}

export function createFieldExtension(): FieldExtension {
  return new FieldExtension();
}
