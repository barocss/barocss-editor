import { describe, it, expect, beforeEach } from 'vitest';
import { insertText as insertTextDsl } from '../../src/operations-dsl/insertText';
import '../../src/operations/register-operations'; // Operations 등록
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('insertText operation', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    // 테스트용 schema 생성
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': {
          name: 'inline-text',
          content: 'text*',
          marks: ['bold', 'italic'],
          attrs: {
            class: { type: 'string', default: null }
          }
        },
        'paragraph': {
          name: 'paragraph',
          content: 'inline*',
          attrs: {
            class: { type: 'string', default: null }
          }
        }
      },
      marks: {
        'bold': { name: 'bold' },
        'italic': { name: 'italic' }
      }
    });

    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  describe('Basic functionality', () => {
    it('should insert text at specified position', async () => {
      // 텍스트 노드 생성
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const operation = {
        type: 'insertText',
        payload: {
          nodeId: 'text-1',
          pos: 5,
          text: ' Beautiful'
        }
      } as any;

      const insertTextOperation = globalOperationRegistry.get('insertText');
      expect(insertTextOperation).toBeDefined();

      const result = await insertTextOperation!.execute(operation, context);

      expect(result.data).toBe(' Beautiful');
      
      // DataStore에서 확인
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.text).toBe('Hello Beautiful World');
    });

    it('should insert text at the beginning', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const operation = {
        type: 'insertText',
        payload: { nodeId: 'text-1', pos: 0, text: 'Hello ' }
      } as any;

      const insertTextOperation = globalOperationRegistry.get('insertText');
      const result = await insertTextOperation!.execute(operation, context);

      expect(result.data).toBe('Hello ');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.text).toBe('Hello World');
    });

    it('should insert text at the end', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const operation = {
        type: 'insertText',
        payload: { nodeId: 'text-1', pos: 5, text: ' World' }
      } as any;

      const insertTextOperation = globalOperationRegistry.get('insertText');
      const result = await insertTextOperation!.execute(operation, context);

      expect(result.data).toBe(' World');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.text).toBe('Hello World');
    });

    it('should throw error for non-existent node', async () => {
      const operation = {
        type: 'insertText',
        payload: { nodeId: 'non-existent', pos: 0, text: 'Hello' }
      } as any;

      const insertTextOperation = globalOperationRegistry.get('insertText');
      
      await expect(insertTextOperation!.execute(operation, context))
        .rejects.toThrow('Failed to insert text into node non-existent');
    });
  });

  describe('Selection mapping', () => {
    it('should shift selection after insert', async () => {
      // 텍스트 노드 생성
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // 기존 Selection 설정
           const initialSelection = { type: 'range' as const, startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 10 };
      selectionManager.setSelection(initialSelection);

      const operation = {
        type: 'insertText',
        payload: { nodeId: 'text-1', pos: 3, text: ' Beautiful' }
      } as any;

      // Operation 실행
      const insertTextOperation = globalOperationRegistry.get('insertText');
      await insertTextOperation!.execute(operation, context);
      
      // Simplified policy: selection preserved (no auto shift)
      const finalSelection = selectionManager.getCurrentSelection();
      expect(finalSelection).toEqual(initialSelection);
    });

    it('should not shift selection if insert is after selection', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // 기존 Selection 설정
           const initialSelection = { type: 'range' as const, startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 10 };
      selectionManager.setSelection(initialSelection);

      const operation = {
        type: 'insertText',
        payload: { nodeId: 'text-1', pos: 11, text: ' Beautiful' }
      } as any;

      // Operation 실행
      const insertTextOperation = globalOperationRegistry.get('insertText');
      await insertTextOperation!.execute(operation, context);
      
      // Selection이 변경되지 않았는지 확인
      const finalSelection = selectionManager.getCurrentSelection();
      expect(finalSelection).toEqual(initialSelection);
    });

    it('should not affect selection of different node', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // 다른 노드의 Selection 설정
           const initialSelection = { type: 'range' as const, startNodeId: 'text-2', startOffset: 3, endNodeId: 'text-2', endOffset: 7 };
      selectionManager.setSelection(initialSelection);

      const operation = {
        type: 'insertText',
        payload: { nodeId: 'text-1', pos: 5, text: ' Beautiful' }
      } as any;

      // Operation 실행
      const insertTextOperation = globalOperationRegistry.get('insertText');
      await insertTextOperation!.execute(operation, context);
      
      // Selection이 변경되지 않았는지 확인
      const finalSelection = selectionManager.getCurrentSelection();
      expect(finalSelection).toEqual(initialSelection);
    });

    it('should handle null selection gracefully', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // Selection이 없는 상태
      selectionManager.clearSelection();

      const operation = {
        type: 'insertText',
        payload: { nodeId: 'text-1', pos: 5, text: ' Beautiful' }
      } as any;

      // Operation 실행
      const insertTextOperation = globalOperationRegistry.get('insertText');
      await insertTextOperation!.execute(operation, context);
      
      // Selection이 여전히 null인지 확인
      const finalSelection = selectionManager.getCurrentSelection();
      expect(finalSelection).toBeNull();
    });
  });

  describe('insertText operation DSL', () => {
    it('should insert text at specified position', () => {
      const operation = insertTextDsl(5, 'Beautiful');
      expect(operation).toEqual({
        type: 'insertText',
        payload: { pos: 5, text: 'Beautiful' }
      });
    });
  });
});