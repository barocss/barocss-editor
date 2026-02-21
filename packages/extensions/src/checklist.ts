import { Editor, Extension } from '@barocss/editor-core';
import { transaction, insertChecklist as insertChecklistOp } from '@barocss/model';

export interface ChecklistExtensionOptions {
  enabled?: boolean;
}

export class ChecklistExtension implements Extension {
  name = 'checklist';
  priority = 100;
  private _options: ChecklistExtensionOptions;

  constructor(options: ChecklistExtensionOptions = {}) {
    this._options = { enabled: true, ...options };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'insertChecklist',
      execute: async (ed: Editor, payload?: { checked?: boolean }) => {
        const ops = [insertChecklistOp(payload?.checked ?? false)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'toggleChecklistItem',
      execute: async (ed: Editor, payload?: { nodeId?: string }) => {
        if (!payload?.nodeId) return false;
        const dataStore = (ed as any).dataStore;
        if (!dataStore) return false;
        const node = dataStore.getNode(payload.nodeId);
        if (!node || node.stype !== 'taskItem') return false;
        const currentChecked = node.attributes?.checked ?? false;
        dataStore.setAttrs(payload.nodeId, { checked: !currentChecked });
        return true;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createChecklistExtension(options?: ChecklistExtensionOptions): ChecklistExtension {
  return new ChecklistExtension(options);
}
