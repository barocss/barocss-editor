import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { transaction, control } from '../../src';
import { cut } from '../../src/operations-dsl';

describe('cut operation', () => {
  it('returns json + text and deletes range', async () => {
    const ds = new DataStore();
    const selectionManager = new SelectionManager({ dataStore: ds });
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

    const builder = transaction(
      { dataStore: ds, selectionManager } as any,
      (ctrl) => ctrl(range as any, [cut(range as any)])
    );
    const result = await builder.commit();

    expect(result.success).toBe(true);
    const node = ds.getNode(t1)!;
    expect(node.text).toBe('Hello ');

    const firstOp = result.operations?.[0] as { result?: { data?: { json?: unknown[]; text?: string } } };
    expect(firstOp?.result?.data?.json).toBeInstanceOf(Array);
    expect(firstOp?.result?.data?.text).toBe('World');
  });
});


