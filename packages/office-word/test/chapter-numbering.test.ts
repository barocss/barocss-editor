import { describe, it, expect } from 'vitest';
import {
  chapterAt,
  chapterNumber,
  chapterSeparator,
  pageNumberWithChapter
} from '../src/chapter-numbering';
import type { TocEntry } from '../src/toc';
import type { NumberingResolver } from '@barocss/office-text';

/**
 * Word's `1-1`: the page number with its chapter's number in front.
 *
 * How a manual numbers pages so a chapter can be revised and reprinted without
 * renumbering the rest of the book. Every part of it existed separately — the
 * furniture resolves a page number, `toc.ts` finds the headings and their pages,
 * the numbering resolver computes what a heading is numbered — and
 * `pageNumberChapterStyle` sat in the schema unread because nothing joined them.
 */
const entry = (sid: string, page: number): TocEntry => ({ sid, level: 1, text: sid, page });

/** A resolver that numbers whatever it is told to, and nothing else. */
const numbering = (numbers: Record<string, number>): NumberingResolver =>
  ({
    numberFor: (nodeId: string) =>
      numbers[nodeId] === undefined
        ? null
        : { nodeId, numId: 'n', level: 0, text: `${numbers[nodeId]}.`, counters: [numbers[nodeId]], suffix: 'tab' },
    items: () => []
  }) as NumberingResolver;

describe('which chapter a page is under', () => {
  const chapters = [entry('one', 2), entry('two', 6), entry('three', 11)];

  it('is the last chapter heading at or before it', () => {
    expect(chapterAt(chapters, 2)?.sid).toBe('one');
    expect(chapterAt(chapters, 5)?.sid).toBe('one');
    expect(chapterAt(chapters, 6)?.sid).toBe('two');
    expect(chapterAt(chapters, 40)?.sid).toBe('three');
  });

  /**
   * A title page and a contents page come before chapter one, and get a plain
   * page number — which is what Word prints there too.
   */
  it('is nothing before the first chapter starts', () => {
    expect(chapterAt(chapters, 0)).toBeUndefined();
    expect(chapterAt([], 3)).toBeUndefined();
  });

  it('ignores a heading nothing has laid out yet', () => {
    expect(chapterAt([{ sid: 'x', level: 1, text: 'x' }], 3)).toBeUndefined();
  });
});

describe('the number a chapter prints', () => {
  const chapters = [entry('one', 0), entry('two', 4)];

  it('is what the numbering gives its heading', () => {
    const numbers = numbering({ one: 1, two: 2 });
    expect(chapterNumber(chapters, 1, numbers, {})).toBe('1');
    expect(chapterNumber(chapters, 5, numbers, {})).toBe('2');
  });

  /**
   * Not the heading's position. A document may name a chapter style whose
   * headings carry no numbering at all, and there is no number to print —
   * inventing one would be a page number that disagrees with the heading it
   * claims to be under.
   */
  it('is nothing when the chapter heading is not numbered', () => {
    expect(chapterNumber(chapters, 1, numbering({}), {})).toBeUndefined();
    expect(chapterNumber(chapters, 1, undefined, {})).toBeUndefined();
  });

  it('follows the section’s own numbering format', () => {
    const numbers = numbering({ one: 4 });
    expect(chapterNumber(chapters, 1, numbers, { pageNumberFormat: 'upperRoman' })).toBe('IV');
  });
});

describe('the page number a section asks for', () => {
  const chapters = [entry('one', 0), entry('two', 4)];
  const numbers = numbering({ one: 1, two: 2 });

  /**
   * Not a mode. A section that names no chapter style gets exactly what it got
   * before — the prefix is usually absent, and that has to cost nothing.
   */
  it('is the plain number when no chapter style is named', () => {
    expect(pageNumberWithChapter(3, {}, chapters, numbers, 5)).toBe('3');
  });

  it('carries the chapter in front when one is', () => {
    const format = { pageNumberChapterStyle: 'Heading1' };
    expect(pageNumberWithChapter(1, format, chapters, numbers, 0)).toBe('1-1');
    expect(pageNumberWithChapter(5, format, chapters, numbers, 4)).toBe('2-5');
  });

  it('takes the separator the section names', () => {
    const format = { pageNumberChapterStyle: 'Heading1', pageNumberChapterSeparator: 'period' };
    expect(pageNumberWithChapter(1, format, chapters, numbers, 0)).toBe('1.1');
    expect(chapterSeparator({})).toBe('-');
    expect(chapterSeparator({ pageNumberChapterSeparator: 'emDash' })).toBe('—');
    // A separator Word does not name is printed as written rather than dropped.
    expect(chapterSeparator({ pageNumberChapterSeparator: '/' })).toBe('/');
  });

  /**
   * A chapter style that asks for numbers a document cannot give falls back to
   * the plain page number rather than printing a half-formed one.
   */
  it('falls back to the plain number where there is no chapter', () => {
    const format = { pageNumberChapterStyle: 'Heading1' };
    expect(pageNumberWithChapter(1, format, [], numbers, 0)).toBe('1');
    expect(pageNumberWithChapter(1, format, chapters, numbering({}), 0)).toBe('1');
  });

  it('formats both parts the way the section asks', () => {
    const format = { pageNumberChapterStyle: 'Heading1', pageNumberFormat: 'upperRoman' };
    expect(pageNumberWithChapter(3, format, chapters, numbers, 1)).toBe('I-III');
  });
});
