import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { transaction, control } from '../../src';
import { copy } from '../../src/operations-dsl';

describe('copy operation', () => {
  it('returns json and text for given range', async () => {
    const ds = new DataStore();
    const selectionManager = new SelectionManager({ dataStore: ds });
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

    const builder = transaction(
      { dataStore: ds, selectionManager } as any,
      (ctrl) => ctrl(range as any, [copy(range as any)])
    );
    const result = await builder.commit();

    expect(result.success).toBe(true);
    const firstOp = result.operations?.[0] as { result?: { data?: { json?: unknown[]; text?: string } } };
    expect(firstOp?.result?.data?.json).toBeInstanceOf(Array);
    expect(firstOp?.result?.data?.text).toBe('Hello World');
  });
});


