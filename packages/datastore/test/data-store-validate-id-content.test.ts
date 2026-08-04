import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

/**
 * Stored content is an array of child ids, but a content model is expressed over
 * node types. Validation has to resolve the ids first — handed the raw array it
 * sees strings with no `stype` and rejects every persisted node with
 * "unknown type 'undefined'".
 *
 * That is why transformNode could never convert a paragraph to a heading: it
 * validates the would-be node before writing it, and validation always failed.
 */
describe('validation against id-based content', () => {
  let ds: DataStore;

  beforeEach(() => {
    const schema = new Schema('t', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        heading: {
          name: 'heading',
          group: 'block',
          content: 'inline*',
          attrs: { level: { type: 'number', required: true } }
        },
        list: { name: 'list', group: 'block', content: 'listItem+' },
        listItem: { name: 'listItem', group: 'block', content: 'block+' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {}
    });
    ds = new DataStore(undefined, schema);
    ds.setNode({ sid: 'doc', stype: 'document', content: ['p1'], attributes: {} } as any, false);
    ds.setNode({ sid: 'p1', stype: 'paragraph', content: ['t1'], parentId: 'doc', attributes: {} } as any, false);
    ds.setNode({ sid: 't1', stype: 'inline-text', text: 'hi', parentId: 'p1', attributes: {} } as any, false);
  });

  it('accepts a persisted node whose content is stored as ids', () => {
    const node = ds.getNode('p1')!;
    expect(node.content).toEqual(['t1']);
    expect(ds.validateNode(node).valid).toBe(true);
  });

  it('still rejects content that genuinely violates the model', () => {
    ds.setNode({ sid: 'l1', stype: 'list', content: ['p2'], attributes: {} } as any, false);
    ds.setNode({ sid: 'p2', stype: 'paragraph', content: [], parentId: 'l1', attributes: {} } as any, false);

    const result = ds.validateNode(ds.getNode('l1')!);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('paragraph');
  });

  it('transformNode converts a paragraph to a heading', () => {
    const result = ds.transformNode('p1', 'heading', { level: 1 });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(ds.getNode('p1')?.stype).toBe('heading');
    expect(ds.getNode('p1')?.attributes?.level).toBe(1);
  });

  it('transformNode keeps the node id, its children and its position', () => {
    ds.setNode({ sid: 'p9', stype: 'paragraph', content: [], parentId: 'doc', attributes: {} } as any, false);
    ds.updateNode('doc', { content: ['p1', 'p9'] } as any, false);

    ds.transformNode('p1', 'heading', { level: 2 });

    expect(ds.getNode('doc')?.content).toEqual(['p1', 'p9']);
    expect(ds.getNode('p1')?.content).toEqual(['t1']);
    expect(ds.getNode('t1')?.text).toBe('hi');
  });

  it('transformNode refuses a conversion the schema does not allow', () => {
    // 'list' requires listItem children; p1 holds inline-text
    const result = ds.transformNode('p1', 'list');

    expect(result.valid).toBe(false);
    expect(ds.getNode('p1')?.stype).toBe('paragraph');
  });
});
