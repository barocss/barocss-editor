import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Move/add into overlay-created parent', () => {
  it('allows move/add into a parent created in overlay within same txn', () => {
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
    const doc = { sid: 'doc', stype: 'document', content: ['p1'], attributes: {} } as any;
    const p1 = { sid: 'p1', stype: 'paragraph', content: ['t1'], parentId: 'doc', attributes: {} } as any;
    const t1 = { sid: 't1', stype: 'inline-text', text: 'A', parentId: 'p1', attributes: {} } as any;
    ds.setNode(doc, false);
    ds.setNode(p1, false);
    ds.setNode(t1, false);

    ds.begin();
    // Create new parent in overlay
    const p2 = { sid: 'p2', stype: 'paragraph', content: [], parentId: 'doc', attributes: {} } as any;
    ds.setNode(p2);
    // Attach to doc
    const newDocContent = ['p1','p2'];
    ds.updateNode('doc', { content: newDocContent } as any, false);
    // Move t1 into p2
    ds.moveNode('t1', 'p2');
    // Add a fresh child into p2
    const addedId = ds.addChild('p2', { stype: 'inline-text', text: 'B' });
    const ops = ds.end();
    // Should include moves/updates but no errors
    expect(Array.isArray(ops)).toBe(true);
    ds.commit();
    const t1After = ds.getNode('t1')!;
    const addedAfter = ds.getNode(addedId)!;
    expect(t1After.parentId).toBe('p2');
    expect(addedAfter.parentId).toBe('p2');
  });
});


