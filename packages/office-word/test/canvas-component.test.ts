import { describe, it, expect } from 'vitest';
import {
  componentOf,
  componentSignature,
  componentsOf,
  instanceValues,
  instanceVars,
  partSignature
} from '../src/canvas-component';
import type { CanvasAccess } from '../src/canvas-access';

/**
 * A component's definition, and what a placement of it is.
 *
 * In this package rather than in the deck's, and the reason is the **schema**: the office schema
 * declares `component` and `instance`, so a card is part of the document format both products read.
 * Two products answering "what does this card declare" differently would be one of them being
 * wrong, which is the rule in `docs/SHARED-LAYER.md` — and every question below can be asked
 * without the word "slide" in it, which is that document's test for a shared thing. What stayed
 * with the deck is what cannot: which surface an action lands on, and the panels.
 *
 * Two decisions, and both were arrived at by being wrong first — which is why they are worth
 * restating here rather than only in the source:
 *
 * - **A definition lives in the library, not on a page.** It was a `surface` with a kind of
 *   its own, and then every reader of the page sequence had to ask whether each page counted:
 *   the slide list, the strip, the presenter, the count. Two of them leaked before the third
 *   was written. It was then a corner of `resources`, which worked — and moved out because
 *   `resources` is hidden as a group, so showing the definition a reader had opened meant
 *   reaching past a `display: none` written to hide layouts, and un-hiding that container
 *   outright put the ruler 6px off.
 * - **Everything is pointed at by a durable id.** `componentId` and `partOf` held *sids*, and
 *   saving strips those — so a saved deck would have come back with every part of every
 *   placement looking orphaned, and apply would have taken them all out. The same rule motion
 *   follows: a saved animation cannot be written in sids.
 */
const doc = (nodes: Record<string, Record<string, unknown>>): CanvasAccess =>
  ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as CanvasAccess;

/** A deck with one definition in its library and one placement on its slide. */
const card = () =>
  doc({
    root: { sid: 'root', stype: 'document', content: ['slide', 'lib'] },
    slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
    lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
    card: {
      sid: 'card',
      stype: 'component',
      attributes: { id: 'card', name: '카드' },
      content: ['def-back', 'def-title']
    },
    'def-back': { sid: 'def-back', stype: 'rectangle', attributes: { partId: 'back' } },
    'def-title': { sid: 'def-title', stype: 'textFrame', attributes: { partId: 'title' } },
    /*
     * A placement holds **nothing**: it names a definition, and what it draws is the definition's
     * own parts (`instanceParts`). Copies were the first answer and are what a *template* is —
     * a document you copy and then own — which is a different feature (§10b-2a).
     */
    one: {
      sid: 'one',
      stype: 'instance',
      attributes: { componentId: 'card', x: 1000, y: 1000 },
      content: []
    }
  });

describe('a component and its placements', () => {
  it('is in the library, so it is not in the page sequence at all', () => {
    const access = card();
    expect(componentsOf(access).map((one) => one.id)).toEqual(['card']);
    // And it is *not* in the surfaces: a definition is a thing the document defines, beside the
    // pages rather than among them. Which page counts as one is the product's question — the deck
    // asks it in `isSlideSurface` — and this is the half that has to be true for it to work.
    expect(access.getNode('card')?.stype).toBe('component');
  });

  it('names itself, so a list of components can be read', () => {
    expect(componentsOf(card())[0].name).toBe('카드');
  });

  it('is pointed at by a durable id, which a saved file keeps', () => {
    const access = card();
    expect(componentOf(access, access.getNode('one') as never)?.id).toBe('card');
    expect(componentOf(access, { sid: 'x', stype: 'instance', attributes: {} } as never)).toBeUndefined();
  });

  it('is not a definition at all without an id, because nothing could point at it', () => {
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['lib'] },
      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['nameless'] },
      nameless: { sid: 'nameless', stype: 'component', attributes: {}, content: [] }
    });
    expect(componentsOf(access)).toEqual([]);
  });
});

