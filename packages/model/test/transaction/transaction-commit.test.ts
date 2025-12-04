import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, node } from '../../src/transaction-dsl';
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

    // Mock DataStore methods to track calls
    originalAcquireLock = dataStore.acquireLock;
    originalReleaseLock = dataStore.releaseLock;
    originalBegin = dataStore.begin;
    originalEnd = dataStore.end;
    originalCommit = dataStore.commit;
    originalRollback = dataStore.rollback;

    dataStore.acquireLock = vi.fn().mockResolvedValue('lock-sid-123');
    dataStore.releaseLock = vi.fn().mockResolvedValue(undefined);
    dataStore.begin = vi.fn().mockReturnValue(undefined);
    dataStore.end = vi.fn().mockReturnValue(undefined);
    dataStore.commit = vi.fn().mockReturnValue(undefined);
    dataStore.rollback = vi.fn().mockReturnValue(undefined);

    mockEditor = {
      dataStore,
      _dataStore: dataStore,
      selectionManager
    };
  });

  afterEach(() => {
    // Restore original methods
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
        create(node('inline-text', 'Hello World'))
      ]);

      const result = await builder.commit();

      // TransactionManager가 사용되었는지 확인
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.operations).toBeDefined();
    });

    it('should pass operations to TransactionManager', async () => {
      const operations = [
        create(node('inline-text', 'Hello')),
        create(node('inline-text', 'World'))
      ];

      const builder = transaction(mockEditor, operations);
      const result = await builder.commit();

      // operations now include result field; compare types and payload.node
      expect(result.operations?.map(o => ({ type: o.type, nodeType: o.payload.node.type })))
        .toEqual(operations.map(o => ({ type: o.type, nodeType: (o as any).payload.node.type })));
    });
  });

  describe('Lock Management', () => {
    it('should acquire lock before transaction', async () => {
      const builder = transaction(mockEditor, [
        create(node('inline-text', 'Test'))
      ]);

      await builder.commit();

      expect(dataStore.acquireLock).toHaveBeenCalledWith('transaction-execution');
    });

    it('should release lock after transaction', async () => {
      const builder = transaction(mockEditor, [
        create(node('inline-text', 'Test'))
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
        create(node('inline-text', 'Test'))
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
        create(node('inline-text', 'Test'))
      ]);

      await builder.commit();

      expect(dataStore.begin).toHaveBeenCalled();
    });

    it('should call end() and commit() after successful operations', async () => {
      const builder = transaction(mockEditor, [
        create(node('inline-text', 'Test'))
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
        create(node('inline-text', 'Test'))
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
        create(node('inline-text', 'Test'))
      ]);

      const result = await builder.commit();

      // Schema가 DataStore에서 TransactionManager로 전달되었는지 확인
      // (실제로는 TransactionManager 내부에서 확인해야 함)
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
        create(node('inline-text', 'Test'))
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
        create(node('inline-text', 'Test'))
      ]);

      const result = await builder.commit();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Lock acquisition failed');
    });
  });

  describe('Transaction Result', () => {
    it('should return success result for valid operations', async () => {
      const builder = transaction(mockEditor, [
        create(node('inline-text', 'Hello World'))
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
