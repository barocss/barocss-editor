import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

describe('wrapInBlockquote operation (exec)', () => {
  let dataStore: DataStore;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        blockQuote: { name: 'blockQuote', group: 'block', content: 'block+' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    context = createTransactionContext(dataStore, new SelectionManager({ dataStore }), schema);
  });

  function setSelection(nodeId: string, offset: number): void {
    context.selection.setCaret(nodeId, offset);
  }

  it('wraps paragraph in blockQuote', async () => {
    const doc: INode = { sid: 'doc-1', stype: 'document', content: ['p-1'] };
    const p1: INode = { sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' };
    const t1: INode = { sid: 'text-1', stype: 'inline-text', text: 'X', parentId: 'p-1' };
    dataStore.setNode(doc);
    dataStore.setNode(p1);
    dataStore.setNode(t1);
    setSelection('text-1', 0);

    const op = globalOperationRegistry.get('wrapInBlockquote');
    expect(op).toBeDefined();
    const result = await op!.execute({ type: 'wrapInBlockquote', payload: {} } as any, context);
    expect(result.ok).toBe(true);
    const docAfter = dataStore.getNode('doc-1') as INode;
    expect(docAfter.content!.length).toBe(1);
    const bqId = docAfter.content![0];
    const bq = dataStore.getNode(bqId) as INode;
    expect(bq.stype).toBe('blockQuote');
    expect(bq.content!.length).toBe(1);
    expect(bq.content![0]).toBe('p-1');
  });

  it('unwraps when already inside blockQuote', async () => {
    const doc: INode = { sid: 'doc-1', stype: 'document', content: ['bq-1'] };
    const bq: INode = { sid: 'bq-1', stype: 'blockQuote', content: ['p-1'], parentId: 'doc-1' };
    const p1: INode = { sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'bq-1' };
    const t1: INode = { sid: 'text-1', stype: 'inline-text', text: 'Y', parentId: 'p-1' };
    dataStore.setNode(doc);
    dataStore.setNode(bq);
    dataStore.setNode(p1);
    dataStore.setNode(t1);
    setSelection('text-1', 0);

    const op = globalOperationRegistry.get('wrapInBlockquote');
    const result = await op!.execute({ type: 'wrapInBlockquote', payload: {} } as any, context);
    expect(result.ok).toBe(true);
    const docAfter = dataStore.getNode('doc-1') as INode;
    expect(docAfter.content!.length).toBe(1);
    expect(docAfter.content![0]).toBe('p-1');
  });
});
