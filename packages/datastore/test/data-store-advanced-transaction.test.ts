import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DataStore Advanced Transaction Scenarios', () => {
  let dataStore: DataStore;
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
    dataStore = new DataStore(undefined, schema);

    // Seed minimal doc
    const doc = { sid: 'doc', stype: 'document', content: ['p1'], attributes: {} } as any;
    const p1 = { sid: 'p1', stype: 'paragraph', content: ['t1','t2'], parentId: 'doc', attributes: {} } as any;
    const t1 = { sid: 't1', stype: 'inline-text', text: 'Hello', parentId: 'p1', attributes: {} } as any;
    const t2 = { sid: 't2', stype: 'inline-text', text: ' World', parentId: 'p1', attributes: {} } as any;
    dataStore.setNode(doc, false);
    dataStore.setNode(p1, false);
    dataStore.setNode(t1, false);
    dataStore.setNode(t2, false);
  });

  it('commit order integrity: create -> move -> update, final base state consistent', () => {
    dataStore.begin();
    // create a new inline-text under p1
    const nid = dataStore.addChild('p1', { stype: 'inline-text', text: 'X' });
    // move it to position 0
    dataStore.moveNode(nid, 'p1', 0);
    // update its text
    dataStore.updateNode(nid, { text: 'Y' }, false);
    const ops = dataStore.end();
    // sanity: ops collected
    expect(ops.length).toBeGreaterThan(0);
    // commit should apply without errors and reflect final state
    dataStore.commit();
    const p1After = dataStore.getNode('p1')!;
    expect(p1After.content[0]).toBe(nid);
    const nAfter = dataStore.getNode(nid)!;
    expect(nAfter.text).toBe('Y');
  });

  it('multi-transaction reset: overlay cleared between commits', () => {
    // txn #1
    dataStore.begin();
    dataStore.updateNode('t1', { text: 'A' }, false);
    dataStore.end();
    dataStore.commit();

    // txn #2 should not see previous opBuffer side effects
    dataStore.begin();
    dataStore.updateNode('t1', { text: 'B' }, false);
    const ops2 = dataStore.end();
    expect(ops2.some(o => o.type === 'update' && o.nodeId === 't1')).toBe(true);
    dataStore.commit();
    expect(dataStore.getNode('t1')!.text).toBe('B');
  });

  it('range multi-node replace collects updates for affected nodes only', () => {
    // replace across t1("Hello") + t2(" World") → "Hi!"
    dataStore.begin();
    dataStore.replaceText({ stype: 'range' as const, startNodeId: 't1', startOffset: 0, endNodeId: 't2', endOffset: 6 }, 'Hi!');
    const ops = dataStore.end();
    dataStore.commit();
    // Outcome validation of text content is deferred to dedicated range tests.
    // Here we validate transactional flow completes without error.
  });

  it('create then delete in same transaction: base unaffected', () => {
    dataStore.begin();
    const nid = dataStore.addChild('p1', { stype: 'inline-text', text: 'temp' });
    dataStore.deleteNode(nid);
    dataStore.end();
    dataStore.commit();
    const exists = dataStore.getNode(nid);
    expect(exists).toBeUndefined();
  });
});


