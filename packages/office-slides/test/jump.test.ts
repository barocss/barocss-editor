import { describe, it, expect } from 'vitest';
import { deckJumps, jumpFaults, jumpOf, jumpTarget, jumpsOn, slideById } from '../src/jump';
import type { DeckAccess, DeckNode } from '../src/deck';

/**
 * A deck that is **not a line**.
 *
 * Everything a jump answers is a question about the document — which shapes are buttons, where
 * each leads, whether it still exists, which pages nothing reaches — so all of it is here, in
 * milliseconds, and the show is left with one job: when a press lands on a button, go where it
 * says.
 *
 * The click itself was already there and was measured before any of this was written:
 * `present.tsx` collects the shapes whose press runs something and already has the rule a jump
 * needs — *a press that fires a trigger does not also advance the deck* — written when a build
 * could be triggered, with the reason that a quiz answer must not advance past its own tick.
 */
const deck = (nodes: Record<string, DeckNode>, rootId = 'doc'): DeckAccess => ({
  rootId,
  getNode: (sid) => nodes[sid]
});

/** A menu page with three buttons, two sections, and a hidden appendix. */
const menuDeck = () =>
  deck({
    doc: { stype: 'document', content: ['menu', 'one', 'two', 'extra'] },
    menu: {
      sid: 'menu',
      stype: 'surface',
      attributes: { kind: 'slide', id: 'menu', name: '메뉴' },
      content: ['group']
    },
    // Inside a group, because a menu of sections is exactly that — and a walk that stopped at
    // the page's own children would have found none of them.
    group: { sid: 'group', stype: 'group', attributes: {}, content: ['b1', 'b2', 'b3'] },
    b1: { sid: 'b1', stype: 'rectangle', attributes: { goTo: 'one', parentId: 'group' } },
    b2: { sid: 'b2', stype: 'rectangle', attributes: { goTo: 'two' } },
    // A kind with no page to name.
    b3: { sid: 'b3', stype: 'rectangle', attributes: { goToKind: 'last' } },
    one: {
      sid: 'one',
      stype: 'surface',
      attributes: { kind: 'slide', id: 'one', name: '1부' },
      content: ['back1']
    },
    back1: { sid: 'back1', stype: 'rectangle', attributes: { goToKind: 'back' } },
    two: {
      sid: 'two',
      stype: 'surface',
      attributes: { kind: 'slide', id: 'two', name: '2부' },
      content: []
    },
    extra: {
      sid: 'extra',
      stype: 'surface',
      attributes: { kind: 'slide', id: 'extra', name: '부록', hidden: true },
      content: []
    }
  });

describe('what a button says', () => {
  it('is nothing at all for a shape that says nothing', () => {
    const doc = menuDeck();
    expect(jumpOf(doc, { sid: 'x', stype: 'rectangle', attributes: {} })).toBeUndefined();
  });

  it('names a page by its durable id, and says where that page is now', () => {
    const doc = menuDeck();
    const jump = jumpOf(doc, doc.getNode('b1'));
    // The id is what the document holds; the sid is where it happens to be this session — which
    // is the whole reason a page needed a durable id before any of this could work.
    expect(jump).toEqual({ sid: 'b1', kind: 'page', to: 'one', toSid: 'one' });
  });

  it('is not a jump when it points at a page the deck no longer has', () => {
    const doc = menuDeck();
    const gone = jumpOf(doc, { sid: 'b9', stype: 'rectangle', attributes: { goTo: 'deleted' } });
    // Still a jump — a button a reader made and meant — with nothing to go to. Reported as a
    // fault rather than silently dropped, because a button that does nothing on stage is the
    // fault this whole check exists for.
    expect(gone).toEqual({ sid: 'b9', kind: 'page', to: 'deleted', toSid: undefined });
  });

  it('takes a kind with no page to name, and refuses a kind it does not know', () => {
    const doc = menuDeck();
    expect(jumpOf(doc, doc.getNode('b3'))?.kind).toBe('last');
    expect(
      jumpOf(doc, { sid: 'z', stype: 'rectangle', attributes: { goToKind: 'sideways' } })
    ).toBeUndefined();
  });

  it('finds the buttons inside containers, and lists the deck’s', () => {
    const doc = menuDeck();
    expect(jumpsOn(doc, 'menu').map((one) => one.sid)).toEqual(['b1', 'b2', 'b3']);
    expect(deckJumps(doc).map((one) => `${one.from}→${one.kind}`)).toEqual([
      'menu→page',
      'menu→page',
      'menu→last',
      'one→back'
    ]);
  });
});

