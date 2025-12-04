import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import { transaction, control } from '../../src';
import { cut } from '../../src/operations-dsl';

describe('cut operation', () => {
  it('returns json + text and deletes range', async () => {
    const ds = new DataStore();
    const rootId = ds.generateId();
    const t1 = ds.generateId();

    ds.setNodeInternal({
      sid: rootId,
      stype: 'paragraph',
      content: [t1]
    } as INode);
    ds.setNodeInternal({ sid: t1, stype: 'inline-text', text: 'Hello World', parentId: rootId } as INode);

    const range = {
      type: 'range',
      startNodeId: t1,
      startOffset: 6,
      endNodeId: t1,
      endOffset: 11,
      collapsed: false,
      direction: 'forward'
    };

    const result = await transaction(
      { dataStore: ds } as any,
      (ctrl) => ctrl(range as any, [cut(range as any)])
    );

    const node = ds.getNode(t1)!;
    expect(node.text).toBe('Hello ');

    const opResult = (result as any)[0];
    expect(opResult.data.json).toBeInstanceOf(Array);
    expect(opResult.data.text).toBe('World');
  });
});


