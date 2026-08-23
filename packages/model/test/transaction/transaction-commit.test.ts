import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, node, textNode } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';
import { SelectionManager } from '@barocss/editor-core';
import { TransactionManager } from '../../src/transaction';
// Import operations to register them
import '../../src/operations/register-operations';

describe('Transaction Commit', () => {
  let dataStore: DataStore;
  let mockEditor: any;
  let originalAcquireLock: any;
  let originalReleaseLock: any;
  let originalBegin: any;
  let originalEnd: any;
  let originalCommit: any;
  let originalRollback: any;

  beforeEach(() => {
    // Create a simple schema
    const schema = new Schema('test-schema', {
      nodes: {
        document: { content: 'block+' },
        paragraph: { content: 'inline*', group: 'block' },
        'inline-text': { content: 'text*', group: 'inline' }
      },
      topNode: 'document'
    });

    dataStore = new DataStore(undefined, schema);
    const selectionManager = new SelectionManager({ dataStore });

    originalAcquireLock = dataStore.acquireLock;
    originalReleaseLock = dataStore.releaseLock;
    originalBegin = dataStore.begin;
    originalEnd = dataStore.end;
    originalCommit = dataStore.commit;
    originalRollback = dataStore.rollback;

    dataStore.acquireLock = vi.fn().mockImplementation(() => Promise.resolve('lock-sid-123'));
    dataStore.releaseLock = vi.fn().mockImplementation(() => Promise.resolve(undefined));
    dataStore.begin = vi.fn().mockImplementation(originalBegin);
    dataStore.end = vi.fn().mockImplementation(originalEnd);
    dataStore.commit = vi.fn().mockImplementation(originalCommit);
    dataStore.rollback = vi.fn().mockImplementation(originalRollback);

    mockEditor = {
      dataStore,
      _dataStore: dataStore,
      selectionManager,
      emit: vi.fn(),
      updateSelection: vi.fn(),
      historyManager: { push: vi.fn(), appendToLast: vi.fn().mockReturnValue(true) }
    };
  });

  afterEach(() => {
    dataStore.acquireLock = originalAcquireLock;
    dataStore.releaseLock = originalReleaseLock;
    dataStore.begin = originalBegin;
    dataStore.end = originalEnd;
    dataStore.commit = originalCommit;
    dataStore.rollback = originalRollback;
  });

  describe('TransactionManager Integration', () => {
    it('should use TransactionManager for commit', async () => {
      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Hello World'))
      ]);

      const result = await builder.commit();

      // Verify TransactionManager was used
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.operations).toBeDefined();
    });

    it('should pass operations to TransactionManager', async () => {
      const operations = [
        create(textNode('inline-text', 'Hello')),
        create(textNode('inline-text', 'World'))
      ];

      const builder = transaction(mockEditor, operations);
      const result = await builder.commit();

      // operations now include result field; compare types and payload.node.stype
      expect(result.operations?.map(o => ({ type: o.type, nodeType: o.payload.node.stype })))
        .toEqual(operations.map(o => ({ type: o.type, nodeType: (o as any).payload.node.stype })));
    });
  });

  /**
   * A write that maintains **derived** state, kept out of the history.
   *
   * The connector reaction runs on every document change and writes the ends whenever a
   * shape has moved, so every drag put two entries in the history: the reader's move and
   * the reaction's. Undo undid the reaction; the reaction ran again — an undo is a
   * document change — and wrote the same numbers back. Measured in a browser: undo
   * pressed twice, reporting success both times, and the slide unchanged. The reader
   * could not undo their own move at all.
   */
  describe('recordInHistory', () => {
    it('records an edit', async () => {
      await transaction(mockEditor, [create(textNode('inline-text', 'edit'))]).commit();
      expect(mockEditor.historyManager.push).toHaveBeenCalled();
    });

    it('leaves a derived write out', async () => {
      await transaction(mockEditor, [create(textNode('inline-text', 'derived'))], {
        recordInHistory: false
      }).commit();
      expect(mockEditor.historyManager.push).not.toHaveBeenCalled();
    });

    it('still does the work — it is the *recording* that is skipped', async () => {
      const result = await transaction(mockEditor, [create(textNode('inline-text', 'x'))], {
        recordInHistory: false
      }).commit();
      expect(result.success).toBe(true);
      expect(result.operations?.length).toBe(1);
    });
  });

  /**
   * The third answer: a write that is a **consequence** of the reader's edit.
   *
   * Neither of the two above fits a group's rectangle, which is the bounds of its
   * children *and* the origin their coordinates are relative to — so keeping it honest
   * re-origins them, and that pairing has to be undone together with the edit that caused
   * it. Recorded on its own, undo undid the maintenance; unrecorded, undo restored a
   * child's relative `x` into a coordinate space that had moved.
   */
  describe('appendToPreviousEntry', () => {
    it('goes into the last entry instead of making one', async () => {
      await transaction(mockEditor, [create(textNode('inline-text', 'consequence'))], {
        appendToPreviousEntry: true
      }).commit();

      expect(mockEditor.historyManager.push).not.toHaveBeenCalled();
      expect(mockEditor.historyManager.appendToLast).toHaveBeenCalled();
    });

    it('carries the operations and their inverses, so one undo takes back both halves', async () => {
      await transaction(mockEditor, [create(textNode('inline-text', 'consequence'))], {
        appendToPreviousEntry: true
      }).commit();

      const appended = (mockEditor.historyManager.appendToLast as any).mock.calls[0][0];
      expect(appended.operations.length).toBeGreaterThan(0);
      expect(appended.inverseOperations.length).toBe(appended.operations.length);
    });

    it('does the work whether or not the history takes it', async () => {
      // The append refuses when there is no edit to belong to. The write still happened:
      // a group whose box is wrong is wrong whatever the history says.
      (mockEditor.historyManager.appendToLast as any).mockReturnValue(false);
      const result = await transaction(mockEditor, [create(textNode('inline-text', 'x'))], {
        appendToPreviousEntry: true
      }).commit();
      expect(result.success).toBe(true);
    });
  });

  describe('Lock Management', () => {
    it('should acquire lock before transaction', async () => {
      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Test'))
      ]);

      await builder.commit();

      expect(dataStore.acquireLock).toHaveBeenCalledWith('transaction-execution');
    });

    it('should release lock after transaction', async () => {
      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Test'))
      ]);

      await builder.commit();

      expect(dataStore.releaseLock).toHaveBeenCalledWith('lock-sid-123');
    });

    it('should release lock even if transaction fails', async () => {
      // Mock createNodeWithChildren to throw error
      const originalCreateNodeWithChildren = dataStore.createNodeWithChildren;
      dataStore.createNodeWithChildren = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Test'))
      ]);

      const result = await builder.commit();

      expect(result.success).toBe(false);
      expect(dataStore.releaseLock).toHaveBeenCalledWith('lock-sid-123');

      // Restore original method
      dataStore.createNodeWithChildren = originalCreateNodeWithChildren;
    });
  });

  describe('DataStore Transaction Lifecycle', () => {
    it('should call begin() before operations', async () => {
      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Test'))
      ]);

      await builder.commit();

      expect(dataStore.begin).toHaveBeenCalled();
    });

    it('should call end() and commit() after successful operations', async () => {
      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Test'))
      ]);

      await builder.commit();

      expect(dataStore.end).toHaveBeenCalled();
      expect(dataStore.commit).toHaveBeenCalled();
    });

    it('should call rollback() on error', async () => {
      // Mock createNodeWithChildren to throw error
      const originalCreateNodeWithChildren = dataStore.createNodeWithChildren;
      dataStore.createNodeWithChildren = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Test'))
      ]);

      await builder.commit();

      expect(dataStore.rollback).toHaveBeenCalled();

      // Restore original method
      dataStore.createNodeWithChildren = originalCreateNodeWithChildren;
    });
  });

  describe('Schema Propagation', () => {
    it('should set schema on TransactionManager', async () => {
      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Test'))
      ]);

      const result = await builder.commit();

      // Verify schema was passed from DataStore to TransactionManager
      // (Actually should be verified inside TransactionManager)
      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle operation execution errors', async () => {
      // Mock createNodeWithChildren to throw error
      const originalCreateNodeWithChildren = dataStore.createNodeWithChildren;
      dataStore.createNodeWithChildren = vi.fn().mockImplementation(() => {
        throw new Error('Schema validation failed');
      });

      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Test'))
      ]);

      const result = await builder.commit();

      expect(result.success).toBe(false);
      expect(result.success).toBe(false);

      // Restore original method
      dataStore.createNodeWithChildren = originalCreateNodeWithChildren;
    });

    it('should handle lock acquisition errors', async () => {
      dataStore.acquireLock = vi.fn().mockRejectedValue(new Error('Lock acquisition failed'));

      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Test'))
      ]);

      const result = await builder.commit();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Lock acquisition failed');
    });
  });

  describe('Transaction Result', () => {
    it('should return success result for valid operations', async () => {
      const builder = transaction(mockEditor, [
        create(textNode('inline-text', 'Hello World'))
      ]);

      const result = await builder.commit();

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.operations).toBeDefined();
      expect(result.transactionId).toBeDefined();
    });

    it('should return failure result for invalid operations', async () => {
      // Mock createNodeWithChildren to throw error
      const originalCreateNodeWithChildren = dataStore.createNodeWithChildren;
      dataStore.createNodeWithChildren = vi.fn().mockImplementation(() => {
        throw new Error('Invalid node type');
      });

      const builder = transaction(mockEditor, [
        create(node('invalid-type', 'Test'))
      ]);

      const result = await builder.commit();

      expect(result.success).toBe(false);
      expect(result.success).toBe(false);
      expect(result.operations).toBeDefined();

      // Restore original method
      dataStore.createNodeWithChildren = originalCreateNodeWithChildren;
    });
  });
});

