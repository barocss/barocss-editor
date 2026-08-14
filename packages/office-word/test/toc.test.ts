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

/**
 * The second kind of block Word lists.
 *
 * A paragraph that names an `outlineLevel` appears in the contents at that
 * level, whatever it looks like — which is how a document lists a figure
 * caption, a part title set in the body face, or an appendix marker without
 * making any of them a heading. The attribute has been in the schema since
 * paragraph formatting was, with a comment saying it drives the navigation pane
 * and the contents, and nothing read it: only `heading` nodes were listed.
 */
describe('a paragraph that asks to be listed', () => {
  const doc = (nodes: Record<string, DocumentNode>): DocumentAccess => ({
    getNode: (id) => nodes[id],
    rootId: 'root'
  });

  const block = (
    sid: string,
    stype: string,
    attributes: Record<string, unknown>,
    text: string
  ): Record<string, DocumentNode> => ({
    [sid]: { sid, stype, attributes, content: [`${sid}-t`] },
    [`${sid}-t`]: { sid: `${sid}-t`, stype: 'inline-text', text }
  });

  const listing = (nodes: Record<string, DocumentNode>, order: string[], levels = '1-3') => {
    const store = doc({ s: { sid: 's', stype: 'surface', content: order }, ...nodes });
    return tocEntries({ doc: store, surface: store.getNode('s')!, levels }).map((entry) => [
      entry.sid,
      entry.level
    ]);
  };

  it('lists it, one level up from the number Word stores', () => {
    // Word counts outline levels from zero and contents levels from one
    expect(
      listing(
        {
          ...block('h', 'heading', { level: 1 }, 'A heading'),
          ...block('p', 'paragraph', { outlineLevel: 1 }, 'A caption')
        },
        ['h', 'p']
      )
    ).toEqual([
      ['h', 1],
      ['p', 2]
    ]);
  });

  it('leaves an ordinary paragraph out', () => {
    expect(
      listing({ ...block('p', 'paragraph', {}, 'Body text') }, ['p'])
    ).toEqual([]);
  });

  it('takes an explicit level over the heading’s own', () => {
    // Which is what puts a Heading 3 in the contents at the top level
    expect(
      listing({ ...block('h', 'heading', { level: 3, outlineLevel: 0 }, 'Part one') }, ['h'])
    ).toEqual([['h', 1]]);
  });

  it('leaves out the level Word names body text', () => {
    // 9 is a value, not an absence: a paragraph set to it has been told to stay
    // out of the contents
    expect(
      listing({ ...block('p', 'paragraph', { outlineLevel: 9 }, 'Not listed') }, ['p'], '1-9')
    ).toEqual([]);
  });

  it('still honours the range it was asked for', () => {
    expect(
      listing(
        {
          ...block('a', 'paragraph', { outlineLevel: 0 }, 'One'),
          ...block('b', 'paragraph', { outlineLevel: 4 }, 'Five')
        },
        ['a', 'b'],
        '1-3'
      )
    ).toEqual([['a', 1]]);
  });

  it('skips one with nothing written in it', () => {
    const store = doc({
      s: { sid: 's', stype: 'surface', content: ['p'] },
      p: { sid: 'p', stype: 'paragraph', attributes: { outlineLevel: 0 }, content: [] }
    });
    expect(tocEntries({ doc: store, surface: store.getNode('s')! })).toEqual([]);
  });
});