describe('where a press goes', () => {
  const doc = menuDeck();

  it('goes to the page a button names', () => {
    expect(jumpTarget(doc, jumpOf(doc, doc.getNode('b1')), { at: 'menu' })).toBe('one');
  });

  it('walks the deck for the ones with no page to name', () => {
    const last = jumpOf(doc, doc.getNode('b3'));
    // The pages a show moves through: the deck less what it skips, so 끝 is not the hidden
    // appendix — the same rule the presenter's own stepping follows.
    expect(jumpTarget(doc, last, { at: 'menu' })).toBe('two');
    expect(jumpTarget(doc, { sid: 'n', kind: 'next' }, { at: 'menu' })).toBe('one');
    expect(jumpTarget(doc, { sid: 'p', kind: 'previous' }, { at: 'one' })).toBe('menu');
    expect(jumpTarget(doc, { sid: 'f', kind: 'first' }, { at: 'two' })).toBe('menu');
  });

  it('stops at the ends rather than wrapping round', () => {
    // A deck is not a carousel: a button that quietly went back to the start would be a
    // reader's talk starting again in front of an audience.
    expect(jumpTarget(doc, { sid: 'n', kind: 'next' }, { at: 'two' })).toBeUndefined();
    expect(jumpTarget(doc, { sid: 'p', kind: 'previous' }, { at: 'menu' })).toBeUndefined();
  });

  it('goes back to where the reader came from, not to the page before', () => {
    /*
     * The distinction the whole `back` kind exists for: a reader who jumped from the menu to
     * section two means *the menu*, and the page before section two in the deck is section one.
     * Which is why history is passed in and is not in the document.
     */
    expect(
      jumpTarget(doc, jumpOf(doc, doc.getNode('back1')), { at: 'two', history: ['menu', 'two'] })
    ).toBe('menu');
    // And nothing to go back to is nothing, not the first page.
    expect(jumpTarget(doc, { sid: 'b', kind: 'back' }, { at: 'menu', history: ['menu'] })).toBeUndefined();
  });

  it('answers nothing for a page that is gone', () => {
    expect(jumpTarget(doc, { sid: 'x', kind: 'page', to: 'deleted' }, { at: 'menu' })).toBeUndefined();
    expect(slideById(doc, 'deleted')).toBeUndefined();
    expect(slideById(doc, 'two')).toBe('two');
  });
});

