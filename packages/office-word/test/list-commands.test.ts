import { describe, it, expect } from 'vitest';
import {
  definitionKind,
  freeNumberingId,
  listKindOf,
  listToJoin,
  numberingDefinition,
  INDENT_STEP,
  MAX_LIST_LEVEL
} from '../src/list-commands';
import { createNumberingResolver } from '../src/numbering-resolver';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/**
 * Turning a paragraph into a list item.
 *
 * Word has no list node: a list is paragraphs pointing at a numbering
 * definition, and the numbers are counted at render time. The product could
 * already render a list perfectly and had no way to make one — the shared kit's
 * list commands wrap blocks in a wrapper this schema does not read, so they
 * reported success and changed nothing.
 *
 * The definitions these commands write are checked by running the real resolver
 * over them, because a definition that produces no number is the same failure in
 * a different place.
 */
const docOf = (nodes: Record<string, DocumentNode>, rootId = 'root'): DocumentAccess => ({
  getNode: (id: string) => nodes[id],
  rootId
});

/** A document with a resources node and two paragraphs in a body. */
const scaffold = (): Record<string, DocumentNode> => ({
  root: { sid: 'root', stype: 'document', content: ['res', 'body'] },
  res: { sid: 'res', stype: 'resources', content: [] },
  body: { sid: 'body', stype: 'body', content: ['p1', 'p2'] },
  p1: { sid: 'p1', stype: 'paragraph', parentId: 'body', content: [] },
  p2: { sid: 'p2', stype: 'paragraph', parentId: 'body', content: [] }
});

/** Put a definition and some numbered paragraphs into a document. */
const withList = (kind: 'bullet' | 'ordered', id: string, levels: number[]) => {
  const nodes = scaffold();
  nodes[id] = numberingDefinition(kind, id) as DocumentNode;
  nodes[id].sid = id;
  nodes.res.content = [id];
  nodes.body.content = levels.map((_, index) => `n${index}`);
  levels.forEach((level, index) => {
    nodes[`n${index}`] = {
      sid: `n${index}`,
      stype: 'paragraph',
      parentId: 'body',
      attributes: { numId: id, numLevel: level },
      content: []
    };
  });
  return docOf(nodes);
};

describe('a new list definition', () => {
  it('covers every level Word offers', () => {
    const definition = numberingDefinition('bullet', 'bullet-1');
    expect(definition.content).toHaveLength(MAX_LIST_LEVEL + 1);
  });

  it('numbers a plain list by its own counter, not by its ancestors', () => {
    // `%1.%2.` is what makes "1.1, 1.2" — an outline. A reader pressing the
    // numbered-list button means a plain list.
    const doc = withList('ordered', 'ordered-1', [0, 0, 1, 1, 0]);
    const numbers = createNumberingResolver(doc)
      .items()
      .map((item) => item.text);
    expect(numbers).toEqual(['1.', '2.', 'a.', 'b.', '3.']);
  });

  it('restarts a sub-list when the level above advances', () => {
    // Without this the second sub-list continues the first, and a document with
    // two sections numbered a, b then c, d is wrong in a way that reads as a
    // counting bug.
    const doc = withList('ordered', 'ordered-1', [0, 1, 1, 0, 1]);
    expect(
      createNumberingResolver(doc)
        .items()
        .map((item) => item.text)
    ).toEqual(['1.', 'a.', 'b.', '2.', 'a.']);
  });

  it('cycles bullet glyphs by depth', () => {
    // A bullet has no counter to format, so its glyph is the whole pattern —
    // which only works because an unknown format contributes nothing.
    const doc = withList('bullet', 'bullet-1', [0, 1, 2, 3]);
    expect(
      createNumberingResolver(doc)
        .items()
        .map((item) => item.text)
    ).toEqual(['•', '○', '▪', '•']);
  });
});

describe('reading a list', () => {
  it('tells the two kinds apart by their first level', () => {
    const bullets = withList('bullet', 'bullet-1', [0]);
    const numbers = withList('ordered', 'ordered-1', [0]);
    expect(listKindOf(bullets, bullets.getNode('n0'))).toBe('bullet');
    expect(listKindOf(numbers, numbers.getNode('n0'))).toBe('ordered');
  });

  it('says nothing for a paragraph that is not in a list', () => {
    const doc = docOf(scaffold());
    expect(listKindOf(doc, doc.getNode('p1'))).toBeNull();
    expect(listKindOf(doc, undefined)).toBeNull();
  });

  it('says nothing when the definition a paragraph names is missing', () => {
    // A document can arrive naming a definition it does not carry, and a button
    // asking about it should answer rather than throw.
    const nodes = scaffold();
    nodes.p1.attributes = { numId: 'gone', numLevel: 0 };
    const doc = docOf(nodes);
    expect(listKindOf(doc, doc.getNode('p1'))).toBeNull();
    expect(definitionKind(doc, undefined)).toBeNull();
  });
});

describe('which list to join', () => {
  it('continues the list directly above, so numbering carries on', () => {
    // A reader who sees "1. 2." and makes the next line numbered expects "3.".
    const doc = withList('ordered', 'ordered-1', [0, 0]);
    const nodes = doc.getNode('body')!;
    nodes.content = ['n0', 'n1', 'p3'];
    (doc as any).getNode = (id: string) =>
      id === 'p3'
        ? { sid: 'p3', stype: 'paragraph', parentId: 'body', content: [] }
        : docOf({}).getNode(id) ?? (withList('ordered', 'ordered-1', [0, 0]) as any).getNode(id);

    const rebuilt = withList('ordered', 'ordered-1', [0, 0]);
    (rebuilt.getNode('body') as DocumentNode).content = ['n0', 'n1', 'p3'];
    (rebuilt as any).getNode = ((original) => (id: string) =>
      id === 'p3'
        ? { sid: 'p3', stype: 'paragraph', parentId: 'body', content: [] }
        : original(id))(rebuilt.getNode.bind(rebuilt));

    expect(listToJoin(rebuilt, rebuilt.getNode('p3'), 'ordered')).toBe('ordered-1');
  });

  it('starts its own list when the paragraph above is a different kind', () => {
    // Two unrelated lists must not share a counter.
    const doc = withList('bullet', 'bullet-1', [0, 0]);
    expect(listToJoin(doc, doc.getNode('n1'), 'ordered')).toBeNull();
  });

  it('starts its own list at the top of its parent', () => {
    const doc = withList('ordered', 'ordered-1', [0]);
    expect(listToJoin(doc, doc.getNode('n0'), 'ordered')).toBeNull();
  });
});

describe('naming a new definition', () => {
  it('avoids the ids already in the document', () => {
    const doc = withList('bullet', 'bullet-1', [0]);
    expect(freeNumberingId(doc, 'bullet')).toBe('bullet-2');
    expect(freeNumberingId(doc, 'ordered')).toBe('ordered-1');
  });
});

describe('the indent step', () => {
  it('is half an inch, in twips', () => {
    // Word's default tab, and what one press moves a paragraph that is not in a
    // list. In twips because that is what the document stores.
    expect(INDENT_STEP).toBe(720);
  });
});
