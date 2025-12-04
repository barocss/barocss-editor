import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, node } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';
import { SelectionManager } from '@barocss/editor-core';
// Import operations to register them
import '../../src/operations/register-operations';

describe('Transaction Initialization', () => {
  let dataStore: DataStore;
  let mockEditor: any;

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

    mockEditor = {
      dataStore,
      _dataStore: dataStore,
      selectionManager
    };
  });

  describe('TransactionBuilder Creation', () => {
    it('should create TransactionBuilder with single operation', () => {
      const builder = transaction(mockEditor, [
        create(node('inline-text', 'Hello World'))
      ]);

      // TransactionBuilder 인터페이스 확인
      expect(builder).toBeDefined();
      expect(typeof builder.commit).toBe('function');
    });

    it('should create TransactionBuilder with multiple operations', () => {
      const builder = transaction(mockEditor, [
        create(node('paragraph', [
          node('inline-text', 'Hello')
        ])),
        create(node('paragraph', [
          node('inline-text', 'World')
        ]))
      ]);

      expect(builder).toBeDefined();
      expect(typeof builder.commit).toBe('function');
    });

    it('should create TransactionBuilder with nested operations array', () => {
      const builder = transaction(mockEditor, [
        [
          create(node('inline-text', 'Hello')),
          create(node('inline-text', 'World'))
        ]
      ]);

      expect(builder).toBeDefined();
      expect(typeof builder.commit).toBe('function');
    });

    it('should create TransactionBuilder with empty operations', () => {
      const builder = transaction(mockEditor, []);

      expect(builder).toBeDefined();
      expect(typeof builder.commit).toBe('function');
    });

    it('should handle mixed operation types', () => {
      const builder = transaction(mockEditor, [
        create(node('inline-text', 'Hello')),
        { type: 'setText', payload: { nodeId: 'test', text: 'World' } },
        { type: 'setAttrs', payload: { nodeId: 'test', attrs: { class: 'test' } } }
      ]);

      expect(builder).toBeDefined();
      expect(typeof builder.commit).toBe('function');
    });
  });

  describe('TransactionBuilder Interface', () => {
    it('should have commit method', () => {
      const builder = transaction(mockEditor, [
        create(node('inline-text', 'Test'))
      ]);

      expect(builder.commit).toBeDefined();
      expect(typeof builder.commit).toBe('function');
    });

    it('should return Promise from commit method', () => {
      const builder = transaction(mockEditor, [
        create(node('inline-text', 'Test'))
      ]);

      const result = builder.commit();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('Operation Flattening', () => {
    it('should flatten nested operation arrays', () => {
      const builder = transaction(mockEditor, [
        create(node('inline-text', 'Hello')),
        [
          create(node('inline-text', 'World')),
          create(node('inline-text', 'Test'))
        ]
      ]);

      expect(builder).toBeDefined();
      expect(typeof builder.commit).toBe('function');
    });

    it('should handle deeply nested operation arrays', () => {
      const builder = transaction(mockEditor, [
        [
          [
            create(node('inline-text', 'Deep'))
          ]
        ]
      ]);

      expect(builder).toBeDefined();
      expect(typeof builder.commit).toBe('function');
    });
  });
});
