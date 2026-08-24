import { describe, it, expect } from 'vitest';
import { boxOfMatch, deckMatches, matchesOn, matchesPerSlide, replacePlan } from '../src/find';
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
  it('are handed on whole, because a replace has to read what kind they are', () => {
    /*
     * It used to strip them to `{sid, start, end}` for Word's `replaceOperations`, and that stopped
     * being enough the day a match could be in a **card**: there the write is a placement's value
     * and the sid names a piece of the drawing rather than a node. `replacePlan` reads the
     * difference, so a stripped match would be one that cannot say what it is.
     */
    const on = matchesOn(deckMatches(sample, '구 제품명'), 's2');
    expect(on).toHaveLength(2);
    // Both of this slide's, and each still says which kind it is: one on the slide, one in the
    // script. A replace reads exactly that to decide what it writes.
    expect(on.map((match) => match.where)).toEqual(['text', 'note']);
    expect(on.every((match) => match.slideSid === 's2')).toBe(true);
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

/**
 * What a **card** draws, found — and what replacing it may and may not do.
 *
 * Measured on the sample deck before any of this existed, and it is the reason the feature was
 * wrong rather than incomplete: every word a card put on a slide came back with no matches. `매출`,
 * `1,240만`, `이탈` — all on the screen, all invisible to a search, because a placement holds no
 * parts and the walk read the document.
 *
 * Three cases, and they are three different acts:
 *
 * - the placement's **answer** — replaceable, and the write is this placement's value;
 * - the card's **own words** — refused, because rewriting them changes every placement of the card;
 * - the reader's own things in the **slot** — ordinary document text, found exactly once.
 */
describe('a card’s words', () => {
  const carded = (over: { said?: string } = {}) =>
    deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s', 'lib'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['one'] },

      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
      card: {
        sid: 'card',
        stype: 'component',
        attributes: { id: 'card' },
        content: ['v-title', 'b-title', 'p-title', 'p-fixed', 'p-slot']
      },
      'v-title': {
        sid: 'v-title',
        stype: 'componentVar',
        attributes: { name: 'title', kind: 'text', value: '지표 이름' }
      },
      'b-title': {
        sid: 'b-title',
        stype: 'componentBind',
        attributes: { part: 'title', attr: 'text', var: 'title' }
      },
      'p-title': {
        sid: 'p-title',
        stype: 'textFrame',
        attributes: { partId: 'title' },
        content: ['tp'],
        parentId: 'card'
      },
      tp: para('tp', ['tt'], 'p-title'),
      tt: run('지표 이름', 'tt', 'tp'),

      // The card's own words: nothing binds this part, so they are the card's to change.
      'p-fixed': {
        sid: 'p-fixed',
        stype: 'textFrame',
        attributes: { partId: 'fixed' },
        content: ['fp'],
        parentId: 'card'
      },
      fp: para('fp', ['ft'], 'p-fixed'),
      ft: run('지난 분기 대비', 'ft', 'fp'),

      'p-slot': {
        sid: 'p-slot',
        stype: 'frame',
        attributes: { partId: 'items', slot: 'items' },
        content: [],
        parentId: 'card'
      },

      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card' },
        content: [...(over.said ? ['said'] : []), 'own'],
        parentId: 's'
      },
      said: {
        sid: 'said',
        stype: 'componentValue',
        attributes: { name: 'title', value: over.said ?? '' }
      },
      // The reader's own row, in the card's slot: a real node with a real sid.
      own: { sid: 'own', stype: 'textFrame', attributes: {}, content: ['op'], parentId: 'one' },
      op: para('op', ['ot'], 'own'),
      ot: run('지난 분기 2.1%', 'ot', 'op')
    });

  it('finds the placement’s own answer, and says where to write it', () => {
    const found = deckMatches(carded({ said: '이탈률' }), '이탈');
    expect(found).toHaveLength(1);
    expect([found[0].where, found[0].placementSid, found[0].varName, found[0].whole]).toEqual([
      'card',
      'one',
      'title',
      '이탈률'
    ]);
  });

  it('finds the card’s default the same way, because that is what is on the screen', () => {
    // A placement that has answered nothing still *draws* the default, so a reader searching for it
    // is searching for words they can see. The write is the first answer this placement gives.
    const found = deckMatches(carded(), '지표');
    expect(found.map((match) => [match.where, match.varName])).toEqual([['card', 'title']]);
  });

  it('finds the card’s own words, and refuses to write them', () => {
    const found = deckMatches(carded(), '지난 분기 대비');
    expect(found).toHaveLength(1);
    // Found, so a reader is told; no variable, so nothing here can write it. The fix is in the card,
    // and doing it from a find box would change every placement of the card without saying so.
    expect(found[0].where).toBe('card');
    expect(found[0].varName).toBeUndefined();
    expect(found[0].placementSid).toBe('one');
  });

  it('finds what the reader put in the slot exactly once', () => {
    /*
     * The one thing that is in both trees: a slot's contents are the reader's own document nodes,
     * drawn inside the card. Searching the resolution without skipping them reported every one
     * twice, which is why the walk stops at anything with a real sid.
     */
    const found = deckMatches(carded(), '지난 분기 2.1%');
    expect(found.map((match) => [match.where, match.sid])).toEqual([['text', 'ot']]);
  });

  it('takes a reader to the placement, because a drawn part is not a node', () => {
    const access = carded({ said: '이탈률' });
    const [match] = deckMatches(access, '이탈');
    // The sid names a piece of the drawing (`card~…`), which no command accepts. What a reader can
    // be taken to, select and detach is the placement.
    expect(match.sid.includes('~')).toBe(true);
    expect(boxOfMatch(access, match.placementSid as string)).toBe('one');
  });
});