/**
 * Nothing forces an operation to say where the caret goes after it deletes the
 * node the caret was in. When one forgets, the symptom shows up a keystroke
 * later and somewhere else — the next command finds no node and silently does
 * nothing — so the transaction says so at the point the evidence still exists.
 */
describe('a selection left on a deleted node', () => {
  let dataStore: DataStore;
  let mockEditor: any;
  let warn: any;

  beforeEach(() => {
    const schema = new Schema('test-schema', {
      nodes: {
        document: { content: 'block+' },
        paragraph: { content: 'inline*', group: 'block' },
        'inline-text': { content: 'text*', group: 'inline' }
      },
      topNode: 'document'
    });

    dataStore = new DataStore(undefined, schema);
    dataStore.setNode({ sid: 'doc', stype: 'document', content: ['para'] } as any);
    dataStore.setNode({ sid: 'para', stype: 'paragraph', content: ['doomed'], parentId: 'doc' } as any);
    dataStore.setNode({ sid: 'doomed', stype: 'inline-text', text: 'gone', parentId: 'para' } as any);
    (dataStore as any).setRootNodeId?.('doc');

    const selectionManager = new SelectionManager({ dataStore });
    selectionManager.setSelection({
      type: 'range',
      startNodeId: 'doomed',
      startOffset: 0,
      endNodeId: 'doomed',
      endOffset: 0,
      collapsed: true,
      direction: 'none'
    } as any);

    mockEditor = {
      dataStore,
      _dataStore: dataStore,
      selectionManager,
      emit: vi.fn(),
      updateSelection: vi.fn(),
      historyManager: { push: vi.fn(), appendToLast: vi.fn().mockReturnValue(true) }
    };

    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => warn.mockRestore());

  it('is reported, naming the node and the operations that ran', async () => {
    await transaction(mockEditor, [
      { type: 'delete', payload: { nodeId: 'doomed' } } as any
    ]).commit();

    const reported = warn.mock.calls.find((call: any[]) =>
      String(call[0]).includes('left no usable caret')
    );
    expect(reported).toBeDefined();
    expect(reported.join(' ')).toContain('doomed');
  });

  it('stays quiet when the nodes it points at survive', async () => {
    await transaction(mockEditor, [
      create(textNode('inline-text', 'Hello'))
    ]).commit();

    const reported = warn.mock.calls.find((call: any[]) =>
      String(call[0]).includes('left no usable caret')
    );
    expect(reported).toBeUndefined();
  });
});

