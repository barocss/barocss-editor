import { describe, it, expect } from 'vitest';
import { deckMap } from '../src/deck-map';
import type { DeckAccess, DeckNode } from '../src/deck';

/**
 * The deck as a graph.
 *
 * A **view**: nothing here is written, there is no position on a page to keep, and a deck nobody
 * has opened the map on costs nothing. Which is what decides the shape of these tests — every
 * one of them is "given these buttons, what picture does a reader see", and none of them is about
 * state.
 */
const deck = (nodes: Record<string, DeckNode>): DeckAccess => ({
  rootId: 'doc',
  getNode: (sid) => nodes[sid]
});

/** A menu page with a button to section two, and a page nothing leads to. */
const menu = () =>
  deck({
    doc: { stype: 'document', content: ['m', 'one', 'two', 'island'] },
    m: {
      sid: 'm',
      stype: 'surface',
      attributes: { kind: 'slide', id: 'm', name: '메뉴' },
      content: ['btn', 'home']
    },
    btn: { sid: 'btn', stype: 'rectangle', attributes: { goTo: 'two' } },
    home: { sid: 'home', stype: 'rectangle', attributes: { goToKind: 'back' } },
    one: { sid: 'one', stype: 'surface', attributes: { kind: 'slide', id: 'one', name: '1부' }, content: [] },
    two: { sid: 'two', stype: 'surface', attributes: { kind: 'slide', id: 'two', name: '2부' }, content: [] },
    /*
     * Hidden **and** linked to by nothing, which is what an island really is: the show skips it
     * by design, so the only way in is a button — and there is none.
     */
    island: {
      sid: 'island',
      stype: 'surface',
      attributes: { kind: 'slide', id: 'island', name: '외딴', hidden: true },
      content: []
    }
  });

describe('the deck as a graph', () => {
  it('draws the deck’s own order as well as its buttons', () => {
    const map = deckMap(menu());
    const kinds = map.links.map((link) => `${link.from}→${link.to}:${link.kind}`);
    /*
     * The spine is drawn because a map without it is a page of islands: a reader who added two
     * buttons to a twenty-page deck should see a deck with two buttons, not two pairs of pages.
     */
    expect(kinds).toContain('m→one:flow');
    expect(kinds).toContain('one→two:flow');
    expect(kinds).toContain('m→two:jump');
  });

  it('leaves a 돌아가기 button out, because it has no edge to draw', () => {
    const map = deckMap(menu());
    // Where it goes depends on where the reader came from, which is not a fact about the deck.
    expect(map.links.some((link) => link.sid === 'home')).toBe(false);
  });

  it('places every page, including the ones no edge touches', () => {
    const map = deckMap(menu());
    // `layoutGraph` answers only about the nodes an edge touches — right for a diagram, not
    // enough for a deck: a page nothing leads to still has to be somewhere a reader can see it.
    expect(map.pages).toHaveLength(4);
    for (const page of map.pages) expect(Number.isFinite(page.x)).toBe(true);
    expect(new Set(map.pages.map((page) => `${page.x},${page.y}`)).size).toBe(4);
  });

  it('says which page nothing leads to', () => {
    const map = deckMap(menu());
    /*
     * An island is obvious in a picture and invisible in a strip, which is the whole reason the
     * map is worth drawing — and it is a **hidden** page nothing links to, not merely a page no
     * button names. Pressing on reaches the rest, which a browser test had to point out.
     */
    expect(map.pages.filter((page) => page.unreachable).map((page) => page.sid)).toEqual(['island']);
  });

  it('routes every arrow with the deck’s own router', () => {
    const map = deckMap(menu());
    // A second answer to "how does a line get from this box to that one" is how a map and a
    // slide come to disagree about the same picture.
    for (const link of map.links) expect(link.path.startsWith('M')).toBe(true);
  });

  it('says how big the picture is, so the app can fit it', () => {
    const map = deckMap(menu());
    expect(map.width).toBeGreaterThan(0);
    expect(map.height).toBeGreaterThan(0);
    for (const page of map.pages) {
      expect(page.x + page.width).toBeLessThanOrEqual(map.width);
      expect(page.y + page.height).toBeLessThanOrEqual(map.height);
    }
  });

  it('reports a button that leads nowhere, by its shape', () => {
    const broken = deck({
      doc: { stype: 'document', content: ['a', 'b'] },
      a: { sid: 'a', stype: 'surface', attributes: { kind: 'slide', id: 'a' }, content: ['btn'] },
      btn: { sid: 'btn', stype: 'rectangle', attributes: { goTo: 'gone' } },
      b: { sid: 'b', stype: 'surface', attributes: { kind: 'slide', id: 'b' }, content: [] }
    });
    expect(deckMap(broken).dead).toEqual(['btn']);
    // And no arrow for it: there is nothing to draw an arrow *to*.
    expect(deckMap(broken).links.every((link) => link.kind === 'flow')).toBe(true);
  });

  it('answers nothing for a deck with no pages', () => {
    const empty = deck({ doc: { stype: 'document', content: [] } });
    expect(deckMap(empty)).toEqual({ pages: [], links: [], width: 0, height: 0, dead: [] });
  });
});

/**
 * Where a reader takes hold of an arrow.
 *
 * A jump is moved the way a connector's end is moved — pick up the end, drop it on another page —
 * so where the arrow *arrives* is arithmetic about the route and belongs with the route. An app
 * drawing a grip "somewhere near the end" would be a second answer to where the line ends.
 */
describe('taking hold of an arrow', () => {
  it('says where each arrow arrives, inside the page it points at', () => {
    const map = deckMap(menu());
    const jump = map.links.find((link) => link.kind === 'jump');
    const target = map.pages.find((page) => page.sid === jump?.to);
    expect(jump && target).toBeTruthy();

    // On the target's outline, not at its centre: the route is clipped to the box, which is what
    // makes a grip land on the edge a reader is looking at.
    const slack = 1;
    expect(jump!.end.x).toBeGreaterThanOrEqual(target!.x - slack);
    expect(jump!.end.x).toBeLessThanOrEqual(target!.x + target!.width + slack);
    expect(jump!.end.y).toBeGreaterThanOrEqual(target!.y - slack);
    expect(jump!.end.y).toBeLessThanOrEqual(target!.y + target!.height + slack);
  });
});
