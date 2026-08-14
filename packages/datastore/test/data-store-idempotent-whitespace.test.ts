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

    /**
     * Idempotent means the second run leaves the text as the first run left it.
     *
     * This used to ask whether the second run emitted an update operation, and
     * `end()` returns everything the overlay has collected since `begin()` — the
     * overlay stays open until commit, and says so — so the list still carried
     * the first run's operations and the question could not be answered that
     * way. It passed regardless, because `extractText` returned nothing for a
     * range inside one node and neither run did anything at all.
     */
    const afterFirst = ds.getNode('t')!.text;
    expect(afterFirst, 'the first run did not normalise anything').toBe('Hello World');

    ds.begin();
    ds.normalizeWhitespace({ stype: 'range' as const, startNodeId: 't', startOffset: 0, endNodeId: 't', endOffset: (afterFirst || '').length });
    ds.end();
    expect(ds.getNode('t')!.text, 'running it twice changed the text').toBe(afterFirst);
  });

  it('trimText is idempotent (second run no update)', () => {
    const ds = makeStore();
    const t = { sid: 't', type: 'inline-text', text: '  Hello World  ', parentId: 'p', attributes: {} } as any;
    ds.setNode(t, false);

    // First run - should change text content (op emission may vary)
    ds.begin();
    ds.trimText({ stype: 'range' as const, startNodeId: 't', startOffset: 0, endNodeId: 't', endOffset: t.text.length });
    ds.end();

    // As above: the claim is about the text, not about the operation list.
    const afterFirst = ds.getNode('t')!.text;
    expect(afterFirst, 'the first run did not trim anything').toBe('Hello World');

    ds.begin();
    ds.trimText({ stype: 'range' as const, startNodeId: 't', startOffset: 0, endNodeId: 't', endOffset: (afterFirst || '').length });
    ds.end();
    expect(ds.getNode('t')!.text, 'running it twice changed the text').toBe(afterFirst);
  });
});


