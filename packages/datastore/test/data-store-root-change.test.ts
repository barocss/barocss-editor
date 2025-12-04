import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Overlay root change commit', () => {
  it('commits overlay root id change to base', () => {
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
    const t = { sid: 't', stype: 'inline-text', text: 'X', parentId: 'p', attributes: {} } as any;
    ds.setNode(doc, false);
    ds.setNode(p, false);
    ds.setNode(t, false);

    ds.begin();
    // Create a new document root and switch root via API
    const newDoc = { sid: 'doc2', stype: 'document', content: ['p'], attributes: {} } as any;
    ds.setNode(newDoc);
    ds.setRoot('doc2');
    ds.end();
    ds.commit();

    // After commit, the new root id is applied
    const rootId = ds.getRootNodeId();
    expect(rootId).toBe('doc2');
  });

  it('prevents deleting current root via deleteNode', () => {
    const ds = new DataStore();
    ds.setNode({ sid: 'doc', stype: 'document', content: [] } as any, false);
    ds.setRoot('doc');
    expect(() => ds.deleteNode('doc')).toThrow('Cannot delete root node');
    expect(ds.getRootNodeId()).toBe('doc');
  });

  it('prevents deleting current root via deleteDocument', () => {
    const ds = new DataStore();
    ds.setNode({ sid: 'doc', stype: 'document', content: [] } as any, false);
    ds.setRoot('doc');
    expect(() => ds.deleteDocument('doc')).toThrow('Cannot delete root document');
    expect(ds.getRootNodeId()).toBe('doc');
  });
});


