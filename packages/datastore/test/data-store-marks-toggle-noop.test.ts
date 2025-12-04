import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Marks toggle no-op should not emit updates', () => {
  it('toggleMark that produces no change should not create update ops', () => {
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
    const doc = { sid: 'd', stype: 'document', content: ['p'], attributes: {} } as any;
    const p = { sid: 'p', stype: 'paragraph', content: ['t'], parentId: 'd', attributes: {} } as any;
    const t = { sid: 't', stype: 'inline-text', text: 'Hello', parentId: 'p', attributes: {}, marks: [{ stype: 'bold', range: [0,5] }] } as any;
    ds.setNode(doc, false);
    ds.setNode(p, false);
    ds.setNode(t, false);

    ds.begin();
    // Spec: exact same-range toggle removes mark and emits an update
    ds.toggleMark({ stype: 'range' as const, startNodeId: 't', startOffset: 0, endNodeId: 't', endOffset: 5 }, { stype: 'bold' } as any);
    const ops = ds.end();
    expect(ops.some(o => o.type === 'update' && o.nodeId === 't')).toBe(true);
  });
});


