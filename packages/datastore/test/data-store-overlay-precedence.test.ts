import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DataStore Overlay precedence', () => {
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

    const doc = { sid: 'doc', type: 'document', content: ['p'], attributes: {} } as any;
    const p = { sid: 'p', type: 'paragraph', content: ['t'], parentId: 'doc', attributes: {} } as any;
    const t = { sid: 't', type: 'inline-text', text: 'Base', parentId: 'p', attributes: {} } as any;
    dataStore.setNode(doc, false);
    dataStore.setNode(p, false);
    dataStore.setNode(t, false);
  });

  it('read prefers overlay node over base; deleted hides base', () => {
    // overlay update should override base reads immediately
    dataStore.begin();
    dataStore.updateNode('t', { text: 'Overlay' }, false);
    const tDuring = dataStore.getNode('t');
    expect(tDuring!.text).toBe('Overlay');
    dataStore.end();
    dataStore.rollback();

    // overlay delete hides base
    dataStore.begin();
    dataStore.deleteNode('t');
    const hidden = dataStore.getNode('t');
    expect(hidden).toBeUndefined();
    dataStore.end();
    dataStore.rollback();

    // base still unchanged
    const base = dataStore.getNode('t');
    expect(base!.text).toBe('Base');
  });
});


