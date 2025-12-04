import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { outdentNode as outdentNodeDsl } from '../../src/operations-dsl/outdentNode';

describe('outdentNode operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('indent-structure-schema', {
      nodes: {
        document: { name: 'document', content: 'block+', group: 'document' },
        paragraph: {
          name: 'paragraph',
          group: 'block',
          content: 'inline*',
          indentable: true,
          indentParentTypes: ['paragraph']
        },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('outdents a block node using DataStore.outdentNode', async () => {
    const doc = dataStore.createNodeWithChildren({
      stype: 'document',
      content: [
        {
          stype: 'paragraph',
          content: [
            { stype: 'inline-text', text: 'P1' },
            {
              stype: 'paragraph',
              content: [{ stype: 'inline-text', text: 'Child' }]
            }
          ]
        }
      ]
    });

    const rootId = doc.sid!;
    const root = dataStore.getNode(rootId)!;
    const [p1Id] = root.content as string[];
    const p1 = dataStore.getNode(p1Id)!;
    const childId = (p1.content as string[])[1];

    const op = globalOperationRegistry.get('outdentNode');
    expect(op).toBeDefined();

    const res = await op!.execute({ type: 'outdentNode', payload: { nodeId: childId } } as any, context);
    expect(res.ok).toBe(true);

    const updatedRoot = dataStore.getNode(rootId)!;
    const updatedP1 = dataStore.getNode(p1Id)!;
    const updatedChild = dataStore.getNode(childId)!;

    // 루트: [p1, child] 순서
    expect(updatedRoot.content).toEqual([p1Id, childId]);
    // p1 의 content 에서 child 가 제거됨
    expect(updatedP1.content).toEqual([expect.any(String)]);
    // child 의 parentId 는 document 가 됨
    expect(updatedChild.parentId).toBe(rootId);
  });

  describe('outdentNode operation DSL', () => {
    it('builds descriptor from DSL (control, node-scoped)', () => {
      const dsl = outdentNodeDsl();
      expect(dsl).toEqual({ type: 'outdentNode', payload: {} });
    });

    it('builds descriptor from DSL (direct, nodeId)', () => {
      const dsl = outdentNodeDsl('node-1');
      expect(dsl).toEqual({ type: 'outdentNode', payload: { nodeId: 'node-1' } });
    });
  });
});


