import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DataStore invalid writes under overlay', () => {
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

    const doc = { sid: 'doc', type: 'document', content: ['p1','p2'], attributes: {} } as any;
    const p1 = { sid: 'p1', type: 'paragraph', content: ['t1'], parentId: 'doc', attributes: {} } as any;
    const p2 = { sid: 'p2', type: 'paragraph', content: [], parentId: 'doc', attributes: {} } as any;
    const t1 = { sid: 't1', type: 'inline-text', text: 'A', parentId: 'p1', attributes: {} } as any;
    dataStore.setNode(doc, false);
    dataStore.setNode(p1, false);
    dataStore.setNode(p2, false);
    dataStore.setNode(t1, false);
  });

  it('move/add into overlay-deleted parent becomes no-op during active transaction', () => {
    dataStore.begin();
    // delete p2 in overlay
    dataStore.deleteNode('p2');
    // try to move t1 into deleted p2
    dataStore.moveNode('t1', 'p2');
    // try to add child into deleted p2
    const addedId = dataStore.addChild('p2', { stype: 'inline-text', text: 'X' });
    const ops = dataStore.end();

    // Ensure no move op to p2 and addedId still created but not attached
    expect(ops.some(o => o.type === 'move' && (o as any).parentId === 'p2')).toBe(false);
    // overlay read: p2 is hidden
    const p2Now = dataStore.getNode('p2');
    expect(p2Now).toBeUndefined();
    // base unaffected after rollback
    dataStore.rollback();
    const p2Base = dataStore.getNode('p2');
    expect(p2Base).toBeDefined();
    expect(p2Base!.content).toEqual([]);
  });
});


