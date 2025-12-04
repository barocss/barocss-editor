import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Update→Delete conflict within one transaction', () => {
  it('commits to deletion when a node is updated then deleted in same txn', () => {
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
    const doc = { sid: 'doc', stype: 'document', content: ['p'], attributes: {} } as any;
    const p = { sid: 'p', stype: 'paragraph', content: ['t'], parentId: 'doc', attributes: {} } as any;
    const t = { sid: 't', stype: 'inline-text', text: 'Hello', parentId: 'p', attributes: {} } as any;
    ds.setNode(doc, false);
    ds.setNode(p, false);
    ds.setNode(t, false);

    ds.begin();
    // Update then delete the same node within the same transaction
    const r1 = ds.updateNode('t', { text: 'World' }, false);
    expect(r1?.valid ?? true).toBe(true);
    const del = ds.deleteNode('t');
    expect(del).toBe(true);
    const ops = ds.end();

    // Expect one update and one delete for the same node id, update appears before delete in the buffer
    const forT = ops.filter(o => o.nodeId === 't');
    expect(forT.length).toBe(2);
    expect(forT[0].type).toBe('update');
    expect(forT[1].type).toBe('delete');

    // After commit, node should be gone and parent content updated
    ds.commit();
    const tAfter = ds.getNode('t');
    expect(tAfter).toBeUndefined();
    const pAfter = ds.getNode('p')!;
    expect((pAfter.content || []).includes('t')).toBe(false);
  });
});