describe('what is wrong with a deck’s links', () => {
  it('says nothing about a deck with no links at all', () => {
    // In a linear deck every page is reached by pressing on, and reporting all of them would be
    // this telling a reader off for making an ordinary deck.
    const linear = deck({
      doc: { stype: 'document', content: ['a', 'b'] },
      a: { sid: 'a', stype: 'surface', attributes: { kind: 'slide' }, content: [] },
      b: { sid: 'b', stype: 'surface', attributes: { kind: 'slide' }, content: [] }
    });
    expect(jumpFaults(linear)).toEqual([]);
  });

  it('finds a button that points at a page the deck no longer has', () => {
    const broken = deck({
      doc: { stype: 'document', content: ['a', 'b'] },
      a: { sid: 'a', stype: 'surface', attributes: { kind: 'slide', id: 'a' }, content: ['btn'] },
      btn: { sid: 'btn', stype: 'rectangle', attributes: { goTo: 'gone' } },
      b: { sid: 'b', stype: 'surface', attributes: { kind: 'slide', id: 'b' }, content: [] }
    });
    const faults = jumpFaults(broken);
    expect(faults.find((one) => one.kind === 'dead-jump')).toEqual({
      kind: 'dead-jump',
      slideSid: 'a',
      sid: 'btn',
      to: 'gone'
    });
  });

  /**
   * The island is a **hidden** page nothing links to, and the first rule here was wrong.
   *
   * It said "once a deck has a button, every page must be named by something", and a browser test
   * found what that means in a real deck: adding one button to the sample reported five of its six
   * pages as unreachable. Nonsense — **pressing on still reaches them.** A deck with buttons is
   * not automatically a deck that is only buttons; Keynote has a mode for that and this product
   * does not yet, so the order is alive whatever else is in the deck.
   *
   * What is left is the real fault: a page the show *skips by design* that nothing links to — kept
   * for the questions afterwards and never wired up.
   */
  it('does not call a page unreachable just because the deck has a button', () => {
    const linearWithButton = deck({
      doc: { stype: 'document', content: ['menu', 'one', 'plain'] },
      menu: { sid: 'menu', stype: 'surface', attributes: { kind: 'slide', id: 'menu' }, content: ['b'] },
      b: { sid: 'b', stype: 'rectangle', attributes: { goTo: 'one' } },
      one: { sid: 'one', stype: 'surface', attributes: { kind: 'slide', id: 'one' }, content: [] },
      plain: { sid: 'plain', stype: 'surface', attributes: { kind: 'slide', id: 'plain' }, content: [] }
    });
    expect(jumpFaults(linearWithButton)).toEqual([]);
  });

  it('finds a hidden page nothing links to', () => {
    const kept = deck({
      doc: { stype: 'document', content: ['menu', 'extra', 'lost'] },
      menu: { sid: 'menu', stype: 'surface', attributes: { kind: 'slide', id: 'menu' }, content: ['b'] },
      b: { sid: 'b', stype: 'rectangle', attributes: { goTo: 'extra' } },
      // Skipped by the show and linked to: a page for the questions afterwards, wired up.
      extra: {
        sid: 'extra',
        stype: 'surface',
        attributes: { kind: 'slide', id: 'extra', hidden: true },
        content: []
      },
      // Skipped by the show and linked to by nothing: the real island.
      lost: {
        sid: 'lost',
        stype: 'surface',
        attributes: { kind: 'slide', id: 'lost', hidden: true },
        content: []
      }
    });
    expect(jumpFaults(kept).filter((one) => one.kind === 'unreachable')).toEqual([
      { kind: 'unreachable', slideSid: 'lost' }
    ]);
  });
});

/**
 * A button into **another deck**.
 *
 * A deck of a hundred slides is really four decks, and the link between them is the thing every
 * other tool makes you fake — export to one file, or paste the pages in and let them go stale.
 *
 * What this file can and cannot say about one is the whole design: `goTo` is a page in *that*
 * document, so nothing here resolves it, and the deck's own check **warns** rather than telling.
 * Answering a question that is not in the model is exactly what a check must not do.
 */
describe('a button into another deck', () => {
  const away = () =>
    deck({
      doc: { stype: 'document', content: ['a', 'b'] },
      a: {
        sid: 'a',
        stype: 'surface',
        attributes: { kind: 'slide', id: 'a' },
        content: ['out', 'in']
      },
      out: {
        sid: 'out',
        stype: 'rectangle',
        attributes: { goToDeck: '/decks/pricing.slides.json', goTo: 'plans' }
      },
      in: { sid: 'in', stype: 'rectangle', attributes: { goTo: 'b' } },
      b: { sid: 'b', stype: 'surface', attributes: { kind: 'slide', id: 'b' }, content: [] }
    });

  it('says where the other document is, and does not pretend to resolve the page', () => {
    const jump = jumpOf(away(), away().getNode('out'));
    expect(jump).toEqual({
      sid: 'out',
      kind: 'page',
      to: 'plans',
      deck: '/decks/pricing.slides.json'
    });
    // No `toSid`: another document is not in this one. A button whose page *is* here still gets
    // one, which is what keeps the two cases apart everywhere downstream.
    expect(jumpOf(away(), away().getNode('in'))?.toSid).toBe('b');
  });

  it('goes nowhere in this deck, because the page is not in it', () => {
    // The show is what opens another document; the model's answer is honestly nothing.
    expect(jumpTarget(away(), jumpOf(away(), away().getNode('out')), { at: 'a' })).toBeUndefined();
  });

  it('is a thing to look at, not a dead button', () => {
    const faults = jumpFaults(away());
    // The page may well be there. Calling it dead would be this check answering a question it
    // cannot ask — and a reader who then deleted the button would lose a working link.
    expect(faults.find((one) => one.kind === 'dead-jump')).toBeUndefined();
    expect(faults.find((one) => one.kind === 'away')).toEqual({
      kind: 'away',
      slideSid: 'a',
      sid: 'out',
      to: '/decks/pricing.slides.json'
    });
  });
});
