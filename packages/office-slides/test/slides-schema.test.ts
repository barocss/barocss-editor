import { describe, it, expect } from 'vitest';
import { createSchema } from '@barocss/schema';
import {
  SLIDE_KIND,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  getSlidesSchemaDefinition
} from '../src/slides-schema';

/**
 * A deck, against the schema that already described one.
 *
 * The point of these is not that the schema works — it is Word's, and Word has
 * 588 tests. It is that a *slide* is expressible in it without a new node type
 * for anything a document already has, which is the claim the whole second
 * product rests on.
 */
describe('a deck is a document whose surfaces are slides', () => {
  const schema = () => createSchema('slides', getSlidesSchemaDefinition());

  /** Two slides: a title slide and one with a picture and a shape. */
  const deck = {
    stype: 'document',
    sid: 'deck',
    content: [
      {
        stype: 'surface',
        sid: 's1',
        attributes: { kind: SLIDE_KIND, width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
        content: [
          {
            stype: 'textFrame',
            sid: 's1-title',
            attributes: { role: 'title', x: 1440, y: 3000, width: 16320, height: 2400 },
            content: [
              {
                stype: 'paragraph',
                sid: 's1-title-p',
                content: [{ stype: 'inline-text', sid: 's1-title-t', text: 'Barocss Suite' }]
              }
            ]
          },
          {
            stype: 'textFrame',
            sid: 's1-sub',
            attributes: { role: 'subtitle', x: 1440, y: 5600, width: 16320, height: 1200 },
            content: [
              {
                stype: 'paragraph',
                sid: 's1-sub-p',
                content: [{ stype: 'inline-text', sid: 's1-sub-t', text: 'One engine, several products' }]
              }
            ]
          }
        ]
      },
      {
        stype: 'surface',
        sid: 's2',
        attributes: { kind: SLIDE_KIND },
        content: [
          {
            stype: 'rectangle',
            sid: 's2-rect',
            attributes: { x: 1200, y: 1200, width: 6000, height: 3600, fill: '1864ab' }
          },
          {
            stype: 'textFrame',
            sid: 's2-body',
            attributes: { role: 'body', x: 8000, y: 1200, width: 9800, height: 6000 },
            content: [
              {
                stype: 'paragraph',
                sid: 's2-p',
                content: [{ stype: 'inline-text', sid: 's2-t', text: 'A slide is a surface.' }]
              }
            ]
          }
        ]
      }
    ]
  };

  it('holds a slide where a page would go, and says which it is', () => {
    const created = schema();
    expect(created).toBeDefined();

    const surfaces = deck.content.filter((node) => node.stype === 'surface');
    expect(surfaces).toHaveLength(2);
    for (const surface of surfaces) {
      expect(surface.attributes.kind).toBe('slide');
    }
  });

  it('puts ordinary paragraphs inside a placed box', () => {
    // The sentence this product is built on: a title is a paragraph in a frame,
    // so every command written for Word works on it.
    const title = deck.content[0].content[0];
    expect(title.stype).toBe('textFrame');
    expect(title.content?.[0].stype).toBe('paragraph');
    expect(title.content?.[0].content?.[0].stype).toBe('inline-text');
  });

  it('needs no node type a document does not already have', () => {
    const office = new Set(Object.keys(getSlidesSchemaDefinition().nodes));
    const used = new Set<string>();
    const walk = (node: Record<string, unknown>) => {
      used.add(node.stype as string);
      for (const child of ((node.content ?? []) as Record<string, unknown>[])) walk(child);
    };
    walk(deck as never);

    for (const stype of used) {
      expect(office.has(stype), `${stype} is not in the schema`).toBe(true);
    }
    // And none of them is a slides invention: every one is Word's
    expect([...used].sort()).toEqual([
      'document',
      'inline-text',
      'paragraph',
      'rectangle',
      'surface',
      'textFrame'
    ]);
  });

  it('adds exactly what a deck needs and a document does not', () => {
    const nodes = getSlidesSchemaDefinition().nodes;
    // A slide knows its layout, whether it is skipped, and where its notes are
    expect(nodes.surface.attrs?.layoutId).toBeDefined();
    expect(nodes.surface.attrs?.hidden).toBeDefined();
    // Notes are `surfaceNote`, which the office schema already had — bound to a
    // note by `noteId`, the only binding direction anything here resolves.
    expect(nodes.surfaceNote?.attrs?.id).toBeDefined();
    // And the slide names it, the way a surface names its header.
    expect(nodes.surface?.attrs?.noteId).toBeDefined();
    // A placed box knows which slot of the layout it fills
    expect(nodes.textFrame.attrs?.role).toBeDefined();
    // And the two definitions a deck references
    expect(nodes.slideLayout?.group).toBe('resource');
  });

  it('leaves a page alone', () => {
    // A deck's schema is the document's, so a Word page still validates in it —
    // which is what lets a deck hold an imported document and round-trip it.
    const nodes = getSlidesSchemaDefinition().nodes;
    expect(nodes.surface.content).toBe('block+ | scene*');
    expect(nodes.paragraph).toBeDefined();
    expect(nodes.bTable).toBeDefined();
  });
});
