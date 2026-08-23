import { describe, it, expect } from 'vitest';
import {
  componentApplyPlan,
  componentOf,
  componentSignature,
  componentStale,
  deckComponents,
  instanceState,
  partCopy,
  partSignature
} from '../src/components';
import { editableSurface, isSlideSurface, type DeckAccess } from '../src/deck';

/**
 * A component's definition, and what a placement of it is.
 *
 * Two decisions, and both were arrived at by being wrong first — which is why they are worth
 * restating here rather than only in the source:
 *
 * - **A definition is a resource, not a page.** It was a `surface` with a kind of its own, and
 *   then every reader of the page sequence had to ask whether each page counted: the slide
 *   list, the strip, the presenter, the count. Two of them leaked before the third was
 *   written. `resources` is where this document already keeps what pages refer to.
 * - **Everything is pointed at by a durable id.** `componentId` and `partOf` held *sids*, and
 *   saving strips those — so a saved deck would have come back with every part of every
 *   placement looking orphaned, and apply would have taken them all out. The same rule motion
 *   follows: a saved animation cannot be written in sids.
 */
const doc = (nodes: Record<string, Record<string, unknown>>): DeckAccess =>
  ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as DeckAccess;

/** A deck with one definition in its resources and one placement on its slide. */
const card = () =>
  doc({
    root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
    slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
    res: { sid: 'res', stype: 'resources', attributes: {}, content: ['card'] },
    card: {
      sid: 'card',
      stype: 'component',
      attributes: { id: 'card', name: '카드' },
      content: ['def-back', 'def-title']
    },
    'def-back': { sid: 'def-back', stype: 'rectangle', attributes: { partId: 'back' } },
    'def-title': { sid: 'def-title', stype: 'textFrame', attributes: { partId: 'title' } },
    one: {
      sid: 'one',
      stype: 'instance',
      attributes: { componentId: 'card', x: 1000, y: 1000 },
      content: ['one-title']
    },
    /*
     * The copy points at the original's durable name and carries none of its own: two boxes
     * claiming to *be* the same part is how a definition ends up pointing at a placement.
     */
    'one-title': { sid: 'one-title', stype: 'textFrame', attributes: { partOf: 'title' } }
  });

describe('a component and its placements', () => {
  it('is a resource, so it is not in the page sequence at all', () => {
    const access = card();
    expect(deckComponents(access).map((one) => one.id)).toEqual(['card']);
    expect(isSlideSurface(access.getNode('card') as never)).toBe(false);
    expect(isSlideSurface(access.getNode('slide') as never)).toBe(true);
  });

  it('names itself, so a list of components can be read', () => {
    expect(deckComponents(card())[0].name).toBe('카드');
  });

  it('is pointed at by a durable id, which a saved file keeps', () => {
    const access = card();
    expect(componentOf(access, access.getNode('one') as never)?.id).toBe('card');
    expect(componentOf(access, { sid: 'x', stype: 'instance', attributes: {} } as never)).toBeUndefined();
  });

  it('is not a definition at all without an id, because nothing could point at it', () => {
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['res'] },
      res: { sid: 'res', stype: 'resources', attributes: {}, content: ['nameless'] },
      nameless: { sid: 'nameless', stype: 'component', attributes: {}, content: [] }
    });
    expect(deckComponents(access)).toEqual([]);
  });

  it('pairs a placement’s parts by origin, not by role or position', () => {
    const access = card();
    const state = instanceState(access, access.getNode('one') as never, deckComponents(access)[0]);
    expect(state).toEqual([{ sid: 'one-title', origin: 'title', changed: false }]);
  });

  it('says a part has changed when it stops saying what its origin says', () => {
    // What an override *is* here: nothing declared, nothing hidden. A part a reader has moved
    // has been changed, and pretending otherwise would let apply put it back.
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      res: { sid: 'res', stype: 'resources', attributes: {}, content: ['card'] },
      card: { sid: 'card', stype: 'component', attributes: { id: 'card' }, content: ['t'] },
      t: { sid: 't', stype: 'textFrame', attributes: { partId: 'title', x: 0, y: 0 } },
      one: { sid: 'one', stype: 'instance', attributes: { componentId: 'card' }, content: ['mine'] },
      mine: { sid: 'mine', stype: 'textFrame', attributes: { partOf: 'title', x: 500, y: 0 } }
    });

    const state = instanceState(access, access.getNode('one') as never, deckComponents(access)[0]);
    expect(state[0]).toEqual({ sid: 'mine', origin: 'title', changed: true });
  });

  it('reports a part whose origin the definition has dropped', () => {
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      res: { sid: 'res', stype: 'resources', attributes: {}, content: ['card'] },
      card: { sid: 'card', stype: 'component', attributes: { id: 'card' }, content: [] },
      one: { sid: 'one', stype: 'instance', attributes: { componentId: 'card' }, content: ['gone'] },
      gone: { sid: 'gone', stype: 'rectangle', attributes: { partOf: 'was-here' } }
    });

    const state = instanceState(access, access.getNode('one') as never, deckComponents(access)[0]);
    expect(state).toEqual([{ sid: 'gone', origin: 'was-here', changed: false }]);
  });

  it('leaves a region the reader added out of the pairing entirely', () => {
    /*
     * The thing a component system that resolves children at draw time cannot do, and the
     * reason this one can: a placement holds real nodes, so a reader may add a whole frame with
     * its own children inside it — and with no origin, apply has nothing to compare and nothing
     * to overwrite.
     */
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      res: { sid: 'res', stype: 'resources', attributes: {}, content: ['card'] },
      card: { sid: 'card', stype: 'component', attributes: { id: 'card' }, content: ['t'] },
      t: { sid: 't', stype: 'textFrame', attributes: { partId: 'title' } },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card' },
        content: ['copy', 'added']
      },
      copy: { sid: 'copy', stype: 'textFrame', attributes: { partOf: 'title' } },
      added: { sid: 'added', stype: 'frame', attributes: { layoutMode: 'row' }, content: ['a'] },
      a: { sid: 'a', stype: 'ellipse', attributes: {} }
    });

    const state = instanceState(access, access.getNode('one') as never, deckComponents(access)[0]);
    expect(state).toEqual([
      { sid: 'copy', origin: 'title', changed: false },
      { sid: 'added', changed: false }
    ]);
  });

  it('still knows where its parts came from when the definition has been deleted', () => {
    /*
     * The origin is still named — the copy says so — and there is nothing to compare it
     * against, which is the honest `changed: false`. What a placement without its definition
     * needs is what it already holds, and apply is the thing that must not act on this.
     */
    const access = card();
    expect(instanceState(access, access.getNode('one') as never, undefined)).toEqual([
      { sid: 'one-title', origin: 'title', changed: false }
    ]);
  });
});

