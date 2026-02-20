import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionManager } from '../../src/transaction';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { SelectionManager } from '@barocss/editor-core';

describe('selection operations execution', () => {
  let txManager: TransactionManager;
  let selectionManager: SelectionManager;
  let dataStore: DataStore;

  beforeEach(() => {
    const schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'paragraph+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*' }
      }
    });

    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });

    const mockEditor = {
      dataStore,
      selectionManager,
      emit: () => {},
      updateSelection: (selection: any) => {
        if (!selection) {
          selectionManager.clearSelection();
          return;
        }
        selectionManager.setSelection(selection);
      },
      historyManager: {
        push: () => {}
      }
    };

    txManager = new TransactionManager(mockEditor as any);

    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] });
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['t-1'], parentId: 'doc-1' });
    dataStore.setNode({ sid: 't-1', stype: 'inline-text', text: 'Hello', parentId: 'p-1' });
  });

  it('should keep selectionManager and transaction context in sync for selectRange', async () => {
    const result = await txManager.execute([
      { type: 'selectRange', nodeId: 't-1', start: 1, end: 4 }
    ]);

    expect(result.success).toBe(true);
    expect(selectionManager.getCurrentSelection()).toMatchObject({
      type: 'range',
      startNodeId: 't-1',
      startOffset: 1,
      endNodeId: 't-1',
      endOffset: 4
    });
    expect(result.selectionAfter).toMatchObject({
      type: 'range',
      startNodeId: 't-1',
      startOffset: 1,
      endNodeId: 't-1',
      endOffset: 4
    });
  });

  it('should not mutate selectionBefore snapshot', async () => {
    const selectionBefore = {
      type: 'range',
      startNodeId: 't-1',
      startOffset: 0,
      endNodeId: 't-1',
      endOffset: 1,
      collapsed: false
    } as any;

    selectionManager.setSelection(selectionBefore);

    const result = await txManager.execute([
      { type: 'selectRange', nodeId: 't-1', start: 2, end: 3 }
    ]);

    expect(result.selectionBefore).toEqual(selectionBefore);
    expect(result.selectionBefore).not.toBe(selectionManager.getCurrentSelection());
  });

  it('should keep selectionManager and transaction context in sync for selectNode', async () => {
    const result = await txManager.execute([
      { type: 'selectNode', nodeId: 't-1', payload: { nodeId: 't-1' } }
    ]);

    expect(result.success).toBe(true);
    expect(selectionManager.getCurrentSelection()).toMatchObject({
      type: 'node',
      startNodeId: 't-1',
      startOffset: 0,
      endNodeId: 't-1',
      endOffset: 0
    });
    expect(result.selectionAfter).toMatchObject({
      type: 'node',
      startNodeId: 't-1',
      startOffset: 0,
      endNodeId: 't-1',
      endOffset: 0
    });
  });

  it('should clear both selectionManager and transaction context in clearSelection', async () => {
    selectionManager.selectRange('t-1', 1, 3);

    const result = await txManager.execute([{ type: 'clearSelection' }]);

    expect(result.success).toBe(true);
    expect(selectionManager.getCurrentSelection()).toBeNull();
    expect(result.selectionAfter).toBeNull();
  });
});
