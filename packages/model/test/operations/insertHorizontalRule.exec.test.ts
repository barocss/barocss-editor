import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { insertHorizontalRule as insertHorizontalRuleDsl } from '../../src/operations/insertHorizontalRule';
import type { INode } from '@barocss/datastore';

describe('insertHorizontalRule operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        horizontalRule: { name: 'horizontalRule', group: 'block', atom: true },
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

  it('inserts hr and a new paragraph after current block', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertHorizontalRule');
    expect(op).toBeDefined();
    const result = await op!.execute({ type: 'insertHorizontalRule', payload: {} } as any, context);

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(3);

    const hrId = doc.content![1];
    const hr = dataStore.getNode(hrId) as INode;
    expect(hr.stype).toBe('horizontalRule');

    const newParagraph = dataStore.getNode(doc.content![2]) as INode;
    expect(newParagraph.stype).toBe('paragraph');
  });

  it('selection moves to the new paragraph text node', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertHorizontalRule');
    const result = await op!.execute({ type: 'insertHorizontalRule', payload: {} } as any, context);
    expect(result.selectionAfter).toBeDefined();
    expect(result.selectionAfter.offset).toBe(0);
  });

  it('DSL builds correct descriptor', () => {
    const d = insertHorizontalRuleDsl();
    expect(d).toEqual({ type: 'insertHorizontalRule', payload: {} });
  });

  it('provides inverse operation for undo', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertHorizontalRule');
    const result = await op!.execute({ type: 'insertHorizontalRule', payload: {} } as any, context);
    expect(result.inverse).toBeDefined();
    // Both of them: this puts a rule *and* an empty paragraph to hold the caret,
    // and an inverse that named only the rule left the blank line behind.
    expect(result.inverse.type).toBe('removeChildren');
    expect(result.inverse.payload.childIds).toHaveLength(2);
  });

  it('throws when selection is missing', async () => {
    setupDoc();
    context.selection.current = null;
    const op = globalOperationRegistry.get('insertHorizontalRule');
    await expect(
      op!.execute({ type: 'insertHorizontalRule', payload: {} } as any, context)
    ).rejects.toThrow(/insertHorizontalRule/);
  });
});
