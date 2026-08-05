import { describe, it, expect } from 'vitest';
import { assignFootnotes, footnoteRefsIn, reserveFor } from '../src/footnotes';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/**
 * A footnote is referenced from the flow by a mark and its body lives in
 * resources. Deciding which page a body belongs on is a question about where the
 * breaks fell, and how much room it takes is what decides where they fall — so
 * the two are separated here: heights are measured once at a width pagination
 * never changes, and everything else follows from them.
 */
describe('finding the footnotes a block references', () => {
  const store = (nodes: Record<string, DocumentNode>): DocumentAccess => ({
    getNode: (id) => nodes[id],
    rootId: 'root'
  });

  it('reads them off the marks, in the order they appear', () => {
    const doc = store({
      p: { sid: 'p', stype: 'paragraph', content: ['t1', 't2'] },
      t1: { sid: 't1', stype: 'inline-text', text: 'a', marks: [{ stype: 'footnoteRef', attrs: { id: 'fn-2' } }] },
      t2: { sid: 't2', stype: 'inline-text', text: 'b', marks: [{ stype: 'footnoteRef', attrs: { id: 'fn-9' } }] }
    });

    expect(footnoteRefsIn(doc, doc.getNode('p')!)).toEqual(['fn-2', 'fn-9']);
  });

  it('ignores marks that are not references', () => {
    const doc = store({
      p: { sid: 'p', stype: 'paragraph', content: ['t1'] },
      t1: { sid: 't1', stype: 'inline-text', text: 'a', marks: [{ stype: 'bold' }, { stype: 'endnoteRef', attrs: { id: 'en-1' } }] }
    });

    expect(footnoteRefsIn(doc, doc.getNode('p')!)).toEqual([]);
  });

  it('reports a footnote referenced twice only once', () => {
    const doc = store({
      p: { sid: 'p', stype: 'paragraph', content: ['t1', 't2'] },
      t1: { sid: 't1', stype: 'inline-text', text: 'a', marks: [{ stype: 'footnoteRef', attrs: { id: 'fn-1' } }] },
      t2: { sid: 't2', stype: 'inline-text', text: 'b', marks: [{ stype: 'footnoteRef', attrs: { id: 'fn-1' } }] }
    });

    expect(footnoteRefsIn(doc, doc.getNode('p')!)).toEqual(['fn-1']);
  });
});

describe('putting each footnote on a page', () => {
  it('uses the page its reference starts on', () => {
    const result = assignFootnotes({
      refsByBlock: new Map([['b1', ['fn-1']], ['b3', ['fn-2']]]),
      pageOfBlock: new Map([['b1', 0], ['b2', 0], ['b3', 1]]),
      order: ['b1', 'b2', 'b3']
    });

    expect(result.byPage.get(0)).toEqual(['fn-1']);
    expect(result.byPage.get(1)).toEqual(['fn-2']);
  });

  it('numbers them in document order, not per page', () => {
    // A footnote is "note 4" for the whole document; renumbering it when a break
    // moves would make the text describe its own layout.
    const result = assignFootnotes({
      refsByBlock: new Map([['b1', ['a']], ['b2', ['b']], ['b3', ['c']]]),
      pageOfBlock: new Map([['b1', 0], ['b2', 1], ['b3', 1]]),
      order: ['b1', 'b2', 'b3']
    });

    expect([...result.numberOf.entries()]).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('still numbers a footnote whose block was not placed', () => {
    const result = assignFootnotes({
      refsByBlock: new Map([['b1', ['fn-1']]]),
      pageOfBlock: new Map(),
      order: ['b1']
    });

    expect(result.numberOf.get('fn-1')).toBe(1);
    expect(result.pageOf.has('fn-1')).toBe(false);
  });
});

describe('how much room a page owes its footnotes', () => {
  it('adds the separator once, however many notes there are', () => {
    const heights = new Map([['a', 20], ['b', 30]]);
    expect(reserveFor(['a', 'b'], heights, 12)).toBe(62);
  });

  it('reserves nothing for a note nobody has measured yet', () => {
    // The first pass draws no bodies, so nothing can have been measured, and a
    // guessed height would move breaks the next pass has to move back.
    expect(reserveFor(['a'], new Map(), 12)).toBe(0);
  });

  it('reserves nothing when a block references none', () => {
    expect(reserveFor(undefined, new Map([['a', 20]]), 12)).toBe(0);
    expect(reserveFor([], new Map([['a', 20]]), 12)).toBe(0);
  });
});
