import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { insertMathBlock as insertMathBlockDsl } from '../../src/operations/insertMathBlock';
import type { INode } from '@barocss/datastore';

describe('insertMathBlock operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        mathBlock: { name: 'mathBlock', group: 'block', atom: true, attrs: { tex: { type: 'string', required: true }, engine: { type: 'string', default: 'katex' } } },
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

  it('inserts mathBlock with tex and engine attributes', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertMathBlock');
    expect(op).toBeDefined();
    const result = await op!.execute(
      { type: 'insertMathBlock', payload: { tex: 'E=mc^2', engine: 'katex' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(2);

    const mathId = doc.content![1];
    const math = dataStore.getNode(mathId) as INode;
    expect(math.stype).toBe('mathBlock');
    expect(math.attributes?.tex).toBe('E=mc^2');
    expect(math.attributes?.engine).toBe('katex');
  });

  it('uses default katex engine when only tex is provided', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertMathBlock');
    const result = await op!.execute(
      { type: 'insertMathBlock', payload: { tex: 'x + y' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    const mathId = doc.content![1];
    const math = dataStore.getNode(mathId) as INode;
    expect(math.attributes?.tex).toBe('x + y');
    expect(math.attributes?.engine).toBe('katex');
  });

  it('DSL builds correct descriptor', () => {
    const d1 = insertMathBlockDsl();
    expect(d1.type).toBe('insertMathBlock');
    expect(d1.payload.tex).toBe('');

    const d2 = insertMathBlockDsl('\\sum_{i=0}^n', 'mathjax');
    expect(d2.payload.tex).toBe('\\sum_{i=0}^n');
    expect(d2.payload.engine).toBe('mathjax');
  });

  it('provides inverse operation for undo', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertMathBlock');
    const result = await op!.execute(
      { type: 'insertMathBlock', payload: { tex: 'x^2' } } as any,
      context
    );
    expect(result.inverse).toBeDefined();
    expect(result.inverse.type).toBe('delete');
  });

  it('throws when selection is missing', async () => {
    setupDoc();
    context.selection.current = null;
    const op = globalOperationRegistry.get('insertMathBlock');
    await expect(
      op!.execute({ type: 'insertMathBlock', payload: { tex: 'x' } } as any, context)
    ).rejects.toThrow(/insertMathBlock/);
  });
});
