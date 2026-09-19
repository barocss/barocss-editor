import { expect, it, vi } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { SelectionManager } from '@barocss/editor-core';
import { transaction } from '../../src/transaction-dsl';
import { addChild } from '../../src/operations/addChild';
import '../../src/operations/register-operations';

it("keeps an explicit range after a created block's suggested caret", async () => {
  const schema = new Schema('range-test', { nodes: { document: { name: 'document', content: 'block+' }, paragraph: { name: 'paragraph', content: 'inline*', group: 'block' }, 'inline-text': { name: 'inline-text', content: 'text*', group: 'inline' } }, topNode: 'document' });
  const dataStore = new DataStore(undefined, schema);
  dataStore.setNode({ sid: 'doc', stype: 'document', content: ['p'] } as any);
  dataStore.setNode({ sid: 'p', stype: 'paragraph', content: ['t'], parentId: 'doc' } as any);
  dataStore.setNode({ sid: 't', stype: 'inline-text', text: 'Before', parentId: 'p' } as any);
  dataStore.setRootNodeId('doc');
  const selectionManager = new SelectionManager({ dataStore });
  selectionManager.setSelection({ type: 'range', startNodeId: 't', endNodeId: 't', startOffset: 0, endOffset: 0, collapsed: true });
  const editor = { dataStore, _dataStore: dataStore, selectionManager, emit: vi.fn(), updateSelection: vi.fn(), historyManager: { push: vi.fn() } };
  const select = { type: 'setSelection', payload: { anchor: { nodeId: 'new-text', offset: 1 }, head: { nodeId: 'new-text', offset: 4 } } };
  const result = await transaction(editor as any, [addChild('doc', { sid: 'new', stype: 'paragraph', content: [{ sid: 'new-text', stype: 'inline-text', text: 'After' }] } as any), select] as any).commit();
  expect(result.success).toBe(true);
  expect(result.selectionAfter).toMatchObject({ startNodeId: 'new-text', endNodeId: 'new-text', startOffset: 1, endOffset: 4, collapsed: false });
});
