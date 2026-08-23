import { describe, it, expect } from 'vitest';
import {
  componentOf,
  componentSignature,
  componentStale,
  deckComponents,
  instanceState,
  partSignature
} from '../src/components';
import type { DeckAccess } from '../src/deck';
import { editableSurface, isSlideSurface } from '../src/deck';

/**
 * A component's definition, and what a placement of it draws.
 *
 * The design is two sentences, and both are answers this engine already gave elsewhere: a
 * definition is a **surface of its own kind** (a definition is drawn nowhere it sits — the same
 * as a layout, a master, a theme), and a placement holds **its own children, which win by
 * role** (an instance is to a component what a slide is to a layout).
 *
 * What that buys, and what these tests are really about: renaming or reordering the
 * definition's children cannot break a placement, because nothing is matched by position.
 */
const doc = (nodes: Record<string, Record<string, unknown>>): DeckAccess =>
  ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as DeckAccess;

const card = () =>
  doc({
    root: { sid: 'root', stype: 'document', content: ['slide', 'card'] },
    slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
    // The definition: a surface of its own kind, holding two parts with roles.
    card: {
      sid: 'card',
      stype: 'surface',
      attributes: { kind: 'component', name: '카드' },
      content: ['card-back', 'card-title']
    },
    'card-back': { sid: 'card-back', stype: 'rectangle', attributes: {} },
    'card-title': { sid: 'card-title', stype: 'textFrame', attributes: { role: 'title' } },
    // A placement with its own title: the override.
    one: {
      sid: 'one',
      stype: 'instance',
      attributes: { componentId: 'card', x: 1000, y: 1000 },
      content: ['one-title']
    },
    // The copy remembers where it came from — that pairing is what apply reads, and it is
    // not the role: a role would be matched structurally, and this survives a rename.
    'one-title': {
      sid: 'one-title',
      stype: 'textFrame',
      attributes: { role: 'title', partOf: 'card-title' }
    }
  });

describe('a component and its placements', () => {
  it('is a surface, and not one of the deck’s slides', () => {
    const access = card();
    expect(deckComponents(access).map((one) => one.sid)).toEqual(['card']);
    // The fault this design was decided by: a definition that counted as a slide would be in
    // the filmstrip, in the count, in the presenter's *next slide* — and presented.
    expect(isSlideSurface(access.getNode('card') as never)).toBe(false);
    expect(isSlideSurface(access.getNode('slide') as never)).toBe(true);
  });

  it('names itself, so a gallery of components can list it', () => {
    expect(deckComponents(card())[0].name).toBe('카드');
  });

  it('is found from a placement, and answers nothing when it is gone', () => {
    const access = card();
    expect(componentOf(access, access.getNode('one') as never)?.sid).toBe('card');
    expect(componentOf(access, { sid: 'x', stype: 'instance', attributes: {} } as never)).toBeUndefined();
  });

  it('pairs a placement’s parts with the definition by **origin**, not by role or position', () => {
    const access = card();
    const state = instanceState(access, access.getNode('one') as never, deckComponents(access)[0]);

    // The copy remembers where it came from, and the reader's own box has no origin at all.
    expect(state).toEqual([
      { sid: 'one-title', origin: 'card-title', changed: false }
    ]);
  });

  it('says a part has changed when it stops saying what its origin says', () => {
    /*
     * Which is what an *override* is, with nothing declared and nothing hidden: a reader
     * typed into a card, so that part differs from the definition's, so apply leaves it
     * alone.
     */
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['card', 'slide'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      card: { sid: 'card', stype: 'surface', attributes: { kind: 'component' }, content: ['t'] },
      t: { sid: 't', stype: 'textFrame', attributes: { role: 'title', x: 0, y: 0 } },
      one: { sid: 'one', stype: 'instance', attributes: { componentId: 'card' }, content: ['mine'] },
      // The same part, moved: a part a reader has moved has been changed, and pretending
      // otherwise would let apply put it back.
      mine: {
        sid: 'mine',
        stype: 'textFrame',
        attributes: { role: 'title', x: 500, y: 0, partOf: 't' }
      }
    });

    const state = instanceState(access, access.getNode('one') as never, deckComponents(access)[0]);
    expect(state[0]).toEqual({ sid: 'mine', origin: 't', changed: true });
  });

  it('reports a part whose origin the definition has dropped', () => {
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['card', 'slide'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      card: { sid: 'card', stype: 'surface', attributes: { kind: 'component' }, content: [] },
      one: { sid: 'one', stype: 'instance', attributes: { componentId: 'card' }, content: ['gone'] },
      gone: { sid: 'gone', stype: 'rectangle', attributes: { partOf: 'was-here' } }
    });

    const state = instanceState(access, access.getNode('one') as never, deckComponents(access)[0]);
    // Named, with nothing to compare against: whether it may go is apply's decision.
    expect(state).toEqual([{ sid: 'gone', origin: 'was-here', changed: false }]);
  });

  it('leaves a region the reader added out of the pairing entirely', () => {
    /*
     * The thing Figma cannot do, and the reason this model can: a placement holds real
     * nodes, so a reader may add a whole frame withits own children inside it — and with no
     * origin, apply has nothing to compare and nothing to overwrite.
     */
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['card', 'slide'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      card: { sid: 'card', stype: 'surface', attributes: { kind: 'component' }, content: ['t'] },
      t: { sid: 't', stype: 'textFrame', attributes: {} },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card' },
        content: ['copy', 'added']
      },
      copy: { sid: 'copy', stype: 'textFrame', attributes: { partOf: 't' } },
      added: {
        sid: 'added',
        stype: 'frame',
        attributes: { layoutMode: 'row' },
        content: ['a', 'b']
      },
      a: { sid: 'a', stype: 'ellipse', attributes: {} },
      b: { sid: 'b', stype: 'ellipse', attributes: {} }
    });

    const state = instanceState(access, access.getNode('one') as never, deckComponents(access)[0]);
    expect(state).toEqual([
      { sid: 'copy', origin: 't', changed: false },
      { sid: 'added', changed: false }
    ]);
  });
});

