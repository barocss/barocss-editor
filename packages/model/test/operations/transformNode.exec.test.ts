import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

describe('transformNode operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: any;

  beforeEach(() => {
    dataStore = new DataStore();
    schema = createSchema('test', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { 
          name: 'paragraph', 
          group: 'block', 
          content: 'inline-text+',
          attrs: {}
        },
        heading: { 
          name: 'heading', 
          group: 'block', 
          content: 'inline-text+',
          attrs: { level: { type: 'number', default: 1 } }
        },
        'inline-text': { 
          name: 'inline-text', 
          group: 'inline'
        }
      }
    });
    dataStore.registerSchema(schema);
    selectionManager = new SelectionManager({ dataStore });

    // Create document structure
    const docNode: INode = {
      sid: 'doc-1',
      stype: 'document',
      content: ['para-1']
    };
    dataStore.setNode(docNode);

    const paragraphNode: INode = {
      sid: 'para-1',
      stype: 'paragraph',
      content: ['text-1'],
      parentId: 'doc-1'
    };
    dataStore.setNode(paragraphNode);

    const textNode: INode = {
      sid: 'text-1',
      stype: 'inline-text',
      text: 'Hello World',
      parentId: 'para-1'
    };
    dataStore.setNode(textNode);

    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('paragraph를 heading으로 변환해야 함', async () => {
    const op = globalOperationRegistry.get('transformNode');
    expect(op).toBeDefined();

    const result = await op!.execute(
      { type: 'transformNode', payload: { nodeId: 'para-1', newType: 'heading', newAttrs: { level: 1 } } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const transformedNode = dataStore.getNode('para-1');
    expect(transformedNode?.stype).toBe('heading');
    expect(transformedNode?.attributes?.level).toBe(1);
    expect(transformedNode?.content).toEqual(['text-1']);
  });

  it('heading을 paragraph로 변환해야 함', async () => {
    // First convert to heading
    const headingNode: INode = {
      sid: 'heading-1',
      stype: 'heading',
      content: ['text-2'],
      attributes: { level: 2 },
      parentId: 'doc-1'
    };
    dataStore.setNode(headingNode);

    const textNode2: INode = {
      sid: 'text-2',
      stype: 'inline-text',
      text: 'Heading Text',
      parentId: 'heading-1'
    };
    dataStore.setNode(textNode2);

    const op = globalOperationRegistry.get('transformNode');
    const result = await op!.execute(
      { type: 'transformNode', payload: { nodeId: 'heading-1', newType: 'paragraph' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const transformedNode = dataStore.getNode('heading-1');
    expect(transformedNode?.stype).toBe('paragraph');
    expect(transformedNode?.content).toEqual(['text-2']);
  });

  it('존재하지 않는 노드 변환 시 에러를 던져야 함', async () => {
    const op = globalOperationRegistry.get('transformNode');
    await expect(
      op!.execute(
        { type: 'transformNode', payload: { nodeId: 'nonexistent', newType: 'heading' } } as any,
        context
      )
    ).rejects.toThrow('Node not found: nonexistent');
  });

  it('inverse operation이 올바르게 생성되어야 함', async () => {
    const op = globalOperationRegistry.get('transformNode');
    const result = await op!.execute(
      { type: 'transformNode', payload: { nodeId: 'para-1', newType: 'heading', newAttrs: { level: 1 } } } as any,
      context
    );

    expect(result.inverse).toBeDefined();
    expect(result.inverse.type).toBe('transformNode');
    expect(result.inverse.payload.newType).toBe('paragraph');
    expect(result.inverse.payload.nodeId).toBe('para-1');
  });
});