describe('what a placement can be asked for', () => {
  const carded = () =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'lib'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
      card: {
        sid: 'card',
        stype: 'component',
        attributes: { id: 'card', name: '카드' },
        content: ['v-title', 'v-badge', 'def-back']
      },
      'v-title': {
        sid: 'v-title',
        stype: 'componentVar',
        attributes: { name: 'title', label: '제목', value: '제목을 쓰세요' }
      },
      'v-badge': {
        sid: 'v-badge',
        stype: 'componentVar',
        attributes: { name: 'badge', kind: 'boolean', value: 'true' }
      },
      'def-back': { sid: 'def-back', stype: 'rectangle', attributes: { partId: 'back' } },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card' },
        content: ['said']
      },
      said: { sid: 'said', stype: 'componentValue', attributes: { name: 'title', value: '매출' } }
    });

  it('declares its variables in order, and reads them as fields', () => {
    const [card] = componentsOf(carded());
    expect(card.vars.map((one) => [one.name, one.kind, one.label])).toEqual([
      ['title', 'text', '제목'],
      // No label of its own: the name, so a panel always has something to write beside the
      // field rather than an empty gutter.
      ['badge', 'boolean', 'badge']
    ]);
  });

  it('does not count a declaration as a part', () => {
    // A declaration is not something a placement draws, so counting it would put an empty box
    // on the slide for every variable the card takes.
    const access = carded();
    const [card] = componentsOf(access);
    expect(card.parts).toEqual(['def-back']);
  });

  it('answers with the placement’s value, and with the default when it said nothing', () => {
    const access = carded();
    const said = instanceVars(access, access.getNode('one') as never, componentsOf(access)[0]);
    expect(said.map((one) => [one.name, one.value, one.set])).toEqual([
      ['title', '매출', true],
      // Every declared variable comes back whether the placement mentions it or not: a field
      // that appears only once a value exists is a field a reader cannot set the first one in.
      ['badge', 'true', false]
    ]);
  });

  it('is behind when the declaration changes, not only when the drawing does', () => {
    const access = carded();
    const before = componentSignature(access, componentsOf(access)[0]);
    (access.getNode('v-title') as never as { attributes: Record<string, unknown> }).attributes = {
      name: 'title',
      label: '제목',
      value: '다른 기본값'
    };
    // A placement's fields come from the declaration, so leaving it out of the signature would
    // let the panel go quietly out of date while the badge said everything was current.
    expect(componentSignature(access, componentsOf(access)[0])).not.toBe(before);
  });
});

describe('signatures', () => {
  const two = doc({
    root: { sid: 'root', stype: 'document', content: [] },
    a: { sid: 'a', stype: 'rectangle', attributes: { x: 10, fill: '#fff' }, content: ['ta'] },
    ta: { sid: 'ta', stype: 'inline-text', attributes: {}, text: '값' },
    b: { sid: 'b', stype: 'rectangle', attributes: { fill: '#fff', x: 10 }, content: ['tb'] },
    tb: { sid: 'tb', stype: 'inline-text', attributes: {}, text: '값' },
    c: { sid: 'c', stype: 'rectangle', attributes: { x: 10, fill: '#000' }, content: [] },
    named: { sid: 'named', stype: 'rectangle', attributes: { x: 1, partId: 'p' } },
    unnamed: { sid: 'unnamed', stype: 'rectangle', attributes: { x: 1 } }
  });

  it('ignores identity, and the order attributes were written in', () => {
    expect(partSignature(two, 'a')).toBe(partSignature(two, 'b'));
  });

  it('does not ignore what a box says', () => {
    expect(partSignature(two, 'c')).not.toBe(partSignature(two, 'a'));
  });

  it('ignores the name a part is given', () => {
    /*
     * A part's `partId` is how the *deck* refers to it, not something it says about itself — and
     * the one question left for signatures is the brand kit's: whether this deck's copy of a
     * definition still says what the library's copy says. Two libraries that named the same part
     * differently would otherwise look like two different cards.
     */
    expect(partSignature(two, 'unnamed')).toBe(partSignature(two, 'named'));
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
