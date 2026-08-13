import { describe, it, expect } from 'vitest';
import { suppressedSpacing } from '../src/spacing';
import { createStyleResolver } from '../src/style-resolver';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/**
 * "Don't add space between paragraphs of the same style" is a statement about a
 * paragraph's neighbours, which is what makes it worth its own rule: the
 * renderer and the paginator both have to reach the same answer, and neither can
 * reach it from the paragraph alone.
 */
function docOf(nodes: DocumentNode[], rootId = 'doc'): DocumentAccess {
  const index = new Map(nodes.map((n) => [n.sid!, n]));
  return { getNode: (id) => index.get(id), rootId };
}

const item = (sid: string, attributes: Record<string, unknown> = {}): DocumentNode => ({
  sid,
  stype: 'listItem',
  parentId: 'list',
  attributes,
  content: []
});

/** A list of three items in a style that suppresses the space between them. */
function listOf(itemAttrs: Record<string, unknown>[], styleAttrs: Record<string, unknown> = {}) {
  return docOf([
    { sid: 'doc', stype: 'document', content: ['surface', 'resources'] },
    { sid: 'surface', stype: 'surface', content: ['before', 'list', 'after'] },
    { sid: 'before', stype: 'paragraph', parentId: 'surface', attributes: {}, content: [] },
    {
      sid: 'list',
      stype: 'list',
      parentId: 'surface',
      attributes: {},
      content: itemAttrs.map((_, at) => `i${at}`)
    },
    ...itemAttrs.map((attrs, at) => item(`i${at}`, attrs)),
    { sid: 'after', stype: 'paragraph', parentId: 'surface', attributes: {}, content: [] },
    { sid: 'resources', stype: 'resources', content: ['tight'] },
    {
      sid: 'tight',
      stype: 'styleDef',
      attributes: {
        id: 'ListParagraph',
        name: 'List Paragraph',
        type: 'paragraph',
        spacingBefore: 160,
        spacingAfter: 160,
        contextualSpacing: true,
        ...styleAttrs
      }
    }
  ]);
}

describe('space between paragraphs of the same style', () => {
  const tight = [{ styleId: 'ListParagraph' }, { styleId: 'ListParagraph' }, { styleId: 'ListParagraph' }];

  it('is given up in the middle of a run and kept at its ends', () => {
    const doc = listOf(tight);
    const styles = createStyleResolver(doc);
    const of = (sid: string) => suppressedSpacing(doc, styles, doc.getNode(sid)!);

    // The first item keeps the space above it and gives up the space below
    expect(of('i0')).toEqual({ before: false, after: true });
    expect(of('i1')).toEqual({ before: true, after: true });
    expect(of('i2')).toEqual({ before: true, after: false });
  });

  it('does nothing for a paragraph that did not ask', () => {
    // The property is the paragraph's own, and the style is where it usually
    // lives — a list without it is a column of separated paragraphs.
    const doc = listOf(tight, { contextualSpacing: false });
    const styles = createStyleResolver(doc);
    expect(suppressedSpacing(doc, styles, doc.getNode('i1')!)).toEqual({
      before: false,
      after: false
    });
  });

  it('keeps the space where the neighbour is something else', () => {
    // Same-style is the whole condition: an item between two items of another
    // style is a paragraph with space on both sides.
    const doc = listOf([
      { styleId: 'ListParagraph' },
      { styleId: 'Quote', contextualSpacing: true },
      { styleId: 'ListParagraph' }
    ]);
    const styles = createStyleResolver(doc);
    expect(suppressedSpacing(doc, styles, doc.getNode('i1')!)).toEqual({
      before: false,
      after: false
    });
  });

  it('does not call two unstyled blocks of different kinds the same style', () => {
    // Comparing style ids alone makes every unstyled block in a document
    // identical to every other, and a heading would lose the space under it.
    const doc = docOf([
      { sid: 'doc', stype: 'document', content: ['surface'] },
      { sid: 'surface', stype: 'surface', content: ['h', 'p'] },
      {
        sid: 'h',
        stype: 'heading',
        parentId: 'surface',
        attributes: { contextualSpacing: true },
        content: []
      },
      {
        sid: 'p',
        stype: 'paragraph',
        parentId: 'surface',
        attributes: { contextualSpacing: true },
        content: []
      }
    ]);
    const styles = createStyleResolver(doc);
    expect(suppressedSpacing(doc, styles, doc.getNode('h')!).after).toBe(false);
    expect(suppressedSpacing(doc, styles, doc.getNode('p')!).before).toBe(false);
  });

  it('answers with nothing when there is nothing to compare against', () => {
    const doc = listOf(tight);
    const styles = createStyleResolver(doc);
    const loose = { sid: 'orphan', stype: 'paragraph', attributes: { contextualSpacing: true } };

    expect(suppressedSpacing(doc, styles, loose)).toEqual({ before: false, after: false });
    expect(suppressedSpacing(undefined, styles, doc.getNode('i1')!)).toEqual({
      before: false,
      after: false
    });
  });
});
