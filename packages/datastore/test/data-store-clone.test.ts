import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

function createBasicSchema() {
  return new Schema('document', {
    nodes: {
      document: { content: 'block+' },
      paragraph: { content: 'inline*' },
      'inline-text': { content: 'text*', marks: ['bold', 'italic'] }
    },
    marks: { bold: {}, italic: {} }
  });
}

function seedDocument(ds: DataStore) {
  const doc = {
    sid: 'doc-1',
    stype: 'document',
    content: [
      {
        sid: 'para-1',
        stype: 'paragraph',
        content: [
          { sid: 'text-1', type: 'inline-text', text: 'Hello', marks: [{ stype: 'bold', range: [0, 5] }] },
          { sid: 'text-2', type: 'inline-text', text: ' World' }
        ]
      }
    ]
  } as any;
  ds.createNodeWithChildren(doc);
  ds['rootNodeId'] = 'doc-1';
}

describe('DataStore.clone()', () => {
  it('creates an isolated datastore: nodes map is deep-cloned and mutations do not affect original', () => {
    const ds = new (DataStore as any)() as DataStore;
    ds.registerSchema(createBasicSchema());
    seedDocument(ds);

    const clone = (ds as any).utility.clone() as DataStore;

    // mutate clone: change text, add new child
    clone.begin();
    clone.updateNode('text-1', { text: 'Hi' });
    const newId = clone.addChild('para-1', { stype: 'inline-text', text: '!!!' } as any);
    const ops = clone.end();

    // original remains unchanged
    expect(ds.getNode('text-1')?.text).toBe('Hello');
    const origChildren = ds.getNode('para-1')?.content || [];
    expect(origChildren.includes(newId)).toBe(false);

    // clone reflects mutations
    expect(clone.getNode('text-1')?.text).toBe('Hi');
    const clonedChildren = clone.getNode('para-1')?.content || [];
    expect(clonedChildren.includes(newId)).toBe(true);

    // operations are collected on clone only
    expect(Array.isArray(ops)).toBe(true);
    expect(ops.length).toBeGreaterThanOrEqual(2); // update + create (and parent update)
  });

  it('retains the same schema and validation behavior in the cloned datastore', () => {
    const ds = new (DataStore as any)() as DataStore;
    const schema = createBasicSchema();
    ds.registerSchema(schema);
    seedDocument(ds);

    const clone = (ds as any).utility.clone() as DataStore;

    // schema reference should be the same instance (shared config)
    expect((clone as any)._activeSchema).toBe((ds as any)._activeSchema);

    // validation results should match between original and clone for the same input
    const invalidNode = {
      sid: 'tmp-x',
      stype: 'inline-text',
      text: 'x',
      content: [{ sid: 'tmp-y', type: 'paragraph', content: [] }] as any
    } as any;

    const dsValidation = (ds as any).validateNode(invalidNode, (ds as any)._activeSchema);
    const cloneValidation = (clone as any).validateNode(invalidNode, (clone as any)._activeSchema);

    expect(dsValidation.valid).toBe(cloneValidation.valid);
    expect(JSON.stringify(dsValidation.errors || [])).toBe(JSON.stringify(cloneValidation.errors || []));
  });

  it('deep-copies marks and nested attributes so that mutations in clone do not affect original', () => {
    const ds = new (DataStore as any)() as DataStore;
    ds.registerSchema(createBasicSchema());
    seedDocument(ds);

    const clone = (ds as any).utility.clone() as DataStore;

    // mutate marks in clone
    const cm = clone.getNode('text-1')!.marks!;
    cm[0].range![0] = 1; // adjust start
    clone.updateNode('text-1', { marks: cm } as any, false);

    // original marks must remain unchanged
    const om = ds.getNode('text-1')!.marks!;
    expect(om[0].range![0]).toBe(0);

    // mutate attributes in clone
    clone.updateNode('text-1', { attributes: { class: 'a' } } as any, false);
    expect(ds.getNode('text-1')!.attributes?.class).toBeUndefined();
  });

  it('does not share operation collection buffers or event emission with the original', () => {
    const ds = new (DataStore as any)() as DataStore;
    ds.registerSchema(createBasicSchema());
    seedDocument(ds);

    let originalOps: any[] = [];
    const unsubscribe = ds.onOperation((op: any) => originalOps.push(op));

    const clone = (ds as any).utility.clone() as DataStore;

    // collect operations only on clone
    clone.begin();
    clone.updateNode('text-2', { text: ' Everyone' });
    const ops = clone.end();

    // original should not receive events from clone
    expect(originalOps.length).toBe(0);
    expect(ops.length).toBeGreaterThan(0);

    ds.offOperation(unsubscribe);
  });
});
