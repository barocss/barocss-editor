import { describe, it, expect } from 'vitest';
import { clearMarkOverRange, markIsSingleValued } from '../src/operations/mark-range';
import type { IMark } from '../src/types';

/**
 * The arithmetic behind "a run has one colour".
 *
 * Tested here rather than through a browser because it is arithmetic: the
 * defect it fixes — a second colour stacking on top of the first, so coloured
 * text could not be recoloured — took a Playwright round to find and takes
 * milliseconds to pin down.
 */
const colour = (from: number, to: number, value: string): IMark =>
  ({ stype: 'fontColor', attrs: { color: value }, range: [from, to] }) as IMark;

describe('making room for a mark', () => {
  it('takes away one that covers the range exactly', () => {
    const kept = clearMarkOverRange([colour(0, 24, 'FF0000')], 'fontColor', [0, 24], 24);
    expect(kept).toEqual([]);
  });

  it('leaves the head and the tail of one that reaches past both ends', () => {
    const kept = clearMarkOverRange([colour(0, 24, 'FF0000')], 'fontColor', [8, 14], 24);
    expect(kept).toEqual([
      { stype: 'fontColor', attrs: { color: 'FF0000' }, range: [0, 8] },
      { stype: 'fontColor', attrs: { color: 'FF0000' }, range: [14, 24] }
    ]);
  });

  it('leaves only the head when the range runs to the end', () => {
    expect(clearMarkOverRange([colour(0, 24, 'FF0000')], 'fontColor', [10, 24], 24)).toEqual([
      { stype: 'fontColor', attrs: { color: 'FF0000' }, range: [0, 10] }
    ]);
  });

  it('leaves only the tail when the range starts at the beginning', () => {
    expect(clearMarkOverRange([colour(0, 24, 'FF0000')], 'fontColor', [0, 10], 24)).toEqual([
      { stype: 'fontColor', attrs: { color: 'FF0000' }, range: [10, 24] }
    ]);
  });

  it('does not touch one that only meets it at an edge', () => {
    const marks = [colour(0, 8, 'FF0000'), colour(14, 24, '00FF00')];
    expect(clearMarkOverRange(marks, 'fontColor', [8, 14], 24)).toEqual(marks);
  });

  /**
   * Bold and a colour are different questions and a run answers both, so
   * applying one may not disturb the other. This is the check that stops the
   * fix from becoming "the last formatting applied wins".
   */
  it('leaves marks of every other type alone', () => {
    const marks = [
      { stype: 'bold', attrs: {}, range: [0, 24] } as IMark,
      colour(0, 24, 'FF0000')
    ];
    expect(clearMarkOverRange(marks, 'fontColor', [0, 24], 24)).toEqual([marks[0]]);
  });

  /** A mark with no range covers the node — the same meaning the store gives it. */
  it('cuts one that carries no range as one covering the whole node', () => {
    const whole = { stype: 'fontColor', attrs: { color: 'FF0000' } } as IMark;
    expect(clearMarkOverRange([whole], 'fontColor', [4, 10], 24)).toEqual([
      { stype: 'fontColor', attrs: { color: 'FF0000' }, range: [0, 4] },
      { stype: 'fontColor', attrs: { color: 'FF0000' }, range: [10, 24] }
    ]);
  });

  it('changes nothing for an empty range, and nothing for no marks', () => {
    const marks = [colour(0, 24, 'FF0000')];
    expect(clearMarkOverRange(marks, 'fontColor', [8, 8], 24)).toEqual(marks);
    expect(clearMarkOverRange(undefined, 'fontColor', [0, 4], 24)).toEqual([]);
  });

  /**
   * Several colours over the run, of which the range crosses two: the outer
   * halves of each survive.
   */
  it('cuts every overlap, not just the first', () => {
    const marks = [colour(0, 10, 'FF0000'), colour(10, 24, '0000FF')];
    expect(clearMarkOverRange(marks, 'fontColor', [6, 16], 24)).toEqual([
      { stype: 'fontColor', attrs: { color: 'FF0000' }, range: [0, 6] },
      { stype: 'fontColor', attrs: { color: '0000FF' }, range: [16, 24] }
    ]);
  });
});

/**
 * Which marks this happens to at all.
 *
 * The declaration matters more than the arithmetic: cutting every same-type mark
 * would destroy the ones that legitimately stack — two comments overlap on the
 * same sentence, and a tracked insertion overlaps everything under it — so a
 * mark that has not said it is one value per character is left alone.
 */
describe('which marks replace their own kind', () => {
  const schema = {
    getMarkType: (type: string) =>
      ({
        fontColor: { single: true },
        highlight: { single: true },
        commentRef: {},
        bold: {}
      })[type]
  };

  it('is the ones the schema calls single', () => {
    expect(markIsSingleValued(schema, 'fontColor')).toBe(true);
    expect(markIsSingleValued(schema, 'highlight')).toBe(true);
  });

  it('is not a comment, which overlaps another on purpose', () => {
    expect(markIsSingleValued(schema, 'commentRef')).toBe(false);
  });

  it('is not a mark the schema has never heard of, nor one with no schema at all', () => {
    expect(markIsSingleValued(schema, 'insertion')).toBe(false);
    expect(markIsSingleValued(undefined, 'fontColor')).toBe(false);
  });
});
