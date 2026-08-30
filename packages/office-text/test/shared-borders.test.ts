import { describe, it, expect } from 'vitest';
import { sharedBorders } from '../src/spacing';
import { createStyleResolver } from '../src/style-resolver';
import { betweenBorderCss } from '../src/css';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/**
 * **The fifth border** — one line where two bordered paragraphs meet, not two.
 *
 * ## What was drawn instead
 *
 * A run of consecutive paragraphs asking for the same borders is one bordered *box* in Word: the top
 * above the first, the bottom below the last, and a single line between each pair — `w:pBdr/w:between`.
 * Drawing each paragraph's own top and bottom puts **two** lines between every pair, at twice the
 * weight, with the margin showing through between them.
 *
 * `borderBetween` has been in the schema as long as the other four edges and nothing read it. The
 * comment over `betweenBorderAttrs` said so in as many words — *"Nothing draws it here yet."* — and
 * it stayed true: twelve of Word's 185 unread attributes were this one border on three node types.
 *
 * ## Why it lives beside `suppressedSpacing`
 *
 * It cannot be answered from the paragraph alone: the answer is about its **neighbours**. And it has
 * to be answered the same way twice, because the renderer draws the border and the paginator measures
 * the height it adds — a disagreement is a page whose blocks do not add up to its height. That is the
 * whole reason `spacing.ts` exists, and this is the second question of the same shape.
 */
const BORDER = {
  borderTopStyle: 'single',
  borderTopWidth: 8,
  borderTopColor: '#0F7A5A',
  borderBottomStyle: 'single',
  borderBottomWidth: 8,
  borderBottomColor: '#0F7A5A',
  borderBetweenStyle: 'dotted',
  borderBetweenWidth: 4,
  borderBetweenColor: '#94A3B8'
};

function docOf(nodes: DocumentNode[], rootId = 'doc'): DocumentAccess {
  const index = new Map(nodes.map((n) => [n.sid!, n]));
  return { getNode: (id) => index.get(id), rootId };
}

/** A surface of paragraphs, each with whatever it was given. */
function surfaceOf(...paragraphs: Record<string, unknown>[]) {
  return docOf([
    { sid: 'doc', stype: 'document', content: ['surface'] },
    {
      sid: 'surface',
      stype: 'surface',
      content: paragraphs.map((_, at) => `p${at}`)
    },
    ...paragraphs.map((attributes, at) => ({
      sid: `p${at}`,
      stype: 'paragraph',
      parentId: 'surface',
      attributes,
      content: []
    }))
  ]);
}

const askAt = (doc: DocumentAccess, sid: string) =>
  sharedBorders(doc, createStyleResolver(doc), doc.getNode(sid)!);

describe('a run of paragraphs inside one bordered box', () => {
  it('shares every edge in the middle and keeps the outer ones at the ends', () => {
    const doc = surfaceOf({ ...BORDER }, { ...BORDER }, { ...BORDER });

    // The first: its top is the box's own, its bottom is shared with the second.
    expect(askAt(doc, 'p0')).toEqual({ before: false, after: true });
    // The middle: both edges are lines between paragraphs.
    expect(askAt(doc, 'p1')).toEqual({ before: true, after: true });
    // The last: its bottom is the box's.
    expect(askAt(doc, 'p2')).toEqual({ before: true, after: false });
  });

  /*
   * Two boxes, not one. A thin rule beside a thick one is two paragraphs that each asked for
   * something different, and Word draws both edges — which is why this compares the resolved values
   * rather than the style id.
   */
  it('does not join two paragraphs that asked for different borders', () => {
    const doc = surfaceOf({ ...BORDER }, { ...BORDER, borderTopWidth: 24, borderBottomWidth: 24 });

    expect(askAt(doc, 'p0').after).toBe(false);
    expect(askAt(doc, 'p1').before).toBe(false);
  });

  /*
   * And it joins two paragraphs of *different styles* that land on the same border, because what
   * makes one box is the border and not the name of the style that asked for it.
   */
  it('joins two paragraphs that arrived at the same border by different routes', () => {
    const doc = surfaceOf(
      { ...BORDER, styleId: 'Quote' },
      { ...BORDER, styleId: 'BodyText' }
    );

    expect(askAt(doc, 'p0').after).toBe(true);
    expect(askAt(doc, 'p1').before).toBe(true);
  });

  /**
   * An **unbordered** pair shares nothing.
   *
   * `borderBetween` on its own is not a border: it says how the line *between* two bordered blocks
   * is drawn, not that there is one. Without this, every ordinary paragraph in a document would have
   * had its top and bottom replaced by `none`, which is the same finding one step further on.
   */
  it('shares nothing between paragraphs that asked for no border', () => {
    const doc = surfaceOf({ borderBetweenStyle: 'single' }, { borderBetweenStyle: 'single' });

    expect(askAt(doc, 'p0')).toEqual({ before: false, after: false });
    expect(askAt(doc, 'p1')).toEqual({ before: false, after: false });
  });

  it('shares nothing when there is no document to ask about neighbours', () => {
    const doc = surfaceOf({ ...BORDER });
    expect(sharedBorders(undefined, createStyleResolver(doc), doc.getNode('p0')!)).toEqual({
      before: false,
      after: false
    });
  });
});

describe('the line drawn on a shared edge', () => {
  it('is the between border, at its own width and colour', () => {
    expect(betweenBorderCss(BORDER as never)).toBe('0.5pt dotted #94A3B8');
  });

  /*
   * A bordered box with no `between` is one box with **no rules inside it** — not a box with doubled
   * edges. `blockStyle` writes `none` on the shared edge for exactly this case.
   */
  it('is nothing where the paragraph asked for none', () => {
    expect(betweenBorderCss({ borderTopStyle: 'single' } as never)).toBeUndefined();
  });
});
