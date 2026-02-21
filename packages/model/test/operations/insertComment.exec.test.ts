import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { insertComment as insertCommentDsl } from '../../src/operations/insertComment';
import type { INode } from '@barocss/datastore';

describe('insertComment operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        commentThread: { name: 'commentThread', group: 'block', content: 'inline*', attrs: { id: { type: 'string', required: true } } },
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

  it('inserts commentThread with given threadId', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertComment');
    expect(op).toBeDefined();
    const result = await op!.execute(
      { type: 'insertComment', payload: { threadId: 'thread-abc' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1') as INode;
    expect(doc.content!.length).toBe(2);

    const commentId = doc.content![1];
    const comment = dataStore.getNode(commentId) as INode;
    expect(comment.stype).toBe('commentThread');
    expect(comment.attributes?.id).toBe('thread-abc');
    expect(comment.content).toHaveLength(1);
  });

  it('selectionAfter points to the inner text node', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertComment');
    const result = await op!.execute(
      { type: 'insertComment', payload: { threadId: 'thread-1' } } as any,
      context
    );
    expect(result.selectionAfter).toBeDefined();
    expect(result.selectionAfter.offset).toBe(0);

    const doc = dataStore.getNode('doc-1') as INode;
    const commentId = doc.content![1];
    const comment = dataStore.getNode(commentId) as INode;
    expect(result.selectionAfter.nodeId).toBe(comment.content![0]);
  });

  it('DSL builds correct descriptor', () => {
    const d = insertCommentDsl('my-thread');
    expect(d).toEqual({ type: 'insertComment', payload: { threadId: 'my-thread' } });
  });

  it('provides inverse operation for undo', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertComment');
    const result = await op!.execute(
      { type: 'insertComment', payload: { threadId: 'thread-x' } } as any,
      context
    );
    expect(result.inverse).toBeDefined();
    expect(result.inverse.type).toBe('delete');
  });

  it('throws when threadId is missing', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertComment');
    await expect(
      op!.execute({ type: 'insertComment', payload: {} } as any, context)
    ).rejects.toThrow(/threadId/);
  });

  it('throws when selection is missing', async () => {
    setupDoc();
    context.selection.current = null;
    const op = globalOperationRegistry.get('insertComment');
    await expect(
      op!.execute({ type: 'insertComment', payload: { threadId: 'thread-1' } } as any, context)
    ).rejects.toThrow(/insertComment/);
  });
});
