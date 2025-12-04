import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DataStore Transaction Lifecycle', () => {
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

    // Seed minimal document
    const document = {
      sid: 'doc',
      stype: 'document',
      content: ['p1'],
      attributes: {}
    } as any;
    const p1 = {
      sid: 'p1',
      stype: 'paragraph',
      content: ['t1'],
      parentId: 'doc',
      attributes: {}
    } as any;
    const t1 = {
      sid: 't1',
      stype: 'inline-text',
      text: 'Hello',
      parentId: 'p1',
      attributes: {}
    } as any;

    dataStore.setNode(document, false);
    dataStore.setNode(p1, false);
    dataStore.setNode(t1, false);
  });

  it('begin → ops → end → commit: applies overlay to base, resets overlay', () => {
    dataStore.begin();
    // perform update and addChild
    dataStore.updateNode('t1', { text: 'Hello World' }, false);
    const newId = dataStore.addChild('p1', { stype: 'inline-text', text: '!' });
    const ops = dataStore.end();

    // ops collected
    expect(Array.isArray(ops)).toBe(true);
    expect(ops.length).toBeGreaterThanOrEqual(2);

    // commit should apply changes to base
    dataStore.commit();

    const p1After = dataStore.getNode('p1');
    const t1After = dataStore.getNode('t1');
    const added = dataStore.getNode(newId);

    expect(t1After!.text).toBe('Hello World');
    expect(p1After!.content).toContain(newId);
    expect(added).toBeDefined();
  });

  it('begin → ops → end → rollback: discards overlay changes', () => {
    dataStore.begin();
    dataStore.updateNode('t1', { text: 'Changed' }, false);
    const newId = dataStore.addChild('p1', { stype: 'inline-text', text: '?' });
    const ops = dataStore.end();
    expect(ops.length).toBeGreaterThan(0);

    dataStore.rollback();

    // base remains unchanged
    const t1After = dataStore.getNode('t1');
    expect(t1After!.text).toBe('Hello');
  });
});


