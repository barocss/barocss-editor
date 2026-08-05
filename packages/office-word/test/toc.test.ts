import { describe, it, expect } from 'vitest';
import { parseLevels, tocEntries } from '../src/toc';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/**
 * A table of contents is generated, never stored. A heading's page number is a
 * fact about the current layout, and writing it into the document would make the
 * text describe a layout it no longer has — which is what a table of contents
 * pasted as plain text does.
 */
describe('the levels a table lists', () => {
  it('reads Word’s range notation', () => {
    expect(parseLevels('1-3')).toEqual({ from: 1, to: 3 });
    expect(parseLevels('2-4')).toEqual({ from: 2, to: 4 });
  });

  it('takes a single number as that level alone', () => {
    // Which is how a table of figures ends up listing one style
    expect(parseLevels('2')).toEqual({ from: 2, to: 2 });
  });

  it('accepts a backwards range rather than listing nothing', () => {
    expect(parseLevels('3-1')).toEqual({ from: 1, to: 3 });
  });

  it('falls back to Word’s default when it cannot read the value', () => {
    expect(parseLevels(undefined)).toEqual({ from: 1, to: 3 });
    expect(parseLevels('all of them')).toEqual({ from: 1, to: 3 });
  });
});

describe('choosing what to list', () => {
  const doc = (nodes: Record<string, DocumentNode>): DocumentAccess => ({
    getNode: (id) => nodes[id],
    rootId: 'root'
  });

  const heading = (sid: string, level: number, text: string, styleId?: string): Record<string, DocumentNode> => ({
    [sid]: { sid, stype: 'heading', attributes: { level, ...(styleId ? { styleId } : {}) }, content: [`${sid}-t`] },
    [`${sid}-t`]: { sid: `${sid}-t`, stype: 'inline-text', text }
  });

  it('lists headings in the range, with the page each landed on', () => {
    const store = doc({
      s: { sid: 's', stype: 'surface', content: ['h1', 'h2', 'p'] },
      ...heading('h1', 1, 'One'),
      ...heading('h2', 2, 'Two'),
      p: { sid: 'p', stype: 'paragraph', content: [] }
    });

    const entries = tocEntries({
      doc: store,
      surface: store.getNode('s')!,
      levels: '1-2',
      pageOfBlock: new Map([['h1', 0], ['h2', 2]])
    });

    expect(entries).toEqual([
      { sid: 'h1', level: 1, text: 'One', page: 0 },
      { sid: 'h2', level: 2, text: 'Two', page: 2 }
    ]);
  });

  it('leaves out headings deeper than the range', () => {
    const store = doc({
      s: { sid: 's', stype: 'surface', content: ['h1', 'h3'] },
      ...heading('h1', 1, 'One'),
      ...heading('h3', 3, 'Three')
    });

    const entries = tocEntries({ doc: store, surface: store.getNode('s')!, levels: '1-2' });
    expect(entries.map((e) => e.text)).toEqual(['One']);
  });

  it('can select by style, for a table of figures', () => {
    const store = doc({
      s: { sid: 's', stype: 'surface', content: ['h1', 'h2'] },
      ...heading('h1', 1, 'Chapter', 'Heading1'),
      ...heading('h2', 1, 'Figure', 'Caption')
    });

    const entries = tocEntries({
      doc: store,
      surface: store.getNode('s')!,
      levels: '1',
      styleFilter: 'Caption'
    });
    expect(entries.map((e) => e.text)).toEqual(['Figure']);
  });

  it('skips a heading with no text', () => {
    // An empty line should not become an empty line with a page number by it
    const store = doc({
      s: { sid: 's', stype: 'surface', content: ['h1'] },
      ...heading('h1', 1, '   ')
    });

    expect(tocEntries({ doc: store, surface: store.getNode('s')!, levels: '1' })).toEqual([]);
  });

  it('lists a heading that has not been laid out yet, without a page', () => {
    // A document rendered before anything is measured still shows its contents
    const store = doc({
      s: { sid: 's', stype: 'surface', content: ['h1'] },
      ...heading('h1', 1, 'One')
    });

    const entries = tocEntries({ doc: store, surface: store.getNode('s')!, levels: '1' });
    expect(entries[0].page).toBeUndefined();
  });
});
