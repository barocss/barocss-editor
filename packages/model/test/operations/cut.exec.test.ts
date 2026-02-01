import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { transaction, control } from '../../src';
import { cut } from '../../src/operations-dsl';

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

describe('cut operation', () => {
  it('returns json + text and deletes range', async () => {
    const schema = new Schema('test', {
      nodes: { 'paragraph': { name: 'paragraph', content: 'inline-text*' }, 'inline-text': { name: 'inline-text', content: 'text*' } },
      marks: {}
    });
    const ds = new DataStore(undefined, schema);
    const selectionManager = new SelectionManager({ dataStore: ds });
    const editor = createMockEditor(ds, selectionManager, schema);
    const rootId = ds.generateId();
    const t1 = ds.generateId();

    ds.setNodeInternal({
      sid: rootId,
      stype: 'paragraph',
      content: [t1]
    } as INode);
    ds.setNodeInternal({ sid: t1, stype: 'inline-text', text: 'Hello World', parentId: rootId } as INode);
    ds.setRootNodeId(rootId);

    const range = {
      type: 'range',
      startNodeId: t1,
      startOffset: 6,
      endNodeId: t1,
      endOffset: 11,
      collapsed: false,
      direction: 'forward'
    };

    const builder = transaction(editor as any, [cut(range as any)]);
    const result = await builder.commit();

    expect(result.success).toBe(true);
    const node = ds.getNode(t1)!;
    expect(node.text).toBe('Hello ');

    const firstOp = result.operations?.[0] as { result?: { json?: unknown[]; text?: string } };
    expect(firstOp?.result?.json).toBeInstanceOf(Array);
    expect(firstOp?.result?.text).toBe('World');
  });
});


