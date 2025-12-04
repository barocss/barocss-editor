import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { indentNode as indentNodeDsl } from '../../src/operations-dsl/indentNode';

describe('indentNode operation (exec)', () => {
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

  it('indents a block node using DataStore.indentNode', async () => {
    const doc = dataStore.createNodeWithChildren({
      stype: 'document',
      content: [
        {
          stype: 'paragraph',
          content: [{ stype: 'inline-text', text: 'P1' }]
        },
        {
          stype: 'paragraph',
          content: [{ stype: 'inline-text', text: 'P2' }]
        }
      ]
    });

    const rootId = doc.sid!;
    const root = dataStore.getNode(rootId)!;
    const [p1Id, p2Id] = root.content as string[];

    const op = globalOperationRegistry.get('indentNode');
    expect(op).toBeDefined();

    const res = await op!.execute({ type: 'indentNode', payload: { nodeId: p2Id } } as any, context);
    expect(res.ok).toBe(true);

    const updatedRoot = dataStore.getNode(rootId)!;
    const updatedP1 = dataStore.getNode(p1Id)!;
    const updatedP2 = dataStore.getNode(p2Id)!;

    expect(updatedRoot.content).toEqual([p1Id]);
    // p1 의 자식 리스트의 마지막에 p2 가 추가되어야 함
    expect(updatedP1.content).toEqual([expect.any(String), p2Id]);
    expect(updatedP2.parentId).toBe(p1Id);
  });

  describe('indentNode operation DSL', () => {
    it('builds descriptor from DSL (control, node-scoped)', () => {
      const dsl = indentNodeDsl();
      expect(dsl).toEqual({ type: 'indentNode', payload: {} });
    });

    it('builds descriptor from DSL (direct, nodeId)', () => {
      const dsl = indentNodeDsl('node-1');
      expect(dsl).toEqual({ type: 'indentNode', payload: { nodeId: 'node-1' } });
    });
  });
});


