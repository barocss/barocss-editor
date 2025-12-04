import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('reorderChildren robust cases', () => {
  let ds: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {}
    });
    ds = new DataStore(undefined, schema);

    const doc = { sid: 'doc', type: 'document', content: ['p'], attributes: {} } as any;
    const p = { sid: 'p', type: 'paragraph', content: ['a','b','c','d'], parentId: 'doc', attributes: {} } as any;
    const a = { sid: 'a', type: 'inline-text', text: 'A', parentId: 'p', attributes: {} } as any;
    const b = { sid: 'b', type: 'inline-text', text: 'B', parentId: 'p', attributes: {} } as any;
    const c = { sid: 'c', type: 'inline-text', text: 'C', parentId: 'p', attributes: {} } as any;
    const d = { sid: 'd', type: 'inline-text', text: 'D', parentId: 'p', attributes: {} } as any;
    ds.setNode(doc, false);
    ds.setNode(p, false);
    ds.setNode(a, false);
    ds.setNode(b, false);
    ds.setNode(c, false);
    ds.setNode(d, false);
  });

  it('reorders to reverse order and emits move ops', () => {
    ds.begin();
    ds.reorderChildren('p', ['d','c','b','a']);
    const ops = ds.end();
    // Expect at least some move operations
    const moveCount = ops.filter(o => o.type === 'move').length;
    expect(moveCount).toBeGreaterThan(0);
    ds.commit();
    const p = ds.getNode('p')!;
    expect(p.content).toEqual(['d','c','b','a']);
  });

  it('reorders partial shuffle without duplicates', () => {
    ds.begin();
    ds.reorderChildren('p', ['a','c','b','d']);
    const ops = ds.end();
    const moveCount = ops.filter(o => o.type === 'move').length;
    expect(moveCount).toBeGreaterThan(0);
    ds.commit();
    const p = ds.getNode('p')!;
    expect(p.content).toEqual(['a','c','b','d']);
  });
});


