import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

describe('moveBlockUp operation (exec)', () => {
  let dataStore: DataStore;
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
        'inline-text': { 
          name: 'inline-text', 
          group: 'inline'
        }
      }
    });
    dataStore.registerSchema(schema);

    // 문서 구조 생성
    const docNode: INode = {
      sid: 'doc-1',
      stype: 'document',
      content: ['para-1', 'para-2', 'para-3']
    };
    dataStore.setNode(docNode);

    ['para-1', 'para-2', 'para-3'].forEach((id) => {
      const node: INode = {
        sid: id,
        stype: 'paragraph',
        content: [],
        parentId: 'doc-1'
      };
      dataStore.setNode(node);
    });

    const selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('블록을 위로 이동해야 함', async () => {
    const op = globalOperationRegistry.get('moveBlockUp');
    expect(op).toBeDefined();

    const result = await op!.execute(
      { type: 'moveBlockUp', payload: { nodeId: 'para-2' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const doc = dataStore.getNode('doc-1');
    expect(doc?.content).toEqual(['para-2', 'para-1', 'para-3']);
  });

  it('첫 번째 블록은 위로 이동할 수 없음', async () => {
    const op = globalOperationRegistry.get('moveBlockUp');
    const result = await op!.execute(
      { type: 'moveBlockUp', payload: { nodeId: 'para-1' } } as any,
      context
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('already at first position');
    
    const doc = dataStore.getNode('doc-1');
    expect(doc?.content).toEqual(['para-1', 'para-2', 'para-3']);
  });

  it('inverse operation이 올바르게 생성되어야 함', async () => {
    const op = globalOperationRegistry.get('moveBlockUp');
    const result = await op!.execute(
      { type: 'moveBlockUp', payload: { nodeId: 'para-2' } } as any,
      context
    );

    expect(result.inverse).toBeDefined();
    expect(result.inverse.type).toBe('moveBlockDown');
    expect(result.inverse.payload.nodeId).toBe('para-2');
  });
});

