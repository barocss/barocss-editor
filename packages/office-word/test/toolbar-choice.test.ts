import { describe, it, expect } from 'vitest';
import {
  currentChoice,
  inheritedChoice,
  WORD_FONTS,
  WORD_FONT_SIZES
} from '../src/toolbar-model';
import type { SelectionSummary } from '@barocss/editor-core';

/**
 * The controls that pick a value rather than turning something on and off.
 *
 * A font box has three things to say and only one of them is a value: this
 * font, no single font because the selection spans two, or the font the text
 * inherits. The last is the usual case and the easiest to get wrong — almost no
 * text in a Word document carries direct font formatting, so a box that only
 * read marks would show "they disagree" for every ordinary paragraph in the
 * document.
 */
const summaryOf = (over: Partial<SelectionSummary> = {}): SelectionSummary =>
  ({
    empty: false,
    marks: [],
    mixedMarks: [],
    markAttributes: {},
    blockAttributes: {},
    mixedAttributes: [],
    ...over
  }) as SelectionSummary;

const resolverOf = (format: Record<string, unknown>) =>
  ({ resolveNode: () => format }) as never;

const block = { sid: 'p1', stype: 'paragraph' };

describe('the value a choice shows', () => {
  it('is the mark when the selection carries one', () => {
    const summary = summaryOf({ markAttributes: { fontSize: { size: 28 } } });
    expect(currentChoice(WORD_FONT_SIZES, summary)).toBe('28');
  });

  it('is nothing when the selection disagrees, whatever it inherits', () => {
    // Disagreement outranks inheritance: two fonts in one selection is not one
    // font, and showing either would apply it to both on the next change.
    const summary = summaryOf({ mixedMarks: ['fontFamily'] });
    expect(currentChoice(WORD_FONTS, summary, () => 'Georgia')).toBeNull();
  });

  it('falls back to what the text inherits when no mark says otherwise', () => {
    expect(currentChoice(WORD_FONTS, summaryOf(), () => 'Georgia')).toBe('Georgia');
    expect(currentChoice(WORD_FONT_SIZES, summaryOf(), () => 22)).toBe('22');
  });

  it('is nothing when there is no mark and nothing to inherit', () => {
    expect(currentChoice(WORD_FONTS, summaryOf())).toBeNull();
    expect(currentChoice(WORD_FONTS, summaryOf(), () => undefined)).toBeNull();
  });

  it('prefers the mark over the inherited value', () => {
    // Direct formatting is what the reader last chose, and it is what wins on
    // the page — so it is what the box has to show.
    const summary = summaryOf({ markAttributes: { fontFamily: { family: 'Arial' } } });
    expect(currentChoice(WORD_FONTS, summary, () => 'Georgia')).toBe('Arial');
  });
});

describe('what a block inherits', () => {
  it('follows the style cascade rather than the node attributes', () => {
    expect(inheritedChoice(WORD_FONT_SIZES, resolverOf({ fontSize: 22 }), block)).toBe(22);
  });

  it('names one font out of a stack', () => {
    // A stylesheet writes fallbacks; Word names a font. The control offers font
    // names, so a box matching the whole stack would sit blank over text that is
    // plainly Georgia.
    expect(inheritedChoice(WORD_FONTS, resolverOf({ fontFamily: 'Georgia, serif' }), block)).toBe(
      'Georgia'
    );
    expect(
      inheritedChoice(WORD_FONTS, resolverOf({ fontFamily: '"Times New Roman", Times, serif' }), block)
    ).toBe('Times New Roman');
  });

  it('answers nothing when there is no resolver or no block yet', () => {
    // Both happen: before the document is loaded, and while the selection is
    // somewhere with no block above it.
    expect(inheritedChoice(WORD_FONTS, undefined, block)).toBeUndefined();
    expect(inheritedChoice(WORD_FONTS, resolverOf({ fontFamily: 'Georgia' }), undefined)).toBeUndefined();
    expect(inheritedChoice(WORD_FONTS, resolverOf({}), block)).toBeUndefined();
  });
});

describe('the sizes offered', () => {
  it('are labelled in points and valued in half-points', () => {
    // The renderer reads a number as Word's unit, so 22 is eleven point. A
    // control that sent 11 would set five and a half point text and look like a
    // rendering bug.
    const eleven = WORD_FONT_SIZES.options.find((option) => option.label === '11');
    expect(eleven?.value).toBe(22);
    for (const option of WORD_FONT_SIZES.options) {
      expect(option.value).toBe(Number(option.label) * 2);
    }
  });
});
