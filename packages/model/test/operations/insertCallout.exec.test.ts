import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { insertCallout as insertCalloutDsl } from '../../src/operations/insertCallout';
import type { INode } from '@barocss/datastore';

describe('insertCallout operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        callout: { name: 'callout', group: 'block', content: 'block+', attrs: { type: { type: 'string', default: 'info' }, title: { type: 'string', required: false } } },
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

  it('inserts info callout with inner paragraph after current block', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertCallout');
    expect(op).toBeDefined();
    const result = await op!.execute(
      { type: 'insertCallout', payload: { calloutType: 'info' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(2);

    const calloutId = doc.content![1];
    const callout = dataStore.getNode(calloutId) as INode;
    expect(callout.stype).toBe('callout');
    expect(callout.attributes?.type).toBe('info');
    expect(callout.content).toHaveLength(1);

    const innerParagraph = dataStore.getNode(callout.content![0]) as INode;
    expect(innerParagraph.stype).toBe('paragraph');
    expect(innerParagraph.content).toHaveLength(1);
  });

  it('inserts callout with custom type and title', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertCallout');
    const result = await op!.execute(
      { type: 'insertCallout', payload: { calloutType: 'warning', title: 'Caution' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    const calloutId = doc.content![1];
    const callout = dataStore.getNode(calloutId) as INode;
    expect(callout.attributes?.type).toBe('warning');
    expect(callout.attributes?.title).toBe('Caution');
  });

  it('selection moves to inner text node', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertCallout');
    const result = await op!.execute(
      { type: 'insertCallout', payload: { calloutType: 'info' } } as any,
      context
    );
    expect(result.selectionAfter).toBeDefined();
    expect(result.selectionAfter.offset).toBe(0);
  });

  it('DSL builds correct descriptor', () => {
    const d1 = insertCalloutDsl();
    expect(d1.type).toBe('insertCallout');
    expect(d1.payload.calloutType).toBe('info');

    const d2 = insertCalloutDsl('warning', 'Watch out');
    expect(d2.payload.calloutType).toBe('warning');
    expect(d2.payload.title).toBe('Watch out');
  });

  it('provides inverse operation for undo', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertCallout');
    const result = await op!.execute(
      { type: 'insertCallout', payload: { calloutType: 'info' } } as any,
      context
    );
    expect(result.inverse).toBeDefined();
    expect(result.inverse.type).toBe('delete');
  });

  it('throws when selection is missing', async () => {
    setupDoc();
    context.selection.current = null;
    const op = globalOperationRegistry.get('insertCallout');
    await expect(
      op!.execute({ type: 'insertCallout', payload: {} } as any, context)
    ).rejects.toThrow(/insertCallout/);
  });
});
