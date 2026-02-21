import { Editor, Extension } from '@barocss/editor-core';
import { transaction, insertTable as insertTableOp } from '@barocss/model';

export interface TableExtensionOptions {
  enabled?: boolean;
  defaultRows?: number;
  defaultCols?: number;
}

export class TableExtension implements Extension {
  name = 'table';
  priority = 100;
  private _options: TableExtensionOptions;

  constructor(options: TableExtensionOptions = {}) {
    this._options = {
      enabled: true,
      defaultRows: 3,
      defaultCols: 3,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'insertTable',
      execute: async (ed: Editor, payload?: { rows?: number; cols?: number }) => {
        const rows = payload?.rows ?? this._options.defaultRows ?? 3;
        const cols = payload?.cols ?? this._options.defaultCols ?? 3;
        const ops = [insertTableOp(rows, cols)];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createTableExtension(options?: TableExtensionOptions): TableExtension {
  return new TableExtension(options);
}
