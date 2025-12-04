import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { Editor, SelectionManager } from '@barocss/editor-core';
import { transaction, control, node, textNode, mark, op } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';

describe('DSL Basic Operations', () => {
  let dataStore: DataStore;
  let mockEditor: Editor;

  beforeEach(() => {
    // Create a simple schema
    const schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
        'inline-text': { name: 'inline-text', content: 'text*', group: 'inline' }
      },
      topNode: 'document'
    });

    dataStore = new DataStore(undefined, schema);

    mockEditor = new Editor({
      dataStore,
      schema
    });
  });

  it('should create a simple text node', async () => {
    const result = await transaction(mockEditor, [
      create(textNode('inline-text', 'Hello World'))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe('create');
  });

  it('should create a paragraph with text', async () => {
    const result = await transaction(mockEditor, [
      create(node('paragraph', {}, [
        textNode('inline-text', 'Hello World')
      ]))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
  });

  it('should use control to set text on a node', async () => {
    // First create a text node
    const createResult = await transaction(mockEditor, [
      create(textNode('inline-text', 'Initial'))
    ]).commit();

    expect(createResult.success).toBe(true);
    const nodeId = createResult.operations[0].result.data.sid;

    // Then use control to modify it
    const result = await transaction(mockEditor, [
      control(nodeId, [
        { type: 'setText', payload: { text: 'Updated Text' } }
      ])
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe('setText');
    expect(result.operations[0].payload.text).toBe('Updated Text');
  });

  it('should use op function for complex operations', async () => {
    const result = await transaction(mockEditor, [
      op(async (ctx) => {
        // DataStore를 직접 사용
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'Hello from op function'),
          ctx.schema
        );
        
        return {
          success: true,
          data: node
        };
      })
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(0); // OpResult는 operation을 생성하지 않음
  });

  it('should use op function with simple logic', async () => {
    const result = await transaction(mockEditor, [
      op(async (ctx) => {
        // 간단한 조건부 로직
        const shouldCreate = true;
        if (shouldCreate) {
          const node = ctx.dataStore.createNodeWithChildren(
            textNode('inline-text', 'Conditional text'),
            ctx.schema
          );
          return {
            success: true,
            data: node
          };
        } else {
          return {
            success: false,
            error: 'Should not create'
          };
        }
      })
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(0);
  });

  it('should create text with marks', async () => {
    const result = await transaction(mockEditor, [
      create(textNode('inline-text', 'Bold Text', [
        mark('bold', { weight: 'bold' })
      ]))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
  });

  it('should handle multiple operations in one transaction', async () => {
    const result = await transaction(mockEditor, [
      create(textNode('inline-text', 'First')),
      create(textNode('inline-text', 'Second'))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(2);
  });

  it('should handle op function with no return value', async () => {
    const result = await transaction(mockEditor, [
      op(async (ctx) => {
        // 아무것도 리턴하지 않음
      })
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(0); // 아무것도 리턴하지 않으면 operation 없음
  });


  it('should handle op function returning OpResult with inverse', async () => {
    const result = await transaction(mockEditor, [
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'With inverse'),
          ctx.schema
        );
        
        return {
          success: true,
          data: node,
          inverse: {
            type: 'delete',
            payload: { nodeId: node.sid }
          }
        };
      })
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(0); // OpResult는 operation을 생성하지 않음 (inverse는 나중에 undo할 때 사용)
  });

  it('should stop execution when op function returns success: false', async () => {
    const result = await transaction(mockEditor, [
      // 첫 번째 op - 성공
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'First node'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // 두 번째 op - 실패
      op(async (ctx) => {
        return { success: false, error: 'Second op failed' };
      }),
      
      // 세 번째 op - 실행되지 않아야 함
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'Third node - should not be created'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // 일반 operation - 실행되지 않아야 함
      create(textNode('inline-text', 'Fourth node - should not be created'))
    ]).commit();

    // 전체 트랜잭션이 실패해야 함
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Second op failed');
    expect(result.operations).toHaveLength(0);
  });

  it('should stop execution when op function throws error', async () => {
    const result = await transaction(mockEditor, [
      // 첫 번째 op - 성공
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'First node'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // 두 번째 op - 에러 발생
      op(async (ctx) => {
        throw new Error('Op function threw error');
      }),
      
      // 세 번째 op - 실행되지 않아야 함
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'Third node - should not be created'),
          ctx.schema
        );
        return { success: true, data: node };
      })
    ]).commit();

    // 전체 트랜잭션이 실패해야 함
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Op function threw error');
    expect(result.operations).toHaveLength(0);
  });

  it('should continue execution when op function returns success: true', async () => {
    const result = await transaction(mockEditor, [
      // 첫 번째 op - 성공
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'First node'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // 두 번째 op - 성공
      op(async (ctx) => {
        const node = ctx.dataStore.createNodeWithChildren(
          textNode('inline-text', 'Second node'),
          ctx.schema
        );
        return { success: true, data: node };
      }),
      
      // 일반 operation - 실행되어야 함
      create(textNode('inline-text', 'Third node'))
    ]).commit();

    // 전체 트랜잭션이 성공해야 함
    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1); // create operation만 operations에 추가됨
  });
});
