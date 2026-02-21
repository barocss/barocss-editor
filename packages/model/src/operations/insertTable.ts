import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

export const insertTable = defineOperationDSL(
  (rows: number = 3, cols: number = 3) => ({
    type: 'insertTable',
    payload: { rows, cols }
  } as any),
  { atom: false, category: 'structure' }
);

defineOperation('insertTable', async (operation: any, context: TransactionContext) => {
  const { rows = 3, cols = 3 } = operation.payload;
  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!selection || selection.type !== 'range') {
    throw new Error('insertTable: no selection');
  }

  const startNode = dataStore.getNode(selection.startNodeId);
  if (!startNode) throw new Error('insertTable: start node not found');

  let blockNode = startNode;
  if (typeof startNode.text === 'string') {
    const parent = dataStore.getParent(startNode.sid!);
    if (parent) blockNode = parent;
  }

  const grandParent = blockNode.parentId ? dataStore.getNode(blockNode.parentId) : null;
  if (!grandParent || !Array.isArray(grandParent.content)) {
    throw new Error('insertTable: cannot find parent container');
  }

  const idx = grandParent.content.indexOf(blockNode.sid!);
  if (idx === -1) throw new Error('insertTable: block not in parent');

  const tableId = dataStore.content.addChild(grandParent.sid!, {
    stype: 'bTable',
    attributes: {},
    content: []
  } as any, idx + 1);

  const headerRowId = dataStore.content.addChild(tableId, {
    stype: 'bTableHeader',
    content: []
  } as any, 0);

  let firstCellTextId: string | null = null;
  for (let c = 0; c < cols; c++) {
    const cellId = dataStore.content.addChild(headerRowId, {
      stype: 'bTableHeaderCell',
      attributes: { colspan: 1, rowspan: 1 },
      content: []
    } as any, c);
    const textId = dataStore.content.addChild(cellId, { stype: 'inline-text', text: '' } as any, 0);
    if (!firstCellTextId) firstCellTextId = textId;
  }

  const bodyId = dataStore.content.addChild(tableId, {
    stype: 'bTableBody',
    content: []
  } as any, 1);

  for (let r = 0; r < rows - 1; r++) {
    const rowId = dataStore.content.addChild(bodyId, {
      stype: 'bTableRow',
      content: []
    } as any, r);
    for (let c = 0; c < cols; c++) {
      const cellId = dataStore.content.addChild(rowId, {
        stype: 'bTableCell',
        attributes: { colspan: 1, rowspan: 1 },
        content: []
      } as any, c);
      dataStore.content.addChild(cellId, { stype: 'inline-text', text: '' } as any, 0);
    }
  }

  return {
    ok: true,
    data: dataStore.getNode(tableId),
    inverse: { type: 'delete', payload: { nodeId: tableId } },
    selectionAfter: firstCellTextId ? { nodeId: firstCellTextId, offset: 0 } : undefined
  };
});
