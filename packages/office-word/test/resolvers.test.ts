import { describe, it, expect } from 'vitest';
import { createStyleResolver } from '../src/style-resolver';
import { createNumberingResolver } from '../src/numbering-resolver';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/** Build a DocumentAccess over a flat map of nodes. */
function docOf(nodes: DocumentNode[], rootId = 'doc'): DocumentAccess {
  const index = new Map(nodes.map((n) => [n.sid!, n]));
  return { getNode: (id) => index.get(id), rootId };
}

const para = (sid: string, attributes: Record<string, unknown> = {}): DocumentNode => ({
  sid,
  stype: 'paragraph',
  attributes,
  content: []
});

describe('style resolution', () => {
  const doc = docOf([
    { sid: 'doc', stype: 'document', content: ['surface', 'resources'] },
    { sid: 'surface', stype: 'surface', content: ['p1', 'p2', 'p3'] },
    para('p1', { styleId: 'Heading1' }),
    para('p2', { styleId: 'Heading1', alignment: 'center' }),
    para('p3', {}),
    { sid: 'resources', stype: 'resources', content: ['defaults', 'normal', 'h1'] },
    {
      sid: 'defaults',
      stype: 'docDefaults',
      attributes: { fontFamily: 'Calibri', fontSize: 22, alignment: 'left', spacingAfter: 160 }
    },
    {
      sid: 'normal',
      stype: 'styleDef',
      attributes: { id: 'Normal', name: 'Normal', type: 'paragraph', spacingAfter: 200 }
    },
    {
      sid: 'h1',
      stype: 'styleDef',
      attributes: {
        id: 'Heading1',
        name: 'Heading 1',
        type: 'paragraph',
        basedOn: 'Normal',
        next: 'Normal',
        alignment: 'left',
        spacingBefore: 480,
        fontSize: 32,
        bold: true,
        keepNext: true
      }
    }
  ]);

  const resolver = createStyleResolver(doc);

  it('walks basedOn root-first', () => {
    expect(resolver.chainFor('Heading1').map((s) => s.attributes?.id)).toEqual([
      'Normal',
      'Heading1'
    ]);
  });

  it('layers defaults, then the style chain, then direct formatting', () => {
    const format = resolver.resolveNode(doc.getNode('p2')!);

    expect(format.alignment).toBe('center'); // direct beats the style
    expect(format.spacingBefore).toBe(480); // from Heading1
    expect(format.spacingAfter).toBe(200); // Normal beats docDefaults
  });

  it('falls back to the style when there is no direct formatting', () => {
    expect(resolver.resolveNode(doc.getNode('p1')!).alignment).toBe('left');
  });

  it('falls back to document defaults when nothing else says', () => {
    const format = resolver.resolveNode(doc.getNode('p3')!);
    expect(format.alignment).toBe('left');
    expect(format.spacingAfter).toBe(160);
  });

  it('never cascades a style’s identity onto the node', () => {
    // Copying `name` down would put "Heading 1" on every paragraph using it
    const format = resolver.resolveNode(doc.getNode('p1')!);
    expect(format.name).toBeUndefined();
    expect(format.basedOn).toBeUndefined();
    expect(format.styleId).toBeUndefined();
  });

  it('keeps paragraph and character properties in their own scopes', () => {
    expect(resolver.resolveNode(doc.getNode('p1')!, 'paragraph').fontSize).toBeUndefined();
    expect(resolver.resolveNode(doc.getNode('p1')!, 'character').fontSize).toBe(32);
    expect(resolver.resolveNode(doc.getNode('p1')!, 'character').alignment).toBeUndefined();
  });

  it('reports the style that follows one, so Enter leaves a heading', () => {
    expect(resolver.nextStyleAfter('Heading1')).toBe('Normal');
    // no `next` means "stay put", which is what body styles do
    expect(resolver.nextStyleAfter('Normal')).toBe('Normal');
  });

  it('survives a basedOn cycle instead of hanging', () => {
    const cyclic = docOf([
      { sid: 'doc', stype: 'document', content: ['resources'] },
      { sid: 'resources', stype: 'resources', content: ['a', 'b'] },
      { sid: 'a', stype: 'styleDef', attributes: { id: 'A', name: 'A', basedOn: 'B' } },
      { sid: 'b', stype: 'styleDef', attributes: { id: 'B', name: 'B', basedOn: 'A' } }
    ]);
    expect(createStyleResolver(cyclic).chainFor('A')).toHaveLength(2);
  });

  it('layers a character style mark over the paragraph’s own formatting', () => {
    const withMark = docOf([
      { sid: 'doc', stype: 'document', content: ['surface', 'resources'] },
      { sid: 'surface', stype: 'surface', content: ['t1'] },
      {
        sid: 't1',
        stype: 'inline-text',
        text: 'hello world',
        attributes: { fontSize: 22 },
        marks: [{ stype: 'charStyle', range: [0, 5], attrs: { styleId: 'Emphasis' } }]
      },
      { sid: 'resources', stype: 'resources', content: ['em'] },
      {
        sid: 'em',
        stype: 'styleDef',
        attributes: { id: 'Emphasis', name: 'Emphasis', type: 'character', italic: true, fontSize: 28 }
      }
    ]);
    const r = createStyleResolver(withMark);
    const node = withMark.getNode('t1')!;

    expect(r.resolveTextRun(node, 2).italic).toBe(true);
    expect(r.resolveTextRun(node, 2).fontSize).toBe(28);
    // outside the mark's range the paragraph's own formatting stands
    expect(r.resolveTextRun(node, 8).italic).toBeUndefined();
    expect(r.resolveTextRun(node, 8).fontSize).toBe(22);
  });

  it('treats an unset property as inherit and an explicit false as off', () => {
    const doc2 = docOf([
      { sid: 'doc', stype: 'document', content: ['surface', 'resources'] },
      { sid: 'surface', stype: 'surface', content: ['p'] },
      { sid: 'p', stype: 'paragraph', attributes: { styleId: 'Quiet' } },
      { sid: 'resources', stype: 'resources', content: ['base', 'quiet'] },
      { sid: 'base', stype: 'styleDef', attributes: { id: 'Base', name: 'Base', bold: true } },
      {
        sid: 'quiet',
        stype: 'styleDef',
        attributes: { id: 'Quiet', name: 'Quiet', basedOn: 'Base', bold: false }
      }
    ]);
    expect(createStyleResolver(doc2).resolveNode(doc2.getNode('p')!, 'character').bold).toBe(false);
  });
});

