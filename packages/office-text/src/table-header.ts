import type { Editor } from '@barocss/editor-core';
import { create, moveNode, moveChildren, setNode, transaction } from '@barocss/model';
import { childrenOf, type DocumentAccess } from './document-access';

export interface TableHeaderPayload { tableId: string; enabled: boolean; }

function headerContext(editor: Editor, payload?: TableHeaderPayload) {
  if (!payload || typeof payload.enabled !== 'boolean') return;
  const doc: DocumentAccess = { rootId: editor.getRootId() ?? '', getNode: id => editor.dataStore.getNode(id) };
  const table = doc.getNode(payload.tableId);
  if (table?.stype !== 'bTable') return;
  const groups = childrenOf(doc, table);
  const header = groups.find(group => group.stype === 'bTableHeader');
  if (!!header === payload.enabled) return;
  const body = groups.find(group => group.stype === 'bTableBody');
  const row = payload.enabled ? childrenOf(doc, body)[0] : header;
  if (!body?.sid || !row?.sid) return;
  const cells = childrenOf(doc, row);
  // A span crossing this boundary cannot be moved to another table section.
  if (!cells.length || cells.some(cell => Number(cell.attributes?.rowspan ?? 1) > 1)) return;
  return { doc, body, row, cells };
}

/** Promote/demote the first row without replacing its text, marks, colors or ids. */
export function registerTableHeaderCommand(editor: Editor): void {
  editor.registerCommand({
    name: 'setTableHeader',
    canExecute: (ed: Editor, payload?: TableHeaderPayload) => !!headerContext(ed, payload),
    execute: async (ed: Editor, payload?: TableHeaderPayload) => {
      const context = headerContext(ed, payload);
      if (!context || !payload) return false;
      const { doc, body, row, cells } = context;
      const operations: unknown[] = [];
      if (payload.enabled && childrenOf(doc, body).length === 1) {
        // This supporting row is not an insertion target: keep the existing text/control
        // selection unchanged, including noncollapsed ranges, through undo and redo.
        const newRowId = ed.dataStore.generateId();
        operations.push(create({
          sid: newRowId, stype: 'bTableRow', content: cells.map(cell => ({
            sid: ed.dataStore.generateId(), stype: 'bTableCell', attributes: { colspan: cell.attributes?.colspan ?? 1 },
            content: [{ sid: ed.dataStore.generateId(), stype: 'inline-text', text: '' }]
          }))
        } as never), moveNode(newRowId, body.sid!));
      }
      operations.push(setNode({ ...ed.dataStore.getNode(row.sid!)!, stype: payload.enabled ? 'bTableHeader' : 'bTableRow' }, false));
      for (const cell of cells) operations.push(setNode({ ...ed.dataStore.getNode(cell.sid!)!,
        stype: payload.enabled ? 'bTableHeaderCell' : 'bTableCell' }, false));
      operations.push(moveChildren(payload.enabled ? body.sid! : payload.tableId,
        payload.enabled ? payload.tableId : body.sid!, [row.sid!], 0));
      return (await transaction(ed, operations as never).commit()).success;
    }
  });
}
