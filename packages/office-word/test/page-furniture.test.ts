import { describe, it, expect } from 'vitest';
import { furnitureFor, pageNumberFor, pageNumberText } from '../src/page-furniture';

/**
 * Which header a page gets, and what number it shows.
 *
 * Both are decisions about the *section*, not about the header — Word asks
 * three questions in order and restarts numbering per section — so they are
 * pure functions here and can be pinned down without a page to draw on.
 */
describe('choosing a header for a page', () => {
  const page = (index: number, number = index + 1) => ({ index, number, total: 10 });

  it('uses the ordinary header when a section defines only one', () => {
    expect(furnitureFor({ default: 'main' }, page(0))).toBe('main');
    expect(furnitureFor({ default: 'main' }, page(3))).toBe('main');
  });

  it('gives the first page its own, which is what a title page needs', () => {
    const binding = { default: 'main', first: 'title' };
    expect(furnitureFor(binding, page(0), { titlePage: true })).toBe('title');
    expect(furnitureFor(binding, page(1), { titlePage: true })).toBe('main');
  });

  it('keeps a title-page header the section is not using', () => {
    // Word does not lose what was written there when the box is unticked, so
    // having the header cannot be the switch: a document that had ever had one
    // would wear it on every first page for good.
    const binding = { default: 'main', first: 'title' };
    expect(furnitureFor(binding, page(0))).toBe('main');
    expect(furnitureFor(binding, page(0), { titlePage: false })).toBe('main');
  });

  it('alternates on even pages, for a spread', () => {
    const binding = { default: 'odd', even: 'even' };
    const on = { differentOddEven: true };
    expect(furnitureFor(binding, page(0, 1), on)).toBe('odd');
    expect(furnitureFor(binding, page(1, 2), on)).toBe('even');
    expect(furnitureFor(binding, page(2, 3), on)).toBe('odd');

    // ...and not at all while the document has not asked for a spread
    expect(furnitureFor(binding, page(1, 2))).toBe('odd');
  });

  it('asks the questions in Word’s order: first page before even page', () => {
    // Page 1 of a section numbered from 2 is both the first page and an even
    // one; Word shows the first-page header.
    const binding = { default: 'main', first: 'title', even: 'even' };
    expect(furnitureFor(binding, page(0, 2), { titlePage: true, differentOddEven: true }))
      .toBe('title');
  });

  it('draws nothing when the section defines nothing', () => {
    expect(furnitureFor({}, page(0))).toBeUndefined();
    // ...and an even-page header alone does not become the default
    expect(furnitureFor({ even: 'even' }, page(0, 1), { differentOddEven: true })).toBeUndefined();
  });
});

describe('numbering the pages', () => {
  it('starts at one unless the section says otherwise', () => {
    expect(pageNumberFor(0, {})).toBe(1);
    expect(pageNumberFor(2, {})).toBe(3);
  });

  it('restarts where the section says, which is how a chapter begins at 47', () => {
    expect(pageNumberFor(0, { pageNumberStart: 47 })).toBe(47);
    expect(pageNumberFor(1, { pageNumberStart: 47 })).toBe(48);
  });

  it('writes the number in the section’s own format', () => {
    expect(pageNumberText(4, {})).toBe('4');
    expect(pageNumberText(4, { pageNumberFormat: 'lowerRoman' })).toBe('iv');
    expect(pageNumberText(4, { pageNumberFormat: 'upperLetter' })).toBe('D');
  });
});
