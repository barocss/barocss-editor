import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { insertTable as insertTableDsl } from '../../src/operations/insertTable';
import type { INode } from '@barocss/datastore';

describe('insertTable operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        bTable: { name: 'bTable', group: 'block', content: 'block+' },
        bTableHeader: { name: 'bTableHeader', group: 'block', content: 'block+' },
        bTableBody: { name: 'bTableBody', group: 'block', content: 'block+' },
        bTableRow: { name: 'bTableRow', group: 'block', content: 'block+' },
        bTableHeaderCell: { name: 'bTableHeaderCell', group: 'block', content: 'inline*' },
        bTableCell: { name: 'bTableCell', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  function setSelection(nodeId: string, offset: number): void {
    context.selection.setCaret(nodeId, offset);
  }

  function setupDoc(): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] });
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' });
    dataStore.setNode({ sid: 'text-1', stype: 'inline-text', text: 'Hello', parentId: 'p-1' });
  }

  it('inserts a 3x3 table by default', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertTable');
    expect(op).toBeDefined();
    const result = await op!.execute(
      { type: 'insertTable', payload: { rows: 3, cols: 3 } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(2);

    const tableId = doc.content![1];
    const table = dataStore.getNode(tableId) as INode;
    expect(table.stype).toBe('bTable');
    expect(table.content).toHaveLength(2); // header + body

    const header = dataStore.getNode(table.content![0]) as INode;
    expect(header.stype).toBe('bTableHeader');
    expect(header.content).toHaveLength(3); // 3 header cells

    const body = dataStore.getNode(table.content![1]) as INode;
    expect(body.stype).toBe('bTableBody');
    expect(body.content).toHaveLength(2); // 2 data rows (total 3 - 1 header)
  });

  it('inserts a 2x4 table with custom size', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertTable');
    const result = await op!.execute(
      { type: 'insertTable', payload: { rows: 2, cols: 4 } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    const tableId = doc.content![1];
    const table = dataStore.getNode(tableId) as INode;

    const header = dataStore.getNode(table.content![0]) as INode;
    expect(header.content).toHaveLength(4); // 4 header cells

    const body = dataStore.getNode(table.content![1]) as INode;
    expect(body.content).toHaveLength(1); // 1 data row (total 2 - 1 header)
  });

  it('selection moves to first header cell text', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertTable');
    const result = await op!.execute(
      { type: 'insertTable', payload: { rows: 3, cols: 3 } } as any,
      context
    );
    expect(result.selectionAfter).toBeDefined();
    expect(result.selectionAfter.offset).toBe(0);
  });

  it('DSL builds correct descriptor', () => {
    const d1 = insertTableDsl();
    expect(d1.type).toBe('insertTable');
    expect(d1.payload.rows).toBe(3);
    expect(d1.payload.cols).toBe(3);

    const d2 = insertTableDsl(5, 2);
    expect(d2.payload.rows).toBe(5);
    expect(d2.payload.cols).toBe(2);
  });

  it('provides inverse operation for undo', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertTable');
    const result = await op!.execute(
      { type: 'insertTable', payload: { rows: 2, cols: 2 } } as any,
      context
    );
    expect(result.inverse).toBeDefined();
    expect(result.inverse.type).toBe('delete');
  });

  it('throws when selection is missing', async () => {
    setupDoc();
    context.selection.current = null;
    const op = globalOperationRegistry.get('insertTable');
    await expect(
      op!.execute({ type: 'insertTable', payload: { rows: 3, cols: 3 } } as any, context)
    ).rejects.toThrow(/insertTable/);
  });
});
