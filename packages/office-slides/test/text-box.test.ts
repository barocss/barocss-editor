import { describe, it, expect } from 'vitest';
import { textBoxCss, textInsetCss, verticalAlignCss } from '../src/text-box';

/**
 * Where the text sits in its box.
 *
 * Both halves were reachable only through a document written by hand:
 * `verticalAlign` had been declared and drawn since the node existed with
 * nothing that could set it, and the inset did not exist. The arithmetic is
 * here because the consequence of getting it wrong is geometric — a box that
 * draws wider than the model says is a slide that is not what the document
 * says — and that is a millisecond to check, not a browser round.
 */
describe('where the text sits in its box', () => {
  it('sits at the top unless the box says otherwise', () => {
    expect(verticalAlignCss(undefined)).toEqual({ justifyContent: 'flex-start' });
    expect(verticalAlignCss({ verticalAlign: 'top' })).toEqual({ justifyContent: 'flex-start' });
  });

  /**
   * `middle` and `center` are the same answer. The schema's word for a cell is
   * `middle`, Word's toolbar says `center`, and a document that says either
   * means the middle.
   */
  it('takes either word for the middle', () => {
    expect(verticalAlignCss({ verticalAlign: 'middle' })).toEqual({ justifyContent: 'center' });
    expect(verticalAlignCss({ verticalAlign: 'center' })).toEqual({ justifyContent: 'center' });
  });

  it('sits at the bottom when asked', () => {
    expect(verticalAlignCss({ verticalAlign: 'bottom' })).toEqual({ justifyContent: 'flex-end' });
  });
});

describe('the room between the edge and the text', () => {
  /**
   * The one that matters. A padding outside the border box would add to the
   * width the model gave the box, so two boxes placed edge to edge would
   * overlap by their insets.
   */
  it('is inside the box the model placed, never outside it', () => {
    // 144 twips is PowerPoint's own 0.1in, which is 9.6px at 96dpi.
    expect(textInsetCss({ textInset: 144 })).toEqual({
      padding: '9.6px',
      boxSizing: 'border-box'
    });
  });

  it('is nothing at all when there is none, rather than a padding of zero', () => {
    expect(textInsetCss(undefined)).toEqual({});
    expect(textInsetCss({ textInset: 0 })).toEqual({});
    expect(textInsetCss({ textInset: -10 })).toEqual({});
    expect(textInsetCss({ textInset: '144' as never })).toEqual({});
  });

  it('answers both questions at once for the renderer', () => {
    expect(textBoxCss({ verticalAlign: 'bottom', textInset: 144 })).toEqual({
      justifyContent: 'flex-end',
      padding: '9.6px',
      boxSizing: 'border-box'
    });
  });
});
