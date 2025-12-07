import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Schema-agnostic text nodes (text presence only)', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // Custom schema: text node type name is arbitrary, but if it has .text field, it's treated as text
    schema = new Schema('custom', {
      topNode: 'doc',
      nodes: {
        doc: { name: 'doc', group: 'document', content: 'block+' },
        p: { name: 'p', group: 'block', content: 'inline*' },
        tnode: { name: 'tnode', group: 'inline' } // Text type name is tnode
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);

    const doc = { sid: 'd', type: 'doc', content: ['p1'], attributes: {} } as any;
    const p1 = { sid: 'p1', type: 'p', content: ['a','b'], parentId: 'd', attributes: {} } as any;
    const a = { sid: 'a', type: 'tnode', text: 'Hello', parentId: 'p1', attributes: {} } as any;
    const b = { sid: 'b', type: 'tnode', text: ' World', parentId: 'p1', attributes: {} } as any;
    dataStore.setNode(doc, false);
    dataStore.setNode(p1, false);
    dataStore.setNode(a, false);
    dataStore.setNode(b, false);
  });

  it('treats nodes with .text as text regardless of type name', () => {
    dataStore.begin();
    dataStore.replaceText({ stype: 'range' as const, startNodeId: 'a', startOffset: 0, endNodeId: 'a', endOffset: 5 }, 'Hi');
    const ops = dataStore.end();
    // Ensure replaceText can at least take the update flow (should complete successfully even if collection method differs by implementation)
    expect(Array.isArray(ops)).toBe(true);
    dataStore.commit();
    const p1 = dataStore.getNode('p1')!;
    const text = p1.content!.map(id => dataStore.getNode(id as string)!.text || '').join('');
    expect(text).toContain('Hi');
  });
});


