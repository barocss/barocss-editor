import { describe, it, expect } from 'vitest';
import { authorColor, revisionTitle } from '../src/revisions';
import { blockRevision } from '../src/renderers/block-style';

/**
 * A document revised by three people is only readable if each one's changes look
 * different — which makes the author a value, not a class name.
 */
describe('the colour a reviewer gets', () => {
  it('is the same every time, so a reader can learn it', () => {
    expect(authorColor('Jinho')).toBe(authorColor('Jinho'));
  });

  it('is different for different reviewers', () => {
    // Hashing straight to a hue put these two six degrees apart — the same
    // colour, to a reader.
    expect(authorColor('Jinho')).not.toBe(authorColor('Sujin'));
  });

  it('does not depend on the order they edited in', () => {
    // Otherwise a reviewer's colour changes when someone else's edit is accepted
    const before = ['Kim', 'Lee', 'Park'].map(authorColor);
    const after = ['Park', 'Kim', 'Lee'].map(authorColor);
    expect(after).toEqual([before[2], before[0], before[1]]);
  });

  it('has a colour for a revision with no author', () => {
    expect(authorColor(undefined)).toBeTruthy();
    expect(authorColor(undefined)).not.toBe(authorColor('Kim'));
  });
});

describe('what a revision says when pointed at', () => {
  it('names the author and the date', () => {
    expect(revisionTitle('insertion', { author: 'Kim', date: '2026-08-05' })).toBe(
      'insertion by Kim, 2026-08-05'
    );
  });

  it('manages without a date', () => {
    expect(revisionTitle('deletion', { author: 'Kim' })).toBe('deletion by Kim');
  });

  it('says so when the author is unknown, rather than saying nothing', () => {
    expect(revisionTitle('insertion', {})).toBe('insertion by Unknown');
  });
});

/**
 * A revision of a **block**, which is the half of tracked changes nothing drew.
 *
 * `recordParagraphMerge` writes `revisionId`, `revisionType: 'deletion'`, the author and the date on
 * a paragraph when a reader presses Backspace at its start with 변경 내용 추적 on — Word's deleted
 * paragraph mark, the proposal that this boundary goes and the block joins the one after it.
 *
 * **Nothing anywhere read any of it.** So the merge was proposed, recorded and invisible: the
 * paragraphs stayed apart with no mark on them, and a reviewer had nothing to accept or reject.
 * Found by `every-attribute-is-read` — 36 of Word's 185 findings were these four attributes on nine
 * node types, the largest single thing the product declared and did not look at.
 */
describe('a block that is somebody\'s proposed change', () => {
  it('says what kind of change, and in the author\'s colour', () => {
    const drawn = blockRevision({
      attributes: {
        revisionId: 'r-1',
        revisionType: 'deletion',
        revisionAuthor: '박진호',
        revisionDate: '2026-08-30'
      }
    });

    expect(drawn?.type).toBe('deletion');
    expect(drawn?.title).toContain('박진호');
    expect(drawn?.title).toContain('2026-08-30');
  });

  /*
   * The **same** colour the marks use, from the one function — a reviewer who changed a word and a
   * boundary is one reviewer, and two palettes would say two.
   */
  it('takes its colour from the same place a mark does', () => {
    const drawn = blockRevision({
      attributes: { revisionId: 'r-1', revisionType: 'insertion', revisionAuthor: '박진호' }
    });

    expect(drawn?.color).toBe(authorColor('박진호'));
  });

  /* An id is what says a revision exists; without one there is nothing to draw. */
  it('is nothing when no revision was recorded', () => {
    expect(blockRevision({ attributes: {} })).toBeUndefined();
    expect(blockRevision({})).toBeUndefined();
    expect(blockRevision({ attributes: { revisionType: 'deletion' } })).toBeUndefined();
  });

  /* An id with no type still marks the block: something was proposed, and the bar has to show it. */
  it('marks a block whose revision says only that it exists', () => {
    expect(blockRevision({ attributes: { revisionId: 'r-1' } })?.type).toBe('change');
  });
});

