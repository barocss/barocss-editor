import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Whitespace ops idempotency', () => {
  const makeStore = () => {
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
    const doc = { sid: 'doc', type: 'document', content: ['p'], attributes: {} } as any;
    const p = { sid: 'p', type: 'paragraph', content: ['t'], parentId: 'doc', attributes: {} } as any;
    ds.setNode(doc, false);
    ds.setNode(p, false);
    return ds;
  };

  it('normalizeWhitespace is idempotent (second run no update)', () => {
    const ds = makeStore();
    const t = { sid: 't', type: 'inline-text', text: 'Hello   World', parentId: 'p', attributes: {} } as any;
    ds.setNode(t, false);

    // First run - should change text content (op emission may vary)
    ds.begin();
    ds.normalizeWhitespace({ stype: 'range' as const, startNodeId: 't', startOffset: 0, endNodeId: 't', endOffset: t.text.length });
    ds.end();

    // Second run on already-normalized text - should produce no update
    const current = ds.getNode('t')!;
    ds.begin();
    ds.normalizeWhitespace({ stype: 'range' as const, startNodeId: 't', startOffset: 0, endNodeId: 't', endOffset: (current.text || '').length });
    const ops2 = ds.end();
    expect(ops2.some(o => o.type === 'update' && o.nodeId === 't')).toBe(false);
  });

  it('trimText is idempotent (second run no update)', () => {
    const ds = makeStore();
    const t = { sid: 't', type: 'inline-text', text: '  Hello World  ', parentId: 'p', attributes: {} } as any;
    ds.setNode(t, false);

    // First run - should change text content (op emission may vary)
    ds.begin();
    ds.trimText({ stype: 'range' as const, startNodeId: 't', startOffset: 0, endNodeId: 't', endOffset: t.text.length });
    ds.end();

    // Second run - should produce no update
    const current = ds.getNode('t')!;
    ds.begin();
    ds.trimText({ stype: 'range' as const, startNodeId: 't', startOffset: 0, endNodeId: 't', endOffset: (current.text || '').length });
    const ops2 = ds.end();
    expect(ops2.some(o => o.type === 'update' && o.nodeId === 't')).toBe(false);
  });
});


