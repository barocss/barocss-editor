import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import { transaction } from '../../src';
import { paste } from '../../src/operations-dsl';

describe('paste operation', () => {
  it('inserts nodes after startNode and returns new selection', async () => {
    const ds = new DataStore();

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

    const result = await transaction(
      { dataStore: ds } as any,
      (ctrl) => ctrl(range as any, [paste(nodes as any, range as any)])
    );

    const root = ds.getNode(rootId)!;
    const ids = root.content as string[];
    expect(ids.length).toBe(4);
    expect(ds.getNode(ids[0])!.text).toBe('A');
    expect(ds.getNode(ids[1])!.text).toBe('B1');
    expect(ds.getNode(ids[2])!.text).toBe('B2');
    expect(ds.getNode(ids[3])!.text).toBe('C');

    const opResult = (result as any)[0];
    expect(opResult.data.insertedNodeIds.length).toBe(2);
    expect(opResult.data.newSelection).not.toBeNull();
  });
});