/**
 * What a node says, and what a definition says.
 *
 * Two copies of the same box have different sids and the same signature, which is what lets
 * a placement be compared with its definition without either knowing about the other.
 */
describe('signatures', () => {
  const two = doc({
    root: { sid: 'root', stype: 'document', content: [] },
    a: { sid: 'a', stype: 'rectangle', attributes: { x: 10, fill: '#fff' }, content: ['ta'] },
    ta: { sid: 'ta', stype: 'inline-text', attributes: {}, text: '값' },
    b: { sid: 'b', stype: 'rectangle', attributes: { fill: '#fff', x: 10 }, content: ['tb'] },
    tb: { sid: 'tb', stype: 'inline-text', attributes: {}, text: '값' },
    c: { sid: 'c', stype: 'rectangle', attributes: { x: 10, fill: '#000' }, content: [] }
  });

  it('ignores identity, and the order attributes were written in', () => {
    expect(partSignature(two, 'a')).toBe(partSignature(two, 'b'));
  });

  it('does not ignore what a box says', () => {
    expect(partSignature(two, 'c')).not.toBe(partSignature(two, 'a'));
  });

  it('ignores `partOf`, because the original does not have one', () => {
    const access = doc({
      root: { sid: 'root', stype: 'document', content: [] },
      o: { sid: 'o', stype: 'rectangle', attributes: { x: 1 } },
      copy: { sid: 'copy', stype: 'rectangle', attributes: { x: 1, partOf: 'o' } }
    });
    expect(partSignature(access, 'copy')).toBe(partSignature(access, 'o'));
  });

  it('stops descending rather than looping for ever', () => {
    // A definition may hold an instance — a card containing a badge is the ordinary case —
    // so it may hold one of *itself*, and a signature that walked that would never return.
    const loop: any = {
      root: { sid: 'root', stype: 'document', content: [] },
      x: { sid: 'x', stype: 'frame', attributes: {}, content: ['y'] },
      y: { sid: 'y', stype: 'frame', attributes: {}, content: ['x'] }
    };
    const access = doc(loop);
    expect(typeof partSignature(access, 'x')).toBe('string');
  });
});

/**
 * Whether the definition has moved on.
 *
 * Not "does anything differ" — a reader who typed into a placement differs on purpose. This
 * is the question a badge answers: *there is something new to take*, which is the same
 * relationship Figma has across files, where it also cannot be live.
 */
describe('a placement that has fallen behind', () => {
  const deck = (over: Record<string, unknown> = {}, title = '카드') =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['card', 'slide'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      card: { sid: 'card', stype: 'surface', attributes: { kind: 'component' }, content: ['t'] },
      t: { sid: 't', stype: 'textFrame', attributes: { name: title } },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card', ...over },
        content: []
      }
    });

  it('is not stale when it was applied from what the definition still says', () => {
    const before = deck();
    const applied = componentSignature(before, deckComponents(before)[0]);
    const access = deck({ appliedFrom: applied });
    expect(componentStale(access, access.getNode('one') as never, deckComponents(access)[0])).toBe(
      false
    );
  });

  it('is stale once the definition says something else', () => {
    const before = deck();
    const applied = componentSignature(before, deckComponents(before)[0]);
    // The definition's part renamed: a different signature, and the placement has not taken it.
    const access = deck({ appliedFrom: applied }, '카드 v2');
    expect(componentStale(access, access.getNode('one') as never, deckComponents(access)[0])).toBe(
      true
    );
  });

  it('is not stale when it has never recorded one', () => {
    // A placement from before this was written. Calling every one of them stale would put a
    // badge on the whole deck and teach a reader to ignore it.
    const access = deck();
    expect(componentStale(access, access.getNode('one') as never, deckComponents(access)[0])).toBe(
      false
    );
  });

  it('is not stale when the definition is gone', () => {
    // There is nothing to take. What a placement without its definition needs is what it
    // already holds.
    const access = deck({ appliedFrom: 'whatever' });
    expect(componentStale(access, access.getNode('one') as never, undefined)).toBe(false);
  });
});

describe('the surface an action lands on', () => {
  const deck = doc({
    root: { sid: 'root', stype: 'document', content: ['one', 'two', 'card'] },
    one: { sid: 'one', stype: 'surface', attributes: { kind: 'slide' }, content: [] },
    two: { sid: 'two', stype: 'surface', attributes: { kind: 'slide' }, content: [] },
    card: { sid: 'card', stype: 'surface', attributes: { kind: 'component' }, content: [] }
  });

  it('takes a definition, which is a surface a reader can edit', () => {
    expect(editableSurface(deck, 'card')).toBe('card');
  });

  it('takes a slide, and defaults to the deck’s first one', () => {
    expect(editableSurface(deck, 'two')).toBe('two');
    // A command with no argument is answering "put it on the deck", which is what a console,
    // a test and a toolbar with nothing open all mean.
    expect(editableSurface(deck)).toBe('one');
  });

  it('refuses what is not a surface at all', () => {
    expect(editableSurface(deck, 'root')).toBeUndefined();
    expect(editableSurface(deck, 'nowhere')).toBeUndefined();
  });
});
