import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { transaction } from '../../src';
import { paste } from '../../src/operations-dsl';

function createMockEditor(dataStore: DataStore, selectionManager: SelectionManager, schema: Schema) {
  return {
    dataStore,
    selectionManager,
    getActiveSchema: () => schema,
    historyManager: { push: () => {} },
    emit: () => {},
    updateSelection: () => {}
  };
}

describe('paste operation', () => {
  it('inserts nodes after startNode and returns new selection', async () => {
    const schema = new Schema('test', {
      nodes: { 'paragraph': { name: 'paragraph', content: 'inline-text*' }, 'inline-text': { name: 'inline-text', content: 'text*' } },
      marks: {}
    });
    const ds = new DataStore(undefined, schema);
    const selectionManager = new SelectionManager({ dataStore: ds });
    const editor = createMockEditor(ds, selectionManager, schema);

    const rootId = ds.generateId();
    const aId = ds.generateId();
    const cId = ds.generateId();

    ds.setNodeInternal({
      sid: rootId,
      stype: 'paragraph',
      content: [aId, cId]
    } as INode);
    ds.setNodeInternal({ sid: aId, stype: 'inline-text', text: 'A', parentId: rootId } as INode);
    ds.setNodeInternal({ sid: cId, stype: 'inline-text', text: 'C', parentId: rootId } as INode);

    const nodes: INode[] = [
      { stype: 'inline-text', text: 'B1' } as any,
      { stype: 'inline-text', text: 'B2' } as any
    ];

    const range = {
      type: 'range',
      startNodeId: aId,
      startOffset: 1,
      endNodeId: aId,
      endOffset: 1,
      collapsed: true,
      direction: 'forward'
    };

    const builder = transaction(editor as any, [paste(nodes as any, range as any)]);
    const result = await builder.commit();

    expect(result.success).toBe(true);
    const root = ds.getNode(rootId)!;
    const ids = root.content as string[];
    expect(ids.length).toBe(4);
    expect(ds.getNode(ids[0])!.text).toBe('A');
    expect(ds.getNode(ids[1])!.text).toBe('B1');
    expect(ds.getNode(ids[2])!.text).toBe('B2');
    expect(ds.getNode(ids[3])!.text).toBe('C');

    const firstOp = result.operations?.[0] as { result?: { insertedNodeIds?: string[]; newSelection?: unknown } };
    expect(firstOp?.result?.insertedNodeIds?.length).toBe(2);
    expect(firstOp?.result?.newSelection).not.toBeNull();
  });
});