/**
 * What a node says, and what a definition says.
 *
 * Two copies of the same box have different sids and the same signature, which is what lets a
 * placement be compared with its definition without either knowing about the other.
 */
describe('signatures', () => {
  const two = doc({
    root: { sid: 'root', stype: 'document', content: [] },
    a: { sid: 'a', stype: 'rectangle', attributes: { x: 10, fill: '#fff' }, content: ['ta'] },
    ta: { sid: 'ta', stype: 'inline-text', attributes: {}, text: '값' },
    b: { sid: 'b', stype: 'rectangle', attributes: { fill: '#fff', x: 10 }, content: ['tb'] },
    tb: { sid: 'tb', stype: 'inline-text', attributes: {}, text: '값' },
    c: { sid: 'c', stype: 'rectangle', attributes: { x: 10, fill: '#000' }, content: [] },
    original: { sid: 'original', stype: 'rectangle', attributes: { x: 1, partId: 'p' } },
    copy: { sid: 'copy', stype: 'rectangle', attributes: { x: 1, partOf: 'p' } }
  });

  it('ignores identity, and the order attributes were written in', () => {
    expect(partSignature(two, 'a')).toBe(partSignature(two, 'b'));
  });

  it('does not ignore what a box says', () => {
    expect(partSignature(two, 'c')).not.toBe(partSignature(two, 'a'));
  });

  it('ignores both halves of the pairing', () => {
    // `partOf` is a fact about a copy and `partId` is the original's own name: a copy is not
    // different from its original for having one.
    expect(partSignature(two, 'copy')).toBe(partSignature(two, 'original'));
  });

  it('stops descending rather than looping for ever', () => {
    // A definition may hold a placement — a card containing a badge is the ordinary case — so
    // it may hold one of *itself*, and a signature that walked that would never return.
    const loop = doc({
      root: { sid: 'root', stype: 'document', content: [] },
      x: { sid: 'x', stype: 'frame', attributes: {}, content: ['y'] },
      y: { sid: 'y', stype: 'frame', attributes: {}, content: ['x'] }
    });
    expect(typeof partSignature(loop, 'x')).toBe('string');
  });
});

/**
 * Whether the definition has moved on.
 *
 * Not "does anything differ" — a reader who typed into a placement differs on purpose. This is
 * the question a badge answers: *there is something new to take*, which is the relationship
 * Figma has across files, where it also cannot be live.
 */
describe('a placement that has fallen behind', () => {
  const deck = (over: Record<string, unknown> = {}, said = '카드') =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      res: { sid: 'res', stype: 'resources', attributes: {}, content: ['card'] },
      card: { sid: 'card', stype: 'component', attributes: { id: 'card' }, content: ['t'] },
      t: { sid: 't', stype: 'textFrame', attributes: { partId: 'title', name: said } },
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
    expect(componentStale(access, access.getNode('one') as never, deckComponents(access)[0])).toBe(false);
  });

  it('is stale once the definition says something else', () => {
    const before = deck();
    const applied = componentSignature(before, deckComponents(before)[0]);
    const access = deck({ appliedFrom: applied }, '카드 v2');
    expect(componentStale(access, access.getNode('one') as never, deckComponents(access)[0])).toBe(true);
  });

  it('is not stale when it has never recorded one', () => {
    // A placement from before this was written. Calling every one of them stale would put a
    // badge on the whole deck and teach a reader to ignore it.
    const access = deck();
    expect(componentStale(access, access.getNode('one') as never, deckComponents(access)[0])).toBe(false);
  });

  it('is not stale when the definition is gone', () => {
    const access = deck({ appliedFrom: 'whatever' });
    expect(componentStale(access, access.getNode('one') as never, undefined)).toBe(false);
  });
});

