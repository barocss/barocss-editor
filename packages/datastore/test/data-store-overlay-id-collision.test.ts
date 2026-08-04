import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

/**
 * Regression: generateId() must never hand out an id twice within a single
 * overlay transaction.
 *
 * setNode()/createNodeWithChildren() re-base the shared id counter on the
 * committed node count. While an overlay transaction is open that count does
 * not grow, so a plain reset made every allocation return the same id. The
 * second setNode() then overwrote the first node and stamped its own sid as
 * parentId, producing a self-referencing node that froze every parent-walk in
 * the editor (Enter in the demo hung the whole page).
 */
function makeStore() {
  const schema = new Schema('test', {
    topNode: 'document',
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      'inline-text': { name: 'inline-text', group: 'inline' }
    },
    marks: {}
  });
  const ds = new DataStore(undefined, schema);
  ds.setNode({ sid: 'doc', stype: 'document', content: ['p1'], attributes: {} } as any, false);
  ds.setNode({ sid: 'p1', stype: 'paragraph', content: ['t1'], parentId: 'doc', attributes: {} } as any, false);
  ds.setNode({ sid: 't1', stype: 'inline-text', text: 'A', parentId: 'p1', attributes: {} } as any, false);
  return ds;
}

describe('DataStore id allocation inside an overlay transaction', () => {
  it('gives every node created in one transaction a distinct id', () => {
    const ds = makeStore();

    ds.begin();
    const blockId = ds.addChild('doc', { stype: 'paragraph', content: [] } as any, 1);
    const textId = ds.addChild(blockId, { stype: 'inline-text', text: '' } as any, 0);
    ds.end();
    ds.commit();

    expect(blockId).not.toBe(textId);
    expect(ds.getNode(blockId)?.stype).toBe('paragraph');
    expect(ds.getNode(textId)?.stype).toBe('inline-text');
  });

  it('never produces a node that is its own parent', () => {
    const ds = makeStore();

    ds.begin();
    const blockId = ds.addChild('doc', { stype: 'paragraph', content: [] } as any, 1);
    const textId = ds.addChild(blockId, { stype: 'inline-text', text: '' } as any, 0);
    ds.end();
    ds.commit();

    expect(ds.getNode(textId)?.parentId).toBe(blockId);
    const selfParented = ds.getAllNodes().filter((n) => n.parentId && n.parentId === n.sid);
    expect(selfParented).toEqual([]);
  });

  it('keeps ids distinct across many creations in one transaction', () => {
    const ds = makeStore();

    ds.begin();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const block = ds.addChild('doc', { stype: 'paragraph', content: [] } as any);
      ids.push(block, ds.addChild(block, { stype: 'inline-text', text: '' } as any, 0));
    }
    ds.end();
    ds.commit();

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('DataStore.findAncestor', () => {
  it('finds the nearest matching ancestor', () => {
    const ds = makeStore();
    const block = ds.findAncestor('t1', (n) => n.stype === 'paragraph');
    expect(block?.sid).toBe('p1');
  });

  it('returns undefined instead of hanging on a self-referencing parentId', () => {
    const ds = makeStore();
    ds.updateNode('t1', { parentId: 't1' } as any, false);

    expect(ds.findAncestor('t1', (n) => n.stype === 'document')).toBeUndefined();
  });

  it('returns undefined instead of hanging on a parentId cycle', () => {
    const ds = makeStore();
    ds.updateNode('p1', { parentId: 't1' } as any, false);
    ds.updateNode('t1', { parentId: 'p1' } as any, false);

    expect(ds.findAncestor('t1', (n) => n.stype === 'document')).toBeUndefined();
  });
});
