import { describe, it, expect } from 'vitest';
import { iconForBlock, siteLayerIcons } from '../src/layer-icons';

/**
 * What a block looks like in a list of them.
 *
 * Held here rather than in the rail because it is a fact about the **document** — which node type,
 * and which arrangement it is in — and because it is the answer `every-icon-has-a-picture` is given:
 * an icon a product asks for and the suite does not draw comes out as the icon's own name in a 240px
 * column, which reads as a label nobody wrote.
 */
describe('the picture at the head of a layer row', () => {
  it('tells the three arrangements apart, because that is what a reader is looking for', () => {
    expect(iconForBlock({ stype: 'frame', attributes: { layoutMode: 'row' } })).toBe('frame-row');
    expect(iconForBlock({ stype: 'frame', attributes: { layoutMode: 'column' } })).toBe('frame-column');
    expect(iconForBlock({ stype: 'frame', attributes: { layoutMode: 'grid' } })).toBe('frame-grid');
    // A frame that arranges nothing is a box, and says so.
    expect(iconForBlock({ stype: 'frame', attributes: {} })).toBe('insert-frame');
  });

  it('says which kind of words, because a heading and a paragraph are not the same row', () => {
    expect(iconForBlock({ stype: 'heading', attributes: { level: 2 } })).toBe('heading');
    expect(iconForBlock({ stype: 'paragraph', attributes: {} })).toBe('paragraph');
    expect(iconForBlock({ stype: 'list', attributes: {} })).toBe('bullet-list');
  });

  it('marks the two things that are not what they look like', () => {
    // A placement draws a definition, and a list draws a row of data — neither is a stack a reader
    // can open, and the picture is the only warning before they try.
    expect(iconForBlock({ stype: 'instance', attributes: { componentId: 'cta' } })).toBe('component');
    expect(iconForBlock({ stype: 'collection', attributes: { layoutMode: 'row' } })).toBe('data-list');
  });

  it('answers for a block it has never met', () => {
    // A picture that says "a block" beats a blank column, and beats a crash.
    expect(iconForBlock({ stype: 'somethingElse' })).toBe('insert-frame');
    expect(iconForBlock(undefined)).toBe('insert-frame');
  });

  it('asks for nothing it has not written down', () => {
    const asked = new Set(siteLayerIcons());
    const cases = [
      { stype: 'frame', attributes: { layoutMode: 'row' } },
      { stype: 'frame', attributes: { layoutMode: 'column' } },
      { stype: 'frame', attributes: { layoutMode: 'grid' } },
      { stype: 'frame', attributes: {} },
      { stype: 'heading' },
      { stype: 'paragraph' },
      { stype: 'picture' },
      { stype: 'instance' },
      { stype: 'collection' },
      { stype: 'list' },
      { stype: 'surface' },
      /* The four that were falling through, so this list holds them to the same promise. */
      { stype: 'mediaVideo' },
      { stype: 'mediaEmbed' },
      { stype: 'form' },
      { stype: 'chart' },
      { stype: 'nothing' }
    ];
    // The declared list is what the conformance run checks against the suite's icons, so a picture
    // this function can return and the list does not name is a picture nothing checks.
    for (const one of cases) expect(asked).toContain(iconForBlock(one));
  });
});

/**
 * **The four rows that were falling through to *a block*.**
 *
 * The fallback here is deliberate — a picture that says "a block" beats a blank column — and it is
 * also what makes a missing entry invisible, which is the same shape as the missing *name* one file
 * over. Three of these arrived the day `every-insert-can-be-held` made them selectable; the fourth,
 * a chart, had been a row since charts arrived and had been drawing a frame's picture the whole time.
 */
describe('a row for something that is not a stack', () => {
  it('draws what 추가 draws for the same thing, which is the point of both lists', () => {
    expect(iconForBlock({ stype: 'mediaVideo', attributes: {} })).toBe('insert-video');
    expect(iconForBlock({ stype: 'mediaEmbed', attributes: {} })).toBe('frame-grid');
    expect(iconForBlock({ stype: 'form', attributes: {} })).toBe('form');
    /* And a chart, whose two surfaces were drawing two different wrong pictures until there was one. */
    expect(iconForBlock({ stype: 'chart', attributes: {} })).toBe('chart-bar');
  });

  it('still falls back for a block this product has not met', () => {
    // The fallback is not the fault; a fallback nothing checks is.
    expect(iconForBlock({ stype: '아직 없는 것', attributes: {} })).toBe('insert-frame');
  });
});
