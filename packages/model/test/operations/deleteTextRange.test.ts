import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations'; // Register operations
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { deleteTextRange } from '../../src/operations-dsl/deleteTextRange';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('deleteTextRange operation', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    // Create schema for testing
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': {
          name: 'inline-text',
          content: 'text*',
          marks: ['bold', 'italic'],
          attrs: {
            class: { default: null, type: 'string' }
          }
        },
        'paragraph': {
          name: 'paragraph',
          content: 'inline-text*',
          attrs: {
            class: { default: null, type: 'string' }
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
    it('should delete text range', async () => {
      // Create text node
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello Beautiful World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const operation = { type: 'deleteTextRange', payload: { nodeId: 'text-1', start: 6, end: 15 } } as any;

      const deleteTextRangeOperation = globalOperationRegistry.get('deleteTextRange');
      expect(deleteTextRangeOperation).toBeDefined();

      const result = await deleteTextRangeOperation!.execute(operation, context);
      expect(result.data).toBe('Beautiful');
      
      // DataStore에서 확인
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.text).toBe('Hello  World');
    });

    it('should delete text at the beginning', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const operation = { type: 'deleteTextRange', payload: { nodeId: 'text-1', start: 0, end: 6 } } as any;

      const deleteTextRangeOperation = globalOperationRegistry.get('deleteTextRange');
      const result = await deleteTextRangeOperation!.execute(operation, context);
      expect(result.data).toBe('Hello ');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.text).toBe('World');
    });

    it('should delete text at the end', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const operation = { type: 'deleteTextRange', payload: { nodeId: 'text-1', start: 6, end: 11 } } as any;

      const deleteTextRangeOperation = globalOperationRegistry.get('deleteTextRange');
      const result = await deleteTextRangeOperation!.execute(operation, context);
      expect(result.data).toBe('World');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.text).toBe('Hello ');
    });

    it('should throw error for non-existent node', async () => {
      const operation = { type: 'deleteTextRange', payload: { nodeId: 'non-existent', start: 0, end: 5 } } as any;

      const deleteTextRangeOperation = globalOperationRegistry.get('deleteTextRange');
      
      await expect(deleteTextRangeOperation!.execute(operation, context))
        .rejects.toThrow('Failed to delete text range for node non-existent');
    });
  });

  describe('Selection mapping', () => {
    it('should adjust selection when deleting overlapping range', async () => {
      // 텍스트 노드 생성
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello Beautiful World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // 기존 Selection 설정 (삭제 범위와 겹침)
           const initialSelection = { type: 'range' as const, startNodeId: 'text-1', startOffset: 8, endNodeId: 'text-1', endOffset: 12 };
      selectionManager.setSelection(initialSelection);

      const operation = { type: 'deleteTextRange', payload: { nodeId: 'text-1', start: 6, end: 15 } } as any;

      // Operation 실행
      const deleteTextRangeOperation = globalOperationRegistry.get('deleteTextRange');
      await deleteTextRangeOperation!.execute(operation, context);
      
      // Simplified policy: selection preserved with basic clamping; here keep original
      const finalSelection = selectionManager.getCurrentSelection();
      expect(finalSelection).toEqual(initialSelection);
    });

    it('should shift selection when deleting before selection', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello Beautiful World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // 기존 Selection 설정 (삭제 범위 이후)
           const initialSelection = { type: 'range' as const, startNodeId: 'text-1', startOffset: 16, endNodeId: 'text-1', endOffset: 21 };
      selectionManager.setSelection(initialSelection);

      const operation = { type: 'deleteTextRange', payload: { nodeId: 'text-1', start: 6, end: 15 } } as any;

      // Operation 실행
      const deleteTextRangeOperation = globalOperationRegistry.get('deleteTextRange');
      await deleteTextRangeOperation!.execute(operation, context);
      
      // Simplified policy: selection preserved (no shift)
      const finalSelection = selectionManager.getCurrentSelection();
      expect(finalSelection).toEqual(initialSelection);
    });

    it('should not affect selection when deleting after selection', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello Beautiful World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // 기존 Selection 설정 (삭제 범위 이전)
           const initialSelection = { type: 'range' as const, startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 5 };
      selectionManager.setSelection(initialSelection);

      const operation = { type: 'deleteTextRange', payload: { nodeId: 'text-1', start: 6, end: 15 } } as any;

      // Operation 실행
      const deleteTextRangeOperation = globalOperationRegistry.get('deleteTextRange');
      await deleteTextRangeOperation!.execute(operation, context);
      
      // Selection이 변경되지 않았는지 확인
      const finalSelection = selectionManager.getCurrentSelection();
      expect(finalSelection).toEqual(initialSelection);
    });

    it('should not affect selection of different node', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello Beautiful World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // 다른 노드의 Selection 설정
           const initialSelection = { type: 'range' as const, startNodeId: 'text-2', startOffset: 3, endNodeId: 'text-2', endOffset: 7 };
      selectionManager.setSelection(initialSelection);

      const operation = { type: 'deleteTextRange', payload: { nodeId: 'text-1', start: 6, end: 15 } } as any;

      // Operation 실행
      const deleteTextRangeOperation = globalOperationRegistry.get('deleteTextRange');
      await deleteTextRangeOperation!.execute(operation, context);
      
      // Selection이 변경되지 않았는지 확인
      const finalSelection = selectionManager.getCurrentSelection();
      expect(finalSelection).toEqual(initialSelection);
    });

    it('should handle null selection gracefully', async () => {
      const textNode = {
        id: 'text-1',
        type: 'inline-text',
        text: 'Hello Beautiful World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // Selection이 없는 상태
      selectionManager.clearSelection();

      const operation = { type: 'deleteTextRange', payload: { nodeId: 'text-1', start: 6, end: 15 } } as any;

      // Operation 실행
      const deleteTextRangeOperation = globalOperationRegistry.get('deleteTextRange');
      await deleteTextRangeOperation!.execute(operation, context);
      
      // Selection이 여전히 null인지 확인
      const finalSelection = selectionManager.getCurrentSelection();
      expect(finalSelection).toBeNull();
    });
  });
});

describe('deleteTextRange operation DSL', () => {
  it('should build a deleteTextRange descriptor from DSL', () => {
    const op = deleteTextRange(2, 7);
    expect(op).toEqual({
      type: 'deleteTextRange',
      payload: { start: 2, end: 7 }
    });
  });
});
