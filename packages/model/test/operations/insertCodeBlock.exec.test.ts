import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { insertCodeBlock as insertCodeBlockDsl } from '../../src/operations/insertCodeBlock';
import type { INode } from '@barocss/datastore';

describe('insertCodeBlock operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        codeBlock: { name: 'codeBlock', group: 'block', content: 'text*', attrs: { language: { type: 'string', required: false } } },
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

  it('inserts codeBlock with language attribute', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertCodeBlock');
    expect(op).toBeDefined();
    const result = await op!.execute(
      { type: 'insertCodeBlock', payload: { language: 'typescript' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(2);

    const codeBlockId = doc.content![1];
    const codeBlock = dataStore.getNode(codeBlockId) as INode;
    expect(codeBlock.stype).toBe('codeBlock');
    expect(codeBlock.attributes?.language).toBe('typescript');
    expect(codeBlock.content).toHaveLength(1);
  });

  it('defaults to empty language', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertCodeBlock');
    const result = await op!.execute(
      { type: 'insertCodeBlock', payload: {} } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    const codeBlockId = doc.content![1];
    const codeBlock = dataStore.getNode(codeBlockId) as INode;
    expect(codeBlock.attributes?.language).toBe('');
  });

  it('DSL builds correct descriptor', () => {
    const d1 = insertCodeBlockDsl();
    expect(d1.type).toBe('insertCodeBlock');

    const d2 = insertCodeBlockDsl('python');
    expect(d2.payload.language).toBe('python');
  });

  it('provides inverse operation for undo', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertCodeBlock');
    const result = await op!.execute(
      { type: 'insertCodeBlock', payload: { language: 'js' } } as any,
      context
    );
    expect(result.inverse).toBeDefined();
    expect(result.inverse.type).toBe('delete');
  });

  it('throws when selection is missing', async () => {
    setupDoc();
    context.selection.current = null;
    const op = globalOperationRegistry.get('insertCodeBlock');
    await expect(
      op!.execute({ type: 'insertCodeBlock', payload: {} } as any, context)
    ).rejects.toThrow(/insertCodeBlock/);
  });
});
