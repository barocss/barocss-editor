import { describe, it, expect } from 'vitest';
import {
  childrenOf,
  childOfType,
  indexResources,
  walkBlocks,
  type DocumentAccess,
  type DocumentNode
} from '../src/document-access';

/**
 * Reading the document tree.
 *
 * Every resolver in this package stands on these four functions — a style chain
 * walks resources, numbering walks blocks in reading order, the renderer asks
 * for children constantly. They had no tests of their own, so a fault in any of
 * them would have surfaced somewhere else entirely: as a wrong list number, or a
 * style that failed to inherit, several layers from the cause.
 *
 * They are pure functions over a plain object tree, which is the whole point of
 * `DocumentAccess` existing — so they can be pinned without a document, a store
 * or a browser.
 */
const docOf = (nodes: Record<string, DocumentNode>, rootId = 'root'): DocumentAccess => ({
  getNode: (id: string) => nodes[id],
  rootId
});

describe('children', () => {
  it('resolves ids and inline nodes alike', () => {
    // Both forms occur: a store keeps ids, an imported tree keeps nodes.
    const doc = docOf({
      root: { sid: 'root', content: ['a', { sid: 'inline', stype: 'paragraph' }] },
      a: { sid: 'a', stype: 'paragraph' }
    });
    expect(childrenOf(doc, doc.getNode('root')).map((n) => n.sid)).toEqual(['a', 'inline']);
  });

  it('drops ids the store cannot resolve rather than yielding holes', () => {
    // A dangling id is a broken document, but a renderer walking children should
    // draw what is there rather than fail on what is not.
    const doc = docOf({ root: { sid: 'root', content: ['a', 'missing'] }, a: { sid: 'a' } });
    expect(childrenOf(doc, doc.getNode('root')).map((n) => n.sid)).toEqual(['a']);
  });

  it('treats a node with no content, and no node at all, as childless', () => {
    const doc = docOf({ root: { sid: 'root' } });
    expect(childrenOf(doc, doc.getNode('root'))).toEqual([]);
    expect(childrenOf(doc, undefined)).toEqual([]);
  });

  it('finds the first child of a type, and nothing when there is none', () => {
    const doc = docOf({
      root: { sid: 'root', content: ['p', 's1', 's2'] },
      p: { sid: 'p', stype: 'paragraph' },
      s1: { sid: 's1', stype: 'section' },
      s2: { sid: 's2', stype: 'section' }
    });
    expect(childOfType(doc, doc.getNode('root'), 'section')?.sid).toBe('s1');
    expect(childOfType(doc, doc.getNode('root'), 'table')).toBeUndefined();
  });
});

describe('resources', () => {
  it('indexes them by their declared id, not by sid', () => {
    // Styles refer to each other by `id` — `basedOn: 'Normal'` — so that is the
    // key resolution needs.
    const doc = docOf({
      root: { sid: 'root', content: ['res'] },
      res: { sid: 'res', stype: 'resources', content: ['s1', 's2'] },
      s1: { sid: 's1', stype: 'style', attributes: { id: 'Normal' } },
      s2: { sid: 's2', stype: 'style', attributes: { id: 'Heading1' } }
    });
    const index = indexResources(doc);
    expect([...index.keys()]).toEqual(['Normal', 'Heading1']);
    expect(index.get('Heading1')?.sid).toBe('s2');
  });

  it('skips a resource with no id, and yields nothing when there is no resources node', () => {
    const doc = docOf({
      root: { sid: 'root', content: ['res'] },
      res: { sid: 'res', stype: 'resources', content: ['s1'] },
      s1: { sid: 's1', stype: 'style' }
    });
    expect(indexResources(doc).size).toBe(0);
    expect(indexResources(docOf({ root: { sid: 'root' } })).size).toBe(0);
  });
});

describe('walking blocks', () => {
  it('yields them in reading order, including those nested in a table', () => {
    // Numbering depends on this: a counter that skips paragraphs inside table
    // cells produces list numbers that are wrong from that point on.
    const doc = docOf({
      root: { sid: 'root', content: ['p1', 'tbl', 'p3'] },
      p1: { sid: 'p1', stype: 'paragraph' },
      tbl: { sid: 'tbl', stype: 'table', content: ['row'] },
      row: { sid: 'row', stype: 'row', content: ['cell'] },
      cell: { sid: 'cell', stype: 'cell', content: ['p2'] },
      p2: { sid: 'p2', stype: 'paragraph' },
      p3: { sid: 'p3', stype: 'paragraph' }
    });
    expect([...walkBlocks(doc, doc.getNode('root'))].map((n) => n.sid)).toEqual([
      'p1',
      'tbl',
      'row',
      'cell',
      'p2',
      'p3'
    ]);
  });

  it('does not walk into resources or metadata', () => {
    // Style definitions contain paragraph properties, not paragraphs; counting
    // them as blocks would advance a list counter for text nobody reads.
    const doc = docOf({
      root: { sid: 'root', content: ['res', 'meta', 'p1'] },
      res: { sid: 'res', stype: 'resources', content: ['s1'] },
      s1: { sid: 's1', stype: 'style' },
      meta: { sid: 'meta', stype: 'docMeta', content: ['t'] },
      t: { sid: 't', stype: 'title' },
      p1: { sid: 'p1', stype: 'paragraph' }
    });
    expect([...walkBlocks(doc, doc.getNode('root'))].map((n) => n.sid)).toEqual(['p1']);
  });

  it('stops rather than hanging when the tree contains a cycle', () => {
    // A malformed tree should not be able to lock up a render.
    const doc = docOf({
      root: { sid: 'root', content: ['a'] },
      a: { sid: 'a', stype: 'paragraph', content: ['a'] }
    });
    expect([...walkBlocks(doc, doc.getNode('root'))].length).toBeLessThanOrEqual(66);
  });
});
