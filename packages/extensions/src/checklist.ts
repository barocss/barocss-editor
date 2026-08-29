import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
import { transaction, control, insertChecklist as insertChecklistOp } from '@barocss/model';

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
      /*
       * A **range**, like every other insert here: the run needs somewhere to put the item and says
       * so to nobody. See `guards.ts`.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
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
        const ops = [
          ...control(payload.nodeId, [
            { type: 'setAttrs', payload: { attrs: { checked: !currentChecked } } } as any
          ])
        ];
        const result = await transaction(ed, ops).commit();
        return result.success;
      },
      /**
       * A `taskItem`, **named** — which is the whole of what the run needs and none of what this
       * asked.
       *
       * It answered yes to everything, so 체크 lit up with a paragraph held, with a heading held and
       * with nothing held, and declined every time. One lookup, shared with the run, so the two
       * cannot come apart.
       */
      canExecute: (ed: Editor, payload?: { nodeId?: string }) =>
        !!payload?.nodeId && ed.dataStore?.getNode(payload.nodeId)?.stype === 'taskItem'
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createChecklistExtension(options?: ChecklistExtensionOptions): ChecklistExtension {
  return new ChecklistExtension(options);
}
