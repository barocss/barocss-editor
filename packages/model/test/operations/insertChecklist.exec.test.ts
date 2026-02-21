import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { insertChecklist as insertChecklistDsl } from '../../src/operations/insertChecklist';
import type { INode } from '@barocss/datastore';

describe('insertChecklist operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        taskItem: { name: 'taskItem', group: 'block', content: 'inline*', attrs: { checked: { type: 'boolean', default: false } } },
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

  it('inserts unchecked taskItem after current block', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertChecklist');
    expect(op).toBeDefined();
    const result = await op!.execute(
      { type: 'insertChecklist', payload: { checked: false } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(2);
    const taskId = doc.content![1];
    const task = dataStore.getNode(taskId) as INode;
    expect(task.stype).toBe('taskItem');
    expect(task.attributes?.checked).toBe(false);
    expect(task.content).toHaveLength(1);
    expect(result.selectionAfter).toBeDefined();
  });

  it('inserts checked taskItem when checked=true', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertChecklist');
    const result = await op!.execute(
      { type: 'insertChecklist', payload: { checked: true } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    const taskId = doc.content![1];
    const task = dataStore.getNode(taskId) as INode;
    expect(task.attributes?.checked).toBe(true);
  });

  it('DSL builds correct descriptor', () => {
    expect(insertChecklistDsl()).toEqual({ type: 'insertChecklist', payload: { checked: false } });
    expect(insertChecklistDsl(true)).toEqual({ type: 'insertChecklist', payload: { checked: true } });
  });

  it('provides inverse operation for undo', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertChecklist');
    const result = await op!.execute(
      { type: 'insertChecklist', payload: { checked: false } } as any,
      context
    );
    expect(result.inverse).toBeDefined();
    expect(result.inverse.type).toBe('delete');
    expect(result.inverse.payload.nodeId).toBeDefined();
  });

  it('throws when selection is missing', async () => {
    setupDoc();
    context.selection.current = null;
    const op = globalOperationRegistry.get('insertChecklist');
    await expect(
      op!.execute({ type: 'insertChecklist', payload: {} } as any, context)
    ).rejects.toThrow(/insertChecklist/);
  });
});