/**
 * What apply does, and what it refuses to do — the four rules, each a decision about *whose* a
 * box is.
 */
describe('applying a definition to a placement', () => {
  const deck = (
    over: { parts?: string[]; held?: { sid: string; partOf?: string; x?: number }[] } = {}
  ) => {
    const parts = over.parts ?? ['p1', 'p2'];
    const held = over.held ?? [
      { sid: 'h1', partOf: 'p1' },
      { sid: 'h2', partOf: 'p2' }
    ];
    const nodes: Record<string, Record<string, unknown>> = {
      root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      res: { sid: 'res', stype: 'resources', attributes: {}, content: ['card'] },
      card: { sid: 'card', stype: 'component', attributes: { id: 'card' }, content: parts },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card' },
        content: held.map((part) => part.sid)
      }
    };
    for (const sid of parts) {
      // The definition's part carries its own durable name; a placement's copy points at it.
      nodes[sid] = { sid, stype: 'rectangle', attributes: { x: 0, y: 0, partId: sid } };
    }
    for (const part of held) {
      nodes[part.sid] = {
        sid: part.sid,
        stype: 'rectangle',
        attributes: { x: part.x ?? 0, y: 0, ...(part.partOf ? { partOf: part.partOf } : {}) }
      };
    }
    return doc(nodes);
  };

  const planFor = (access: DeckAccess) =>
    componentApplyPlan(access, access.getNode('one') as never, deckComponents(access)[0]);

  it('rewrites the parts that still say what the definition says', () => {
    const plan = planFor(deck())!;
    expect(plan.rewrite).toEqual([
      { sid: 'h1', from: 'p1' },
      { sid: 'h2', from: 'p2' }
    ]);
    expect(plan.remove).toEqual([]);
    expect(plan.add).toEqual([]);
  });

  it('leaves a part the reader has changed', () => {
    const plan = planFor(
      deck({ held: [{ sid: 'h1', partOf: 'p1', x: 900 }, { sid: 'h2', partOf: 'p2' }] })
    )!;
    expect(plan.rewrite.map((one) => one.sid)).toEqual(['h2']);
  });

  it('never touches a box the reader added', () => {
    const plan = planFor(deck({ held: [{ sid: 'h1', partOf: 'p1' }, { sid: 'mine' }] }))!;
    expect(plan.remove).toEqual([]);
    expect(plan.rewrite.map((one) => one.sid)).toEqual(['h1']);
    expect(plan.add).toEqual(['p2']);
  });

  it('adds what the definition has and the placement has not', () => {
    expect(planFor(deck({ held: [{ sid: 'h1', partOf: 'p1' }] }))!.add).toEqual(['p2']);
  });

  it('takes out a part whose original the definition has dropped', () => {
    // Or a definition could never lose a part: every placement would keep its copy for ever,
    // and a reader deleting something from the card would watch it stay on forty slides.
    expect(planFor(deck({ parts: ['p1'] }))!.remove).toEqual(['h2']);
  });

  it('records what the definition said, so staleness can be asked later', () => {
    const access = deck();
    expect(planFor(access)!.appliedFrom).toBe(
      componentSignature(access, deckComponents(access)[0])
    );
  });

  it('answers nothing without a definition to apply', () => {
    const access = deck();
    expect(componentApplyPlan(access, access.getNode('one') as never, undefined)).toBeUndefined();
  });

  it('copies a part with its origin written on it, and its own name taken off', () => {
    const access = deck();
    const copy = partCopy(access, 'p1')!;
    expect(copy.attributes?.partOf).toBe('p1');
    expect(copy.attributes?.partId).toBeUndefined();
  });
});

/**
 * Which surface an action lands on.
 *
 * A definition is not a page, and it *is* something a reader opens and puts shapes in — so the
 * question the insert commands ask is "can this be edited", not "is this a slide".
 */
describe('the surface an action lands on', () => {
  const deck = doc({
    root: { sid: 'root', stype: 'document', content: ['one', 'two', 'res'] },
    one: { sid: 'one', stype: 'surface', attributes: { kind: 'slide' }, content: [] },
    two: { sid: 'two', stype: 'surface', attributes: { kind: 'slide' }, content: [] },
    res: { sid: 'res', stype: 'resources', attributes: {}, content: ['card'] },
    card: { sid: 'card', stype: 'component', attributes: { id: 'card' }, content: [] }
  });

  it('takes a definition, which is what a reader opens to put shapes in', () => {
    expect(editableSurface(deck, 'card')).toBe('card');
  });

  it('takes a slide, and defaults to the deck’s first one', () => {
    expect(editableSurface(deck, 'two')).toBe('two');
    expect(editableSurface(deck)).toBe('one');
  });

  it('refuses what is neither', () => {
    expect(editableSurface(deck, 'res')).toBeUndefined();
    expect(editableSurface(deck, 'nowhere')).toBeUndefined();
  });
});
