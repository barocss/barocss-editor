import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations'; // Register operations
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('delete operation', () => {
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
        },
        'document': {
          name: 'document',
          content: 'paragraph*',
          attrs: {}
        }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style' },
        italic: { name: 'italic', group: 'text-style' }
      }
    });
    
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('should delete a node', async () => {
    // 테스트용 노드 생성
    const node = {
      id: 'test-node',
      type: 'inline-text',
      text: 'Hello World',
      attributes: { class: null }
    };
    dataStore.setNode(node);

    const deleteOperation = globalOperationRegistry.get('delete');
    expect(deleteOperation).toBeDefined();

    await deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'test-node' }
    } as any, context);

    const deletedNode = dataStore.getNode('test-node');
    expect(deletedNode).toBeUndefined();
  });

  it('should delete child nodes recursively', async () => {
    // 부모 노드 생성
    const parentNode = {
      id: 'parent-node',
      type: 'paragraph',
      content: ['child-1', 'child-2'],
      attributes: {}
    };
    dataStore.setNode(parentNode);

    // 자식 노드들 생성
    const child1 = {
      id: 'child-1',
      type: 'inline-text',
      text: 'Child 1',
      parentId: 'parent-node'
    };
    const child2 = {
      id: 'child-2',
      type: 'inline-text',
      text: 'Child 2',
      parentId: 'parent-node'
    };
    dataStore.setNode(child1);
    dataStore.setNode(child2);

    const deleteOperation = globalOperationRegistry.get('delete');
    await deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'parent-node' }
    } as any, context);

    // 부모와 자식 노드들이 모두 삭제되었는지 확인
    expect(dataStore.getNode('parent-node')).toBeUndefined();
    expect(dataStore.getNode('child-1')).toBeUndefined();
    expect(dataStore.getNode('child-2')).toBeUndefined();
  });

  it('should remove node from parent content array', async () => {
    // 부모 노드 생성
    const parentNode = {
      id: 'parent-node',
      type: 'paragraph',
      content: ['child-1', 'child-2'],
      attributes: {}
    };
    dataStore.setNode(parentNode);

    // 자식 노드 생성
    const childNode = {
      id: 'child-1',
      type: 'inline-text',
      text: 'Child 1',
      parentId: 'parent-node'
    };
    dataStore.setNode(childNode);

    const deleteOperation = globalOperationRegistry.get('delete');
    await deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'child-1' }
    } as any, context);

    const parent = dataStore.getNode('parent-node');
    expect(parent!.content).not.toContain('child-1');
    expect(parent!.content).toContain('child-2');
  });

  it('should throw error when trying to delete root node (root is immutable)', async () => {
    // 루트 노드 생성
    const rootNode = {
      id: 'root-node',
      type: 'inline-text',
      text: 'Root content'
    };
    dataStore.setNode(rootNode);
    dataStore.setRoot('root-node');

    // 다른 노드 생성
    const otherNode = {
      id: 'other-node',
      type: 'inline-text',
      text: 'Other content'
    };
    dataStore.setNode(otherNode);

    const deleteOperation = globalOperationRegistry.get('delete');
    await expect(deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'root-node' }
    } as any, context)).rejects.toThrow('Cannot delete root node');
    // 루트 유지 확인
    expect(dataStore.getRootNodeId()).toBe('root-node');
  });

  it('should not clear root node; deleting root is forbidden', async () => {
    // 루트 노드 생성
    const rootNode = {
      id: 'root-node',
      type: 'inline-text',
      text: 'Root content'
    };
    dataStore.setNode(rootNode);
    dataStore.setRoot('root-node');

    const deleteOperation = globalOperationRegistry.get('delete');
    await expect(deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'root-node' }
    } as any, context)).rejects.toThrow('Cannot delete root node');
    expect(dataStore.getRootNodeId()).toBe('root-node');
  });

  it('should throw error if node not found', async () => {
    const deleteOperation = globalOperationRegistry.get('delete');
    
    await expect(deleteOperation!.execute({
      type: 'delete',
      payload: { nodeId: 'non-existent-node' }
    } as any, context)).rejects.toThrow('Node with id \'non-existent-node\' not found');
  });

         describe('Selection mapping', () => {
           it('should clear selection when deleting selected node', async () => {
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
              type: 'delete',
              payload: { nodeId: 'text-1' }
            } as any;

             // Operation 실행
             const deleteOperation = globalOperationRegistry.get('delete');
             await deleteOperation!.execute(operation, context);
             
             // Selection이 클리어되었는지 확인
             const finalSelection = selectionManager.getCurrentSelection();
             expect(finalSelection).toBeNull();
           });

           it('should preserve selection when deleting different node', async () => {
             // 두 개의 텍스트 노드 생성
             const textNode1 = {
               id: 'text-1',
               type: 'inline-text',
               text: 'Hello World',
               parentId: 'para-1'
             };
             const textNode2 = {
               id: 'text-2',
               type: 'inline-text',
               text: 'Goodbye World',
               parentId: 'para-1'
             };
             dataStore.setNode(textNode1);
             dataStore.setNode(textNode2);

             // text-2의 Selection 설정
             const initialSelection = { type: 'range' as const, startNodeId: 'text-2', startOffset: 3, endNodeId: 'text-2', endOffset: 7 };
             selectionManager.setSelection(initialSelection);

            const operation = {
              type: 'delete',
              payload: { nodeId: 'text-1' } // 다른 노드 삭제
            } as any;

             // Operation 실행
             const deleteOperation = globalOperationRegistry.get('delete');
             await deleteOperation!.execute(operation, context);
             
             // Selection이 유지되었는지 확인
             const finalSelection = selectionManager.getCurrentSelection();
             expect(finalSelection).toEqual(initialSelection);
           });

           it('should handle null selection gracefully', async () => {
             // 텍스트 노드 생성
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
              type: 'delete',
              payload: { nodeId: 'text-1' }
            } as any;

             // Operation 실행
             const deleteOperation = globalOperationRegistry.get('delete');
             await deleteOperation!.execute(operation, context);
             
             // Selection이 여전히 null인지 확인
             const finalSelection = selectionManager.getCurrentSelection();
             expect(finalSelection).toBeNull();
           });
         });
});
