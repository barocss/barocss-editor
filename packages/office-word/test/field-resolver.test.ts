import { describe, it, expect } from 'vitest';
import { createFieldResolver } from '../src/field-resolver';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/**
 * Caption numbers and the references to them are facts about the document, not
 * text in it. A caption that stored "Figure 3" would be wrong the moment a
 * figure was inserted above it.
 */
const doc = (nodes: Record<string, DocumentNode>): DocumentAccess => ({
  getNode: (id) => nodes[id],
  rootId: 'root'
});

describe('caption numbers', () => {
  it('counts each sequence separately, in document order', () => {
    // Figures and tables are numbered apart, which is why the field names one
    const store = doc({
      root: { sid: 'root', stype: 'document', content: ['s'] },
      s: { sid: 's', stype: 'surface', content: ['p1', 'p2', 'p3'] },
      p1: { sid: 'p1', stype: 'paragraph', content: ['f1'] },
      p2: { sid: 'p2', stype: 'paragraph', content: ['t1'] },
      p3: { sid: 'p3', stype: 'paragraph', content: ['f2'] },
      f1: { sid: 'f1', stype: 'fieldSeq', attributes: { sequence: 'Figure' } },
      t1: { sid: 't1', stype: 'fieldSeq', attributes: { sequence: 'Table' } },
      f2: { sid: 'f2', stype: 'fieldSeq', attributes: { sequence: 'Figure' } }
    });

    const fields = createFieldResolver(store);
    expect(fields.sequenceNumber('f1')).toBe('1');
    expect(fields.sequenceNumber('t1')).toBe('1');
    expect(fields.sequenceNumber('f2')).toBe('2');
  });

  it('writes the number in the format the field asks for', () => {
    const store = doc({
      root: { sid: 'root', stype: 'document', content: ['s'] },
      s: { sid: 's', stype: 'surface', content: ['p1'] },
      p1: { sid: 'p1', stype: 'paragraph', content: ['f1'] },
      f1: { sid: 'f1', stype: 'fieldSeq', attributes: { sequence: 'Figure', format: 'upperRoman' } }
    });

    expect(createFieldResolver(store).sequenceNumber('f1')).toBe('I');
  });
});

describe('references to a bookmark', () => {
  const store = doc({
    root: { sid: 'root', stype: 'document', content: ['s'] },
    s: { sid: 's', stype: 'surface', content: ['caption', 'before', 'after'] },
    caption: { sid: 'caption', stype: 'paragraph', content: ['ct'] },
    ct: {
      sid: 'ct',
      stype: 'inline-text',
      text: 'Table 1: a merged header',
      marks: [{ stype: 'bookmark', range: [9, 24], attrs: { name: 'tbl' } }]
    },
    before: { sid: 'before', stype: 'paragraph', content: ['r1'] },
    r1: { sid: 'r1', stype: 'fieldRef', attributes: { targetId: 'tbl' } },
    after: { sid: 'after', stype: 'paragraph', content: [] }
  });

  it('shows what is inside the bookmark, not the node around it', () => {
    // Otherwise "see X" quotes the punctuation and the words either side
    expect(createFieldResolver(store).reference('tbl', 'text')).toBe('a merged header');
  });

  it('says whether the target is above or below the reference', () => {
    const fields = createFieldResolver(store);
    expect(fields.reference('tbl', 'aboveBelow', 'after')).toBe('above');
    expect(fields.reference('tbl', 'aboveBelow', 'caption')).toBe('below');
  });

  it('reports a page reference as unresolved rather than guessing', () => {
    // Which page a bookmark is on is a layout fact, and this resolver has none
    expect(createFieldResolver(store).reference('tbl', 'pageNumber')).toBeUndefined();
  });

  it('reports a reference to something that is gone', () => {
    // A dangling reference is a fact the author needs, not something to hide
    expect(createFieldResolver(store).reference('missing', 'text')).toBeUndefined();
  });
});

describe('the running heading a header shows', () => {
  const store = doc({
    root: { sid: 'root', stype: 'document', content: ['s'] },
    s: { sid: 's', stype: 'surface', content: ['h1', 'p1', 'h2', 'p2'] },
    h1: { sid: 'h1', stype: 'heading', attributes: { styleId: 'Heading1' }, content: ['h1t'] },
    h1t: { sid: 'h1t', stype: 'inline-text', text: 'First chapter' },
    p1: { sid: 'p1', stype: 'paragraph', content: [] },
    h2: { sid: 'h2', stype: 'heading', attributes: { styleId: 'Heading1' }, content: ['h2t'] },
    h2t: { sid: 'h2t', stype: 'inline-text', text: 'Second chapter' },
    p2: { sid: 'p2', stype: 'paragraph', content: [] }
  });

  it('takes the first heading above the field', () => {
    expect(createFieldResolver(store).styleReference('Heading1', 'p1', false)).toBe('First chapter');
  });

  it('takes the last one when asked to search from the bottom', () => {
    // Which is what a header for a spread wants
    expect(createFieldResolver(store).styleReference('Heading1', 'p2', true)).toBe('Second chapter');
  });

  it('shows nothing when no heading in that style comes before it', () => {
    expect(createFieldResolver(store).styleReference('Heading9', 'p2', false)).toBeUndefined();
  });
});