describe('what a replace would write', () => {
  const carded = (said: string) =>
    deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s', 'lib'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['one', 'two', 'plain'] },
      plain: { sid: 'plain', stype: 'textFrame', attributes: {}, content: ['pp'], parentId: 's' },
      pp: para('pp', ['pt'], 'plain'),
      pt: run('구 제품명 을 쓴다', 'pt', 'pp'),

      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
      card: {
        sid: 'card',
        stype: 'component',
        attributes: { id: 'card' },
        content: ['v-title', 'b-title', 'p-title']
      },
      'v-title': {
        sid: 'v-title',
        stype: 'componentVar',
        attributes: { name: 'title', kind: 'text', value: '구 제품명 기본' }
      },
      'b-title': {
        sid: 'b-title',
        stype: 'componentBind',
        attributes: { part: 'title', attr: 'text', var: 'title' }
      },
      'p-title': {
        sid: 'p-title',
        stype: 'textFrame',
        attributes: { partId: 'title' },
        content: ['tp'],
        parentId: 'card'
      },
      tp: para('tp', ['tt'], 'p-title'),
      tt: run('구 제품명 기본', 'tt', 'tp'),

      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card' },
        content: ['said'],
        parentId: 's'
      },
      said: { sid: 'said', stype: 'componentValue', attributes: { name: 'title', value: said } },

      // A second placement, answering nothing: it draws the card's default.
      two: { sid: 'two', stype: 'instance', attributes: { componentId: 'card' }, content: [], parentId: 's' }
    });

  it('writes a run, a changed answer and a first answer in one plan', () => {
    const access = carded('구 제품명 과 구 제품명');
    const plan = replacePlan(access, deckMatches(access, '구 제품명'), '새 이름');

    /*
     * One transaction for all of it, so one press of undo takes the replacement back: a slide with
     * half its occurrences replaced is not a state anybody asked for.
     */
    const kinds = plan.steps.map((step) => (step as { type: string }).type).sort();
    expect(kinds).toEqual(['addChild', 'replaceText', 'setAttrs']);
    expect(plan.written).toBe(4);
    expect(plan.refused).toEqual([]);

    // Two matches in one value are **one** write, spliced from the end so the second's offsets are
    // still true when the first is applied.
    const setAttrs = plan.steps.find((step) => (step as { type: string }).type === 'setAttrs') as {
      payload: { nodeId: string; attrs: { value: string } };
    };
    expect(setAttrs.payload.nodeId).toBe('said');
    expect(setAttrs.payload.attrs.value).toBe('새 이름 과 새 이름');

    // And the placement that had answered nothing gets its first answer, which is what an override
    // is here: the words it was drawing were the card's default.
    const added = plan.steps.find((step) => (step as { type: string }).type === 'addChild') as {
      payload: { parentId: string; child: { attributes: Record<string, unknown> } };
    };
    expect(added.payload.parentId).toBe('two');
    expect(added.payload.child.attributes).toEqual({ name: 'title', value: '새 이름 기본' });
  });

  it('refuses a card’s own words and says which they were', () => {
    const access = carded('그대로');
    const matches = deckMatches(access, '기본');
    // Both placements draw the card's default here, so both matches are the *value*'s — the refusal
    // is tested with a match that has no variable behind it.
    const forged = matches.map((match) => ({ ...match, varName: undefined, whole: undefined }));
    const plan = replacePlan(access, forged, '새 이름');
    expect(plan.steps).toEqual([]);
    expect(plan.written).toBe(0);
    expect(plan.refused).toHaveLength(forged.length);
  });
});
