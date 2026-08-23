import { describe, it, expect } from 'vitest';
import { boxOfMatch, deckMatches, matchesOn, matchesPerSlide } from '../src/find';
import type { DeckAccess } from '../src/deck';

/**
 * Finding text across a deck.
 *
 * In a hundred-page document "the next match" is a scroll; in a hundred-slide deck
 * it is a different slide. So the arithmetic is Word's — none of it worth writing
 * twice — and what a deck adds is **which slide each answer came from**, plus the
 * two places a deck keeps text that a document does not.
 */
const deck = (nodes: Record<string, unknown>): DeckAccess =>
  ({ rootId: 'root', getNode: (sid: string) => (nodes as never)[sid] }) as never;

const run = (text: string, sid: string, parentId?: string) =>
  ({ sid, stype: 'inline-text', text, parentId });
const para = (sid: string, kids: string[], parentId?: string) =>
  ({ sid, stype: 'paragraph', attributes: {}, content: kids, parentId });

/**
 * Two slides, a note on the second, and a layout nobody searched for.
 *
 * The layout is the point of the fixture: it holds the same words, and a reader
 * searching a deck means the deck.
 */
const sample = deck({
  root: { sid: 'root', stype: 'document', attributes: {}, content: ['s1', 's2', 'res'] },

  s1: { sid: 's1', stype: 'surface', attributes: {}, content: ['f1'] },
  f1: { sid: 'f1', stype: 'textFrame', attributes: {}, content: ['p1'], parentId: 's1' },
  p1: para('p1', ['t1'], 'f1'),
  t1: run('구 제품명 은 구 제품명 이다', 't1', 'p1'),

  s2: { sid: 's2', stype: 'surface', attributes: { noteId: 'note-2' }, content: ['f2'] },
  f2: { sid: 'f2', stype: 'textFrame', attributes: {}, content: ['p2'], parentId: 's2' },
  p2: para('p2', ['t2'], 'f2'),
  t2: run('여기에도 구 제품명', 't2', 'p2'),

  res: { sid: 'res', stype: 'resources', attributes: {}, content: ['n2', 'lay'] },
  n2: { sid: 'n2', stype: 'surfaceNote', attributes: { id: 'note-2' }, content: ['np'], parentId: 'res' },
  np: para('np', ['nt'], 'n2'),
  nt: run('원고에서도 구 제품명 을 말한다', 'nt', 'np'),

  lay: { sid: 'lay', stype: 'slideLayout', attributes: { id: 'l1' }, content: ['lp'] },
  lp: para('lp', ['lt']),
  lt: run('레이아웃의 구 제품명', 'lt')
});

describe('finding text in a deck', () => {
  it('says which slide each match is on', () => {
    const found = deckMatches(sample, '구 제품명');
    expect(found.map((match) => [match.slideSid, match.where])).toEqual([
      ['s1', 'text'],
      ['s1', 'text'],
      ['s2', 'text'],
      ['s2', 'note']
    ]);
  });

  /**
   * Slide by slide, and the note after the slide's own text.
   *
   * A reader stepping through matches goes through what is on the slide before what
   * is said about it — which is the order "next" has to mean.
   */
  it('is in the order a reader would meet them', () => {
    const found = deckMatches(sample, '구 제품명');
    expect(found[0].sid).toBe('t1');
    expect(found[0].start).toBe(0);
    expect(found[1].start).toBeGreaterThan(found[0].start);
    expect(found[3].sid).toBe('nt');
  });

  /**
   * Not a layout's text, and this is the one that would have been wrong by
   * accident.
   *
   * Searching from the deck's root finds a layout's placeholder text, and offering
   * to replace inside a layout is offering to break every slide that follows it
   * from a search box.
   */
  it('does not search a layout, or anything else in the resources', () => {
    const found = deckMatches(sample, '구 제품명');
    expect(found.map((match) => match.sid)).not.toContain('lt');
  });

  /**
   * And it *does* search the notes, which searching from the root would have
   * skipped — Word's walk refuses `resources`, and a deck keeps its script there.
   */
  it('searches the speaker notes', () => {
    const notes = deckMatches(sample, '원고');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ slideSid: 's2', where: 'note', sid: 'nt' });
  });

  it('finds nothing for an empty query', () => {
    // Not "everything": an empty box is a reader who has not asked yet.
    expect(deckMatches(sample, '')).toEqual([]);
  });

  it('passes the reader’s options through to the search', () => {
    // The options are Word's and are not re-implemented here; this is the seam.
    expect(deckMatches(sample, '구 제품명', { caseSensitive: true })).toHaveLength(4);
    expect(deckMatches(sample, '구제품명')).toHaveLength(0);
  });
});

describe('what a reader is told about where the matches are', () => {
  it('counts them per slide', () => {
    const counted = matchesPerSlide(deckMatches(sample, '구 제품명'));
    // "12 matches" in a sixty-slide deck says nothing about where the work is.
    expect(counted.get('s1')).toBe(2);
    expect(counted.get('s2')).toBe(2);
  });

  it('has no entry for a slide with none', () => {
    const counted = matchesPerSlide(deckMatches(sample, '원고'));
    expect(counted.has('s1')).toBe(false);
    expect(counted.get('s2')).toBe(1);
  });
});

describe('the matches on one slide', () => {
  it('are handed on in the shape a replace takes', () => {
    // Word's `replaceOperations` takes `{sid, start, end}` and should not have to
    // learn that a deck's matches carry two more fields.
    const on = matchesOn(deckMatches(sample, '구 제품명'), 's2');
    expect(on).toHaveLength(2);
    expect(Object.keys(on[0]).sort()).toEqual(['end', 'sid', 'start']);
  });

  it('are none for a slide nothing was found on', () => {
    expect(matchesOn(deckMatches(sample, '원고'), 's1')).toEqual([]);
  });
});


/**
 * Which shape a match is in.
 *
 * A match's own sid is the *run of text* it was found in — three or four levels
 * below anything a reader has a name for. A slide with nine text boxes on it has to
 * say which, and "the fourth inline-text of the second paragraph" is not that.
 */
describe('the shape a match is in', () => {
  it('walks up to the thing the canvas placed', () => {
    const found = deckMatches(sample, '구 제품명');
    expect(boxOfMatch(sample, found[0].sid)).toBe('f1');
    expect(boxOfMatch(sample, found[2].sid)).toBe('f2');
  });

  it('is nothing for a match in the notes', () => {
    // A note is not on the slide, so there is no shape to name — and answering
    // with the note's own sid would put a name in the bar that means nothing.
    const found = deckMatches(sample, '원고');
    expect(boxOfMatch(sample, found[0].sid)).toBeUndefined();
  });

  it('is nothing when the walk runs out', () => {
    expect(boxOfMatch(sample, 'nope')).toBeUndefined();
  });

  it('stops at the shape, not at the group above it', () => {
    // The nearest placed thing: a reader is told the box, and being told the group
    // it happens to be in would be a level too far out to point at.
    const grouped = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['g'] },
      g: { sid: 'g', stype: 'group', attributes: {}, content: ['fr'], parentId: 's' },
      fr: { sid: 'fr', stype: 'textFrame', attributes: {}, content: ['p'], parentId: 'g' },
      p: para('p', ['t'], 'fr'),
      t: run('찾을 것', 't', 'p')
    });
    expect(boxOfMatch(grouped, 't')).toBe('fr');
  });
});
