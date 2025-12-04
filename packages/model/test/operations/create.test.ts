import { describe, it, expect, beforeEach } from 'vitest';
import { create as createDSL } from '../../src/operations-dsl/create';
import '../../src/operations/register-operations'; // Operations 등록
import { DataStore, INode } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('create operation', () => {
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
          attrs: {
            class: { default: null, type: 'string' }
          }
        }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style' },
        italic: { name: 'italic', group: 'text-style' }
      }
    });
    
    // DataStore 생성 (schema는 생성자에서 전달)
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('should create a new node', async () => {
    const node = {
      id: 'test-node-1',
      type: 'inline-text',
      text: 'Hello World'
    };

    const createOperation = globalOperationRegistry.get('create');
    expect(createOperation).toBeDefined();

    await createOperation!.execute({ type: 'create', payload: { node } } as any, context);

    const createdNode = dataStore.getNode('test-node-1');
    expect(createdNode).toBeDefined();
    expect(createdNode!.sid).toBe('test-node-1');
    expect(createdNode!.type).toBe('inline-text');
    expect(createdNode!.text).toBe('Hello World');
  });

  it('should generate ID if not provided', async () => {
    const node = {
      type: 'inline-text',
      text: 'Hello World'
    };

    const createOperation = globalOperationRegistry.get('create');
    await createOperation!.execute({ type: 'create', payload: { node } } as any, context);

    const allNodes = dataStore.getAllNodes();
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].sid).toBeDefined();
    expect(allNodes[0].sid).not.toBe('');
  });


  it('should set root node if first node', async () => {
    const node = {
      id: 'root-node',
      type: 'inline-text',
      text: 'Hello World'
    };

    const createOperation = globalOperationRegistry.get('create');
    await createOperation!.execute({ type: 'create', payload: { node } } as any, context);

    expect(dataStore.getRootNode()?.sid).toBe('root-node');
  });

  it('should create nested structure with parent-child relationship', async () => {
    // 중첩된 구조를 한 번에 생성
    const nestedNode = {
      type: 'paragraph',
      content: [
        {
          type: 'inline-text',
          text: 'Hello World'
        }
      ]
    };

    const createOperation = globalOperationRegistry.get('create');
    const result = await createOperation!.execute({ type: 'create', payload: { node: nestedNode } } as any, context);

    expect(result.ok).toBe(true);
    expect(result.data.type).toBe('paragraph');
    expect(result.data.content).toHaveLength(1);
    
    // 자식 노드 확인
    const childId = result.data.content[0];
    const childNode = dataStore.getNode(childId);
    expect(childNode?.type).toBe('inline-text');
    expect(childNode?.text).toBe('Hello World');
    expect(childNode?.parentId).toBe(result.data.sid);
  });

  it('should create nested nodes with auto-generated IDs', async () => {
    // 중첩된 노드 구조 생성
    const nestedNode = {
      type: 'paragraph',
      content: [
        {
          type: 'inline-text',
          text: 'Hello'
        },
        {
          type: 'inline-text', 
          text: 'World'
        }
      ],
      attributes: {}
    };

    const createOperation = globalOperationRegistry.get('create');
    const result = await createOperation!.execute({ type: 'create', payload: { node: nestedNode } } as any, context);

    // 루트 노드가 생성되었는지 확인
    expect(result.data?.sid).toBeDefined();
    expect(result.data?.type).toBe('paragraph');
    expect(result.data?.content).toHaveLength(2);

    // 자식 노드들이 생성되었는지 확인
    const child1 = dataStore.getNode(result.data!.content![0]);
    const child2 = dataStore.getNode(result.data!.content![1]);
    
    expect(child1).toBeDefined();
    expect(child1!.type).toBe('inline-text');
    expect(child1!.text).toBe('Hello');
    expect(child1!.parentId).toBe(result.data!.sid);

    expect(child2).toBeDefined();
    expect(child2!.type).toBe('inline-text');
    expect(child2!.text).toBe('World');
    expect(child2!.parentId).toBe(result.data!.sid);
  });

  it('should handle deeply nested structures', async () => {
    // 깊게 중첩된 노드 구조 생성
    const deeplyNestedNode = {
      type: 'document',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inline-text',
              text: 'Level 1'
            }
          ]
        },
        {
          type: 'paragraph', 
          content: [
            {
              type: 'inline-text',
              text: 'Level 2'
            }
          ]
        }
      ]
    };

    const createOperation = globalOperationRegistry.get('create');
    const result = await createOperation!.execute({ type: 'create', payload: { node: deeplyNestedNode } } as any, context);

    // 루트 노드 확인
    expect(result.data?.sid).toBeDefined();
    expect(result.data?.content).toHaveLength(2);

    // 첫 번째 paragraph 확인
    const paragraph1 = dataStore.getNode(result.data!.content![0]);
    expect(paragraph1).toBeDefined();
    expect(paragraph1!.content).toHaveLength(1);

    // 첫 번째 text 노드 확인
    const text1 = dataStore.getNode(paragraph1!.content![0] as string);
    expect(text1).toBeDefined();
    expect(text1!.text).toBe('Level 1');
    expect(text1!.parentId).toBe(paragraph1!.sid);

    // 두 번째 paragraph 확인
    const paragraph2 = dataStore.getNode(result.data!.content![1]);
    expect(paragraph2).toBeDefined();
    expect(paragraph2!.content).toHaveLength(1);

    // 두 번째 text 노드 확인
    const text2 = dataStore.getNode(paragraph2!.content![0] as string);
    expect(text2).toBeDefined();
    expect(text2!.text).toBe('Level 2');
    expect(text2!.parentId).toBe(paragraph2!.sid);
  });

  it('should fail schema validation for invalid node structure', async () => {
    // 잘못된 노드 구조 (paragraph가 inline-text를 직접 포함할 수 없음)
    const invalidNode = {
      type: 'paragraph',
      content: [
        {
          type: 'invalid-type', // schema에 정의되지 않은 타입
          text: 'Invalid content'
        }
      ]
    };

    const createOperation = globalOperationRegistry.get('create');
    
    await expect(createOperation!.execute({ type: 'create', payload: { node: invalidNode } } as any, context)).rejects.toThrow('Schema validation failed');
  });

  it('should pass schema validation for valid node structure', async () => {
    // 올바른 노드 구조
    const validNode = {
      type: 'document',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inline-text',
              text: 'Valid content'
            }
          ]
        }
      ]
    };

    const createOperation = globalOperationRegistry.get('create');
    const result = await createOperation!.execute({ type: 'create', payload: { node: validNode } } as any, context);

    expect(result.data).toBeDefined();
    expect(result.data?.type).toBe('document');
    expect(result.data?.content).toHaveLength(1);
  });

         describe('Selection mapping', () => {
           it('should preserve selection when creating a node', async () => {
             // 기존 Selection 설정
             const initialSelection = { type: 'range' as const, startNodeId: 'existing-text', startOffset: 5, endNodeId: 'existing-text', endOffset: 10 };
             selectionManager.setSelection(initialSelection);

            const operation = {
               type: 'create',
              payload: { node: {
                 id: 'new-text',
                 type: 'inline-text',
                 text: 'New text',
                 parentId: 'para-1'
              } }
             };

             // Operation 실행
             const createOperation = globalOperationRegistry.get('create');
             await createOperation!.execute(operation, context);
             
             // Selection이 유지되었는지 확인
             const finalSelection = selectionManager.getCurrentSelection();
             expect(finalSelection).toEqual(initialSelection);
           });

           it('should preserve selection when creating nested nodes', async () => {
             // 기존 Selection 설정
             const initialSelection = { type: 'range' as const, startNodeId: 'existing-text', startOffset: 3, endNodeId: 'existing-text', endOffset: 7 };
             selectionManager.setSelection(initialSelection);

            const operation = {
               type: 'create',
              payload: { node: {
                 id: 'new-document',
                 type: 'document',
                 content: [
                   {
                     id: 'new-para',
                     type: 'paragraph',
                     content: [
                       {
                         id: 'new-text',
                         type: 'inline-text',
                         text: 'Nested text'
                       }
                     ]
                   }
                 ]
              } }
             };

             // Operation 실행
             const createOperation = globalOperationRegistry.get('create');
             await createOperation!.execute(operation, context);
             
             // Selection이 유지되었는지 확인
             const finalSelection = selectionManager.getCurrentSelection();
             expect(finalSelection).toEqual(initialSelection);
           });

           it('should handle null selection gracefully', async () => {
             // Selection이 없는 상태
             selectionManager.clearSelection();

            const operation = {
               type: 'create',
              payload: { node: {
                 id: 'new-text',
                 type: 'inline-text',
                 text: 'New text',
                 parentId: 'para-1'
              } }
             };

             // Operation 실행
             const createOperation = globalOperationRegistry.get('create');
             await createOperation!.execute(operation, context);
             
             // Selection이 여전히 null인지 확인
             const finalSelection = selectionManager.getCurrentSelection();
             expect(finalSelection).toBeNull();
           });

  describe('create DSL', () => {
    it('should build a create descriptor from NodeTemplate', () => {
      const tpl = {
        type: 'paragraph',
        attributes: { class: 'intro' },
        content: [
          { type: 'inline-text', text: 'Hello World' }
        ]
      };

      const d = createDSL(tpl);
      expect(d).toBeTruthy();
      expect(d.type).toBe('create');
      expect(d.payload?.node).toBeDefined();
      expect(d.payload?.node.type).toBe('paragraph');
      expect(Array.isArray(d.payload?.node.content)).toBe(true);
      expect(((d.payload?.node.content?.[0] as INode))).toBeDefined();
      expect(((d.payload?.node.content?.[0] as INode)).type).toBe('inline-text');
      expect(((d.payload?.node.content?.[0] as INode)).text).toBe('Hello World');
    });
           });
         });
});
