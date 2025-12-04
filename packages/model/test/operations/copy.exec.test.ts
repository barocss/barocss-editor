import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import { transaction, control } from '../../src';
import { copy } from '../../src/operations-dsl';

describe('copy operation', () => {
  it('returns json and text for given range', async () => {
    const ds = new DataStore();
    const rootId = ds.generateId();
    const t1 = ds.generateId();
    const t2 = ds.generateId();

    ds.setNodeInternal({
      sid: rootId,
      stype: 'paragraph',
      content: [t1, t2]
    } as INode);
    ds.setNodeInternal({ sid: t1, stype: 'inline-text', text: 'Hello ', parentId: rootId } as INode);
    ds.setNodeInternal({ sid: t2, stype: 'inline-text', text: 'World', parentId: rootId } as INode);

    const range = {
      type: 'range',
      startNodeId: t1,
      startOffset: 0,
      endNodeId: t2,
      endOffset: 5,
      collapsed: false,
      direction: 'forward'
    };

    const result = await transaction(
      { dataStore: ds } as any,
      (ctrl) => ctrl(range as any, [copy(range as any)])
    );

    expect(result).toBeTruthy();
    const payload = (result as any)[0];
    expect(payload.data.json).toBeInstanceOf(Array);
    expect(payload.data.text).toBe('Hello World');
  });
});