describe('numbering resolution', () => {
  const level = (
    lvl: number,
    format: string,
    text: string,
    extra: Record<string, unknown> = {}
  ): DocumentNode => ({
    sid: `lvl${lvl}${format}${text}`,
    stype: 'numberingLevel',
    attributes: { level: lvl, format, text, start: 1, suffix: 'tab', ...extra }
  });

  const buildDoc = (paragraphs: DocumentNode[], levels: DocumentNode[]): DocumentAccess =>
    docOf([
      { sid: 'doc', stype: 'document', content: ['surface', 'resources'] },
      { sid: 'surface', stype: 'surface', content: paragraphs.map((p) => p.sid!) },
      ...paragraphs,
      { sid: 'resources', stype: 'resources', content: ['num1'] },
      {
        sid: 'num1',
        stype: 'numberingDef',
        attributes: { id: 'n1' },
        content: levels.map((l) => l.sid!)
      },
      ...levels
    ]);

  it('counts a flat list', () => {
    const doc = buildDoc(
      ['a', 'b', 'c'].map((id) => para(id, { numId: 'n1', numLevel: 0 })),
      [level(0, 'decimal', '%1.')]
    );
    const r = createNumberingResolver(doc);

    expect(r.numberFor('a')?.text).toBe('1.');
    expect(r.numberFor('b')?.text).toBe('2.');
    expect(r.numberFor('c')?.text).toBe('3.');
  });

  it('builds a multi-level number from every counter above it', () => {
    const doc = buildDoc(
      [
        para('a', { numId: 'n1', numLevel: 0 }),
        para('a1', { numId: 'n1', numLevel: 1 }),
        para('a2', { numId: 'n1', numLevel: 1 }),
        para('b', { numId: 'n1', numLevel: 0 }),
        para('b1', { numId: 'n1', numLevel: 1 })
      ],
      [level(0, 'decimal', '%1.'), level(1, 'decimal', '%1.%2.')]
    );
    const r = createNumberingResolver(doc);

    expect(r.numberFor('a')?.text).toBe('1.');
    expect(r.numberFor('a1')?.text).toBe('1.1.');
    expect(r.numberFor('a2')?.text).toBe('1.2.');
    expect(r.numberFor('b')?.text).toBe('2.');
    // the deeper level restarted when the shallower one advanced
    expect(r.numberFor('b1')?.text).toBe('2.1.');
  });

  it('mixes formats per level', () => {
    const doc = buildDoc(
      [
        para('a', { numId: 'n1', numLevel: 0 }),
        para('a1', { numId: 'n1', numLevel: 1 }),
        para('a1i', { numId: 'n1', numLevel: 2 }),
        para('a1ii', { numId: 'n1', numLevel: 2 })
      ],
      [
        level(0, 'decimal', '%1.'),
        level(1, 'lowerLetter', '%2.'),
        level(2, 'lowerRoman', '%3.')
      ]
    );
    const r = createNumberingResolver(doc);

    expect(r.numberFor('a')?.text).toBe('1.');
    expect(r.numberFor('a1')?.text).toBe('a.');
    expect(r.numberFor('a1i')?.text).toBe('i.');
    expect(r.numberFor('a1ii')?.text).toBe('ii.');
  });

  it('honours a start value other than 1', () => {
    const doc = buildDoc(
      [para('a', { numId: 'n1', numLevel: 0 }), para('b', { numId: 'n1', numLevel: 0 })],
      [level(0, 'decimal', '%1.', { start: 5 })]
    );
    const r = createNumberingResolver(doc);

    expect(r.numberFor('a')?.text).toBe('5.');
    expect(r.numberFor('b')?.text).toBe('6.');
  });

  it('renders a bullet level as its literal text', () => {
    const doc = buildDoc(
      [para('a', { numId: 'n1', numLevel: 0 })],
      [level(0, 'bullet', '▪')]
    );
    expect(createNumberingResolver(doc).numberFor('a')?.text).toBe('▪');
  });

  it('numbers paragraphs nested inside other blocks', () => {
    // A list inside a table cell is still part of the document's reading order
    const doc = docOf([
      { sid: 'doc', stype: 'document', content: ['surface', 'resources'] },
      { sid: 'surface', stype: 'surface', content: ['p0', 'cell'] },
      para('p0', { numId: 'n1', numLevel: 0 }),
      { sid: 'cell', stype: 'bTableCell', content: ['p1'] },
      para('p1', { numId: 'n1', numLevel: 0 }),
      { sid: 'resources', stype: 'resources', content: ['num1'] },
      { sid: 'num1', stype: 'numberingDef', attributes: { id: 'n1' }, content: ['l0'] },
      {
        sid: 'l0',
        stype: 'numberingLevel',
        attributes: { level: 0, format: 'decimal', text: '%1.', start: 1 }
      }
    ]);
    const r = createNumberingResolver(doc);

    expect(r.numberFor('p0')?.text).toBe('1.');
    expect(r.numberFor('p1')?.text).toBe('2.');
  });

  it('ignores paragraphs with no numbering, and unknown definitions', () => {
    const doc = buildDoc(
      [
        para('a', { numId: 'n1', numLevel: 0 }),
        para('plain', {}),
        para('bogus', { numId: 'missing', numLevel: 0 })
      ],
      [level(0, 'decimal', '%1.')]
    );
    const r = createNumberingResolver(doc);

    expect(r.numberFor('plain')).toBeNull();
    expect(r.numberFor('bogus')).toBeNull();
    expect(r.items()).toHaveLength(1);
  });

  it('falls back to the level’s own counter when it has no pattern', () => {
    const doc = buildDoc(
      [para('a', { numId: 'n1', numLevel: 0 })],
      [level(0, 'upperRoman', '')]
    );
    expect(createNumberingResolver(doc).numberFor('a')?.text).toBe('I');
  });

  it('reports the separator so the renderer knows what follows the number', () => {
    const doc = buildDoc(
      [para('a', { numId: 'n1', numLevel: 0 })],
      [level(0, 'decimal', '%1.', { suffix: 'space' })]
    );
    expect(createNumberingResolver(doc).numberFor('a')?.suffix).toBe('space');
  });
});
